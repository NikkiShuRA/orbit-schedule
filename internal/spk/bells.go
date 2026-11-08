// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

package spk

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"

	"github.com/NikkiShuRA/orbit-schedule/internal/standard"
)

// DefaultSite is the college's schedule site. The API has no times; the
// site shows the start of each period from a list in its own code.
const DefaultSite = "https://schedule.surpk.ru"

// BellScheduleName says where the bell schedule comes from, so the app
// can tell students that the time is the site's, not the lesson's.
const BellScheduleName = "Начало пар по сайту расписания schedule.surpk.ru"

var (
	// bundle finds the site's script in its page: /assets/index-<hash>.js.
	bundle = regexp.MustCompile(`src="(/assets/index-[A-Za-z0-9_-]+\.js)"`)
	// startTimes finds the list of period starts in the script, for
	// example lessons:["8:30","10:00",...]. The name is the site's.
	startTimes = regexp.MustCompile(`lessons:\[((?:"\d{1,2}:\d{2}",?)+)\]`)
	clock      = regexp.MustCompile(`^(\d{1,2}):(\d{2})$`)
)

// maxBundle caps how much of the script is read: it is about 170 KB.
const maxBundle = 5 << 20

// bells reads the start times of periods from the schedule site.
//
// This is the only place the college shows them, and the college's own
// regulation on class hours does not match them (see #12), so they are
// published as what they are: the site's list, without end times. If the
// site changes and the list is not found, there is no bell schedule; the
// lessons themselves never get times from it.
func (c *Client) bells(ctx context.Context) (standard.BellSchedule, error) {
	page, err := c.text(ctx, c.Site+"/")
	if err != nil {
		return standard.BellSchedule{}, err
	}
	m := bundle.FindStringSubmatch(page)
	if m == nil {
		return standard.BellSchedule{}, errors.New("no script found on the schedule site")
	}
	script, err := c.text(ctx, c.Site+m[1])
	if err != nil {
		return standard.BellSchedule{}, err
	}
	return parseBells(script)
}

// parseBells finds exactly one list of start times in the site's script
// and turns it into a bell schedule. Period numbers start at 1, as in
// the lessons. Times only get a leading zero ("8:30" → "08:30"), which
// the standard's format requires; the value stays the same.
func parseBells(script string) (standard.BellSchedule, error) {
	found := startTimes.FindAllStringSubmatch(script, -1)
	if len(found) != 1 {
		return standard.BellSchedule{}, fmt.Errorf("want one list of period start times in the site's script, found %d", len(found))
	}
	var periods []standard.BellPeriod
	for i, s := range strings.Split(found[0][1], ",") {
		s = strings.Trim(s, `"`)
		if s == "" {
			continue // a trailing comma
		}
		m := clock.FindStringSubmatch(s)
		if m == nil {
			return standard.BellSchedule{}, fmt.Errorf("bad time %q", s)
		}
		t := fmt.Sprintf("%02s:%s", m[1], m[2])
		if t > "23:59" || m[2] > "59" {
			return standard.BellSchedule{}, fmt.Errorf("bad time %q", s)
		}
		periods = append(periods, standard.BellPeriod{Period: i + 1, Start: t})
	}
	return standard.BellSchedule{ID: "site", Name: BellScheduleName, Periods: periods}, nil
}

// text fetches a page of the site as text.
func (c *Client) text(ctx context.Context, u string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", UserAgent)
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		io.Copy(io.Discard, resp.Body)
		return "", fmt.Errorf("%s: HTTP %d", u, resp.StatusCode)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxBundle))
	if err != nil {
		return "", fmt.Errorf("%s: %w", u, err)
	}
	return string(data), nil
}
