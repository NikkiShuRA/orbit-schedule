// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// Command orbit fetches schedules from sources and writes them as Orbit
// standard documents.
//
//	orbit fetch sieup|spk --out data [--date 2026-11-09] [--weeks 2]
//	orbit slice --in data --out site/data
//	orbit validate file.json...
//
// Exit codes: 0 ok, 1 error, 2 bad usage, 3 none of the requested weeks
// is published yet.
package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"slices"
	"strings"
	"time"
	_ "time/tzdata" // embed time zones: the binary must work where the OS has none (Windows, minimal containers)

	"github.com/NikkiShuRA/orbit-schedule/internal/standard"
)

const (
	exitError        = 1
	exitUsage        = 2
	exitNotPublished = 3
)

func main() {
	// Ctrl+C cancels the context, which aborts in-flight HTTP requests.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	os.Exit(run(ctx, os.Args[1:], os.Stdout, os.Stderr))
}

// run holds the whole program so it can be tested without os.Exit.
func run(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 {
		usage(stderr)
		return exitUsage
	}
	switch args[0] {
	case "fetch":
		return fetch(ctx, args[1:], stdout, stderr)
	case "slice":
		return sliceCmd(args[1:], stdout, stderr)
	case "validate":
		return validate(args[1:], stdout, stderr)
	default:
		usage(stderr)
		return exitUsage
	}
}

func usage(w io.Writer) {
	fmt.Fprintln(w, "usage:")
	fmt.Fprintln(w, "  orbit fetch sieup|spk --out DIR [--date YYYY-MM-DD] [--weeks N] [--base URL]...")
	fmt.Fprintln(w, "  orbit slice --in DIR --out DIR [--from YYYY-MM-DD]")
	fmt.Fprintln(w, "  orbit validate FILE...")
}

func fetch(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 || !slices.Contains(sourceNames, args[0]) {
		fmt.Fprintf(stderr, "unknown source; available: %s\n", strings.Join(sourceNames, ", "))
		return exitUsage
	}
	name := args[0]
	fs := flag.NewFlagSet("fetch", flag.ContinueOnError)
	fs.SetOutput(stderr)
	out := fs.String("out", "", "output directory (required)")
	date := fs.String("date", "", "any date of the first week to fetch, YYYY-MM-DD (default: today in the institution's time zone)")
	weeks := fs.Int("weeks", 1, "how many weeks to fetch, starting from --date (1-4)")
	// --base may be given several times; the addresses are tried in
	// order. flag.Func calls the function once per occurrence.
	var bases []string
	fs.Func("base", "API address to use instead of the built-in ones; sieup takes several, tried in order", func(s string) error {
		u, err := url.Parse(s)
		if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
			return fmt.Errorf("want an http(s) URL, got %q", s)
		}
		bases = append(bases, strings.TrimRight(s, "/"))
		return nil
	})
	if err := fs.Parse(args[1:]); err != nil {
		return exitUsage
	}
	if *out == "" {
		fmt.Fprintln(stderr, "--out is required")
		return exitUsage
	}
	if *weeks < 1 || *weeks > 4 {
		fmt.Fprintf(stderr, "--weeks: want 1 to 4, got %d\n", *weeks)
		return exitUsage
	}
	src, err := newSource(name, bases)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return exitUsage
	}
	loc, err := time.LoadLocation(src.timeZone)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return exitError
	}
	first := time.Now().In(loc)
	if *date != "" {
		if first, err = time.ParseInLocation(time.DateOnly, *date, loc); err != nil {
			fmt.Fprintf(stderr, "--date: want YYYY-MM-DD, got %q\n", *date)
			return exitUsage
		}
	}

	dir := filepath.Join(*out, src.name)
	st := status{Source: src.name}
	published := 0
	for i := range *weeks {
		day := first.AddDate(0, 0, 7*i).Format(time.DateOnly)
		res, err := fetchWeek(ctx, src, dir, day, stdout, stderr)
		if err != nil {
			// Stop without writing the status: a failed run must not look
			// like a fresh check. Files already written are complete and
			// valid, so they may stay.
			fmt.Fprintf(stderr, "week of %s: %v\n", day, err)
			return exitError
		}
		if res.Result != resultNotPublished {
			published++
		}
		st.Weeks = append(st.Weeks, res)
	}

	st.CheckedAt = time.Now().In(loc).Format(time.RFC3339)
	if err := writeJSON(filepath.Join(dir, statusFile), st); err != nil {
		fmt.Fprintln(stderr, err)
		return exitError
	}
	if published == 0 {
		return exitNotPublished
	}
	return 0
}

// writeFileAtomic writes to a temporary file and renames it, so readers
// never see a half-written file even if the program is killed midway.
func writeFileAtomic(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".tmp-*.json")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name()) // no-op after a successful rename
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmp.Name(), path)
}

func validate(files []string, stdout, stderr io.Writer) int {
	if len(files) == 0 {
		usage(stderr)
		return exitUsage
	}
	code := 0
	for _, f := range files {
		data, err := os.ReadFile(f)
		if err != nil {
			fmt.Fprintln(stderr, err)
			code = exitError
			continue
		}
		res, err := standard.Validate(data)
		if err != nil {
			fmt.Fprintf(stderr, "%s: %v\n", f, err)
			code = exitError
			continue
		}
		for _, w := range res.Warnings {
			fmt.Fprintf(stderr, "%s: warning: %s\n", f, w)
		}
		for _, e := range res.Errors {
			fmt.Fprintf(stderr, "%s: error: %s\n", f, e)
		}
		if res.OK() {
			fmt.Fprintf(stdout, "%s: ok\n", f)
		} else {
			code = exitError
		}
	}
	return code
}
