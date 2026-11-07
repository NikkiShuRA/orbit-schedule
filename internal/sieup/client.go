package sieup

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// DefaultBases are the API addresses, tried in order. The second one is
// an official mirror with the same data and ids.
var DefaultBases = []string{
	"https://sielom.ru/schedule/api",
	"https://timetable.sieup.ru/api",
}

// UserAgent identifies Orbit to the source.
const UserAgent = "OrbitSchedule (+https://github.com/NikkiShuRA/orbit-schedule)"

// Client talks to the SIEUiP API. The zero value is not usable; use
// NewClient.
type Client struct {
	Bases []string
	HTTP  *http.Client

	base string // the base that answered last; tried first next time
}

// NewClient returns a client with the default addresses and a timeout
// long enough for a slow API but short enough to give up on a dead one.
func NewClient() *Client {
	return &Client{
		Bases: DefaultBases,
		HTTP:  &http.Client{Timeout: 20 * time.Second},
	}
}

// Base returns the address that answered the last request.
func (c *Client) Base() string { return c.base }

// get fetches path from the first base that answers and decodes JSON
// into out. Once a base answers, it is tried first for later requests,
// so a dead base costs one timeout per run, not one per request.
func (c *Client) get(ctx context.Context, path string, out any) error {
	order := make([]string, 0, len(c.Bases))
	if c.base != "" {
		order = append(order, c.base)
	}
	for _, b := range c.Bases {
		if b != c.base {
			order = append(order, b)
		}
	}

	var errs []error
	for _, base := range order {
		err := c.getFrom(ctx, base+path, out)
		if err == nil {
			c.base = base
			return nil
		}
		errs = append(errs, fmt.Errorf("%s: %w", base, err))
		if ctx.Err() != nil {
			break // cancelled: other bases will not help
		}
	}
	return errors.Join(errs...)
}

func (c *Client) getFrom(ctx context.Context, u string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", UserAgent)

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close() // always release the connection

	if resp.StatusCode != http.StatusOK {
		io.Copy(io.Discard, resp.Body)
		return fmt.Errorf("HTTP %d", resp.StatusCode)
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("decode JSON: %w", err)
	}
	return nil
}

func (c *Client) divisions(ctx context.Context) ([]division, error) {
	var v []division
	return v, c.get(ctx, "/divisions", &v)
}

// weekAt returns the week that contains date ("YYYY-MM-DD").
func (c *Client) weekAt(ctx context.Context, date string) (week, error) {
	var v []week
	if err := c.get(ctx, "/weeks/date/"+date, &v); err != nil {
		return week{}, err
	}
	if len(v) == 0 {
		return week{}, fmt.Errorf("%w: no week contains %s", ErrNotPublished, date)
	}
	return v[0], nil
}

// lessons returns the lessons of one building for one week. The API
// finds the building by name, not by id.
func (c *Client) lessons(ctx context.Context, divisionName, weekID string) ([]lesson, error) {
	q := url.Values{"divisionName": {divisionName}, "week_id": {weekID}}
	var v []lesson
	return v, c.get(ctx, "/lessons/division?"+q.Encode(), &v)
}
