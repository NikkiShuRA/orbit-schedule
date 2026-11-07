// SPDX-FileCopyrightText: 2026 Orbit contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

package sieup

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"time"
)

// Base is one address of the API and how provenance should name it.
type Base struct {
	URL  string
	Name string
}

// DefaultBases are the API addresses, tried in order.
//
// The main address is the institute's own. Since November 2026 it is down
// together with the institute's hosting, and the institute raised a
// temporary backup mirror in a hurry. The mirror is a stopgap, not a
// second home of the API: it may lag behind, change or disappear once
// the main site is back. So:
//   - the main address always stays first, and the connector switches
//     back to it by itself as soon as it answers;
//   - data from the mirror is named as such in provenance, so the app and
//     the git history show where every file came from;
//   - addresses can be replaced with --base without changing code.
var DefaultBases = []Base{
	{URL: "https://sielom.ru/schedule/api", Name: "API расписания СИЭУиП"},
	{URL: "https://timetable.sieup.ru/api", Name: "API расписания СИЭУиП, временное резервное зеркало"},
}

// CustomBaseName names an address given by hand (orbit fetch --base) in
// provenance: Orbit cannot vouch for it, so it says only that much.
const CustomBaseName = "API расписания СИЭУиП (адрес задан вручную)"

// UserAgent identifies Orbit to the source.
const UserAgent = "OrbitSchedule (+https://github.com/NikkiShuRA/orbit-schedule)"

// Client talks to the SIEUiP API. Create it with NewClient.
type Client struct {
	Bases []Base
	HTTP  *http.Client

	last int // index of the base that answered last, or -1
}

// NewClient returns a client for the given addresses, or DefaultBases if
// none are given.
//
// Timeouts: connecting must succeed within 5 seconds, so a dead address
// (it does not answer at all) is given up quickly; a live but slow API
// still has 20 seconds for the whole request.
func NewClient(bases ...Base) *Client {
	if len(bases) == 0 {
		bases = DefaultBases
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.DialContext = (&net.Dialer{Timeout: 5 * time.Second}).DialContext
	transport.TLSHandshakeTimeout = 5 * time.Second
	return &Client{
		Bases: bases,
		HTTP:  &http.Client{Timeout: 20 * time.Second, Transport: transport},
		last:  -1,
	}
}

// Base returns the address that answered the last request.
func (c *Client) Base() Base {
	if c.last < 0 {
		return Base{}
	}
	return c.Bases[c.last]
}

// get fetches path from the first base that answers and decodes JSON
// into out. The base that answered is tried first for the next requests
// of this run, so a dead base costs one timeout per run, not one per
// request. Every new run starts from the main address again.
func (c *Client) get(ctx context.Context, path string, out any) error {
	order := make([]int, 0, len(c.Bases))
	if c.last >= 0 {
		order = append(order, c.last)
	}
	for i := range c.Bases {
		if i != c.last {
			order = append(order, i)
		}
	}

	var errs []error
	for _, i := range order {
		err := c.getFrom(ctx, c.Bases[i].URL+path, out)
		if err == nil {
			c.last = i
			return nil
		}
		errs = append(errs, fmt.Errorf("%s: %w", c.Bases[i].URL, err))
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
