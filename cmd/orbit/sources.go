// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

package main

import (
	"context"
	"errors"
	"fmt"

	"github.com/NikkiShuRA/orbit-schedule/internal/sieup"
	"github.com/NikkiShuRA/orbit-schedule/internal/spk"
	"github.com/NikkiShuRA/orbit-schedule/internal/standard"
)

// sourceNames are the sources orbit fetch knows, in the order of usage.
var sourceNames = []string{sieup.Name, spk.Name}

// source is what fetch needs from a connector. Connectors stay separate
// packages with their own clients; this small struct is the only place
// where the command knows about each of them.
type source struct {
	name     string
	timeZone string
	// fetch returns the week that contains day ("YYYY-MM-DD").
	fetch func(ctx context.Context, day string) (*standard.Document, error)
	// notPublished is the connector's "this week is not published yet".
	notPublished error
}

// newSource builds the source called name. bases are the addresses given
// with --base, if any. The client is created once and shared by all
// weeks of a run: the SIEUiP client remembers which address answered.
func newSource(name string, bases []string, site string, warn func(string)) (source, error) {
	switch name {
	case sieup.Name:
		if site != "" {
			return source{}, errors.New("--site: only spk has a schedule site to read")
		}
		var bs []sieup.Base
		for _, u := range bases {
			bs = append(bs, sieup.Base{URL: u, Name: sieup.CustomBaseName})
		}
		c := sieup.NewClient(bs...)
		return source{
			name:         sieup.Name,
			timeZone:     sieup.TimeZone,
			fetch:        func(ctx context.Context, day string) (*standard.Document, error) { return sieup.Fetch(ctx, c, day) },
			notPublished: sieup.ErrNotPublished,
		}, nil
	case spk.Name:
		// SPK has a single address and no mirror, so only one --base.
		var b spk.Base
		switch len(bases) {
		case 0:
		case 1:
			b = spk.Base{URL: bases[0], Name: spk.CustomBaseName}
		default:
			return source{}, errors.New("--base: spk takes one address")
		}
		c := spk.NewClient(b)
		c.Warn = warn
		if site != "" {
			c.Site = site
		}
		return source{
			name:         spk.Name,
			timeZone:     spk.TimeZone,
			fetch:        func(ctx context.Context, day string) (*standard.Document, error) { return spk.Fetch(ctx, c, day) },
			notPublished: spk.ErrNotPublished,
		}, nil
	}
	return source{}, fmt.Errorf("unknown source %q", name)
}
