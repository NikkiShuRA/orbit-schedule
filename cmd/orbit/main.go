// SPDX-FileCopyrightText: 2026 Orbit contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

// Command orbit fetches schedules from sources and writes them as Orbit
// standard documents.
//
//	orbit fetch sieup --out data [--date 2026-11-09]
//	orbit validate file.json...
//
// Exit codes: 0 ok, 1 error, 2 bad usage, 3 schedule not published yet.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"time"
	_ "time/tzdata" // embed time zones: the binary must work where the OS has none (Windows, minimal containers)

	"github.com/NikkiShuRA/orbit-schedule/internal/sieup"
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
	case "validate":
		return validate(args[1:], stdout, stderr)
	default:
		usage(stderr)
		return exitUsage
	}
}

func usage(w io.Writer) {
	fmt.Fprintln(w, "usage:")
	fmt.Fprintln(w, "  orbit fetch sieup --out DIR [--date YYYY-MM-DD] [--base URL]...")
	fmt.Fprintln(w, "  orbit validate FILE...")
}

func fetch(ctx context.Context, args []string, stdout, stderr io.Writer) int {
	if len(args) == 0 || args[0] != "sieup" {
		fmt.Fprintln(stderr, "unknown source; available: sieup")
		return exitUsage
	}
	fs := flag.NewFlagSet("fetch", flag.ContinueOnError)
	fs.SetOutput(stderr)
	out := fs.String("out", "", "output directory (required)")
	date := fs.String("date", "", "any date of the week to fetch, YYYY-MM-DD (default: today in the institution's time zone)")
	// --base may be given several times; the addresses are tried in
	// order. flag.Func calls the function once per occurrence.
	var bases []sieup.Base
	fs.Func("base", "API address to use instead of the built-in ones; repeat to give fallbacks", func(s string) error {
		u, err := url.Parse(s)
		if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.Host == "" {
			return fmt.Errorf("want an http(s) URL, got %q", s)
		}
		bases = append(bases, sieup.Base{URL: strings.TrimRight(s, "/"), Name: sieup.CustomBaseName})
		return nil
	})
	if err := fs.Parse(args[1:]); err != nil {
		return exitUsage
	}
	if *out == "" {
		fmt.Fprintln(stderr, "--out is required")
		return exitUsage
	}
	if *date == "" {
		loc, err := time.LoadLocation(sieup.TimeZone)
		if err != nil {
			fmt.Fprintln(stderr, err)
			return exitError
		}
		*date = time.Now().In(loc).Format(time.DateOnly)
	} else if _, err := time.Parse(time.DateOnly, *date); err != nil {
		fmt.Fprintf(stderr, "--date: want YYYY-MM-DD, got %q\n", *date)
		return exitUsage
	}

	doc, err := sieup.Fetch(ctx, sieup.NewClient(bases...), *date)
	if errors.Is(err, sieup.ErrNotPublished) {
		fmt.Fprintln(stderr, err)
		return exitNotPublished
	}
	if err != nil {
		fmt.Fprintln(stderr, "fetch:", err)
		return exitError
	}

	data, err := json.MarshalIndent(doc, "", "  ")
	if err != nil {
		fmt.Fprintln(stderr, err)
		return exitError
	}
	data = append(data, '\n')

	// Never publish a document that does not pass the standard: the last
	// good file stays in place instead.
	res, err := standard.Validate(data)
	if err != nil {
		fmt.Fprintln(stderr, "validate:", err)
		return exitError
	}
	for _, w := range res.Warnings {
		fmt.Fprintln(stderr, "warning:", w)
	}
	if !res.OK() {
		for _, e := range res.Errors {
			fmt.Fprintln(stderr, "error:", e)
		}
		fmt.Fprintln(stderr, "document is invalid; nothing written")
		return exitError
	}

	path := filepath.Join(*out, sieup.Name, doc.Publication.Period.Start+".json")
	if err := writeFileAtomic(path, data); err != nil {
		fmt.Fprintln(stderr, err)
		return exitError
	}
	fmt.Fprintf(stdout, "%s: %d lessons, %d of %d buildings published\n",
		path, len(doc.Lessons), len(doc.Publication.Coverage.BuildingIDs), len(doc.Buildings))
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
