// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

package spk

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

// Base is the address of the API and how provenance should name it.
type Base struct {
	URL  string
	Name string
}

// DefaultBase is the college's own API, the one its schedule site uses.
var DefaultBase = Base{URL: "https://surpk.ru/api/schedule", Name: "API расписания СПК"}

// CustomBaseName names an address given by hand (orbit fetch --base) in
// provenance: Orbit cannot vouch for it, so it says only that much.
const CustomBaseName = "API расписания СПК (адрес задан вручную)"

// UserAgent identifies Orbit to the source.
const UserAgent = "OrbitSchedule (+https://github.com/NikkiShuRA/orbit-schedule)"

// Client talks to the SPK API. Create it with NewClient.
//
// The client only reads. The API also has a call that asks the server to
// reload the schedule from 1C; Orbit never calls it, because it changes
// the state of the source.
type Client struct {
	Base Base
	HTTP *http.Client
}

// NewClient returns a client for base, or DefaultBase if base is zero.
//
// The responses are large (about 1 MB of reference lists and 3 MB of
// lessons), so the whole request gets 60 seconds; connecting must still
// succeed within 5.
func NewClient(base Base) *Client {
	if base.URL == "" {
		base = DefaultBase
	}
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.DialContext = (&net.Dialer{Timeout: 5 * time.Second}).DialContext
	transport.TLSHandshakeTimeout = 5 * time.Second
	return &Client{
		Base: base,
		HTTP: &http.Client{Timeout: 60 * time.Second, Transport: transport},
	}
}

func (c *Client) get(ctx context.Context, path string, out any) error {
	u := c.Base.URL + path
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
		return fmt.Errorf("%s: HTTP %d", u, resp.StatusCode)
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("%s: decode JSON: %w", u, err)
	}
	return nil
}

// reference returns the reference lists: groups, teachers, rooms and so
// on, for the whole college.
func (c *Client) reference(ctx context.Context) (reference, error) {
	var v indexResponse
	if err := c.get(ctx, "/index", &v); err != nil {
		return reference{}, err
	}
	if !v.Success || v.BaseInfo.Error != "" {
		return reference{}, fmt.Errorf("source reported an error: %q", v.BaseInfo.Error)
	}
	return v.BaseInfo.Data, nil
}

// days returns the lessons the API has around the moment at: it answers
// with the previous, the current and the next week, but only those that
// are published.
func (c *Client) days(ctx context.Context, at time.Time) ([]day, error) {
	q := url.Values{"date": {strconv.FormatInt(at.UnixMilli(), 10)}}
	var v scheduleResponse
	if err := c.get(ctx, "/schedule?"+q.Encode(), &v); err != nil {
		return nil, err
	}
	if !v.Success || v.Schedule.Error != "" {
		return nil, fmt.Errorf("source reported an error: %q", v.Schedule.Error)
	}
	return v.Schedule.Data.Days, nil
}
