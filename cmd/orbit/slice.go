// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"time"

	api "github.com/NikkiShuRA/orbit-schedule/api/v1"
	"github.com/NikkiShuRA/orbit-schedule/internal/slice"
	"github.com/NikkiShuRA/orbit-schedule/internal/standard"
)

var (
	// weekFile matches the documents fetch writes: <monday>.json.
	weekFile = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}\.json$`)
	// safeID is what an id may look like to become a directory name on
	// any system and in a URL without escaping.
	safeID = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*$`)
)

// Index lists the sources on the site. Like the catalog, it is a
// publication file, not part of the standard.
type Index struct {
	Sources []IndexSource `json:"sources"`
}

type IndexSource struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	ShortName string `json:"shortName,omitempty"`
	Catalog   string `json:"catalog"`
	Status    string `json:"status,omitempty"`
}

// sliceCmd reads the weeks under --in (one directory per source, as
// fetch writes them) and writes, under --out, the files the app reads:
// a catalog per source, a document per group and teacher per week, and
// index.json. It never writes into --in.
func sliceCmd(args []string, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("slice", flag.ContinueOnError)
	fs.SetOutput(stderr)
	in := fs.String("in", "", "directory with fetched weeks (required)")
	out := fs.String("out", "", "directory to write the sliced files to (required)")
	from := fs.String("from", "", "slice weeks that end on or after this date, YYYY-MM-DD (default: 8 days ago)")
	if err := fs.Parse(args); err != nil {
		return exitUsage
	}
	if *in == "" || *out == "" {
		fmt.Fprintln(stderr, "--in and --out are required")
		return exitUsage
	}
	if *from == "" {
		// Last week, this week and next week; older weeks stay published
		// as whole documents but are not sliced.
		*from = time.Now().AddDate(0, 0, -8).Format(time.DateOnly)
	} else if _, err := time.Parse(time.DateOnly, *from); err != nil {
		fmt.Fprintf(stderr, "--from: want YYYY-MM-DD, got %q\n", *from)
		return exitUsage
	}

	entries, err := os.ReadDir(*in)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return exitError
	}
	index := Index{Sources: []IndexSource{}}
	for _, e := range entries {
		if !e.IsDir() || e.Name()[0] == '.' {
			continue
		}
		src := e.Name()
		entry, ok, err := sliceSource(filepath.Join(*in, src), filepath.Join(*out, src), src, *from, stdout, stderr)
		if err != nil {
			fmt.Fprintf(stderr, "%s: %v\n", src, err)
			return exitError
		}
		if ok {
			index.Sources = append(index.Sources, entry)
		}
	}
	if err := writeAPIFile(filepath.Join(*out, "index.json"), api.Index, index); err != nil {
		fmt.Fprintln(stderr, err)
		return exitError
	}
	return 0
}

// sliceSource slices one source. ok is false when the source has no
// weeks at all yet: then there is nothing to put in the catalog, not
// even the name of the institution, and the source is left out of the
// index until its first week is published.
func sliceSource(inDir, outDir, src, from string, stdout, stderr io.Writer) (entry IndexSource, ok bool, err error) {
	weeks, latest, err := readWeeks(inDir, from)
	if err != nil {
		return IndexSource{}, false, err
	}
	if latest == nil {
		fmt.Fprintf(stderr, "warning: %s: no weeks published yet; left out of the index\n", src)
		return IndexSource{}, false, nil
	}
	fileOf := func(d *standard.Document) string { return d.Publication.Period.Start + ".json" }
	cat := slice.NewCatalog(src, weeks, fileOf)
	// With no recent weeks the catalog is empty but still says whose
	// it is.
	cat.Institution = latest.Institution

	files, skipped := 0, map[string]bool{}
	write := func(kind, id string, doc *standard.Document) error {
		if !safeID.MatchString(id) {
			skipped[kind+" "+id] = true
			return nil
		}
		if err := writeValid(filepath.Join(outDir, kind, id, fileOf(doc)), doc); err != nil {
			return fmt.Errorf("%s %s, week of %s: %w", kind, id, doc.Publication.Period.Start, err)
		}
		files++
		return nil
	}
	for _, w := range weeks {
		// Every group and teacher in the catalog gets a file for every
		// week that covers them, even without lessons: inside the
		// coverage, "no lessons" is a fact. The week's own entry is used
		// when it has one; otherwise the catalog's, from another week.
		for _, g := range cat.Groups {
			if own := find(w.Groups, func(x standard.Group) bool { return x.ID == g.ID }); own != nil {
				g = *own
			}
			if doc, ok := slice.ForGroup(w, g); ok {
				if err := write("groups", g.ID, doc); err != nil {
					return IndexSource{}, false, err
				}
			}
		}
		for _, t := range cat.Teachers {
			if own := find(w.Teachers, func(x standard.Teacher) bool { return x.ID == t.ID }); own != nil {
				t = *own
			}
			if doc, ok := slice.ForTeacher(w, t); ok {
				if err := write("teachers", t.ID, doc); err != nil {
					return IndexSource{}, false, err
				}
			}
		}
	}
	for s := range skipped {
		fmt.Fprintf(stderr, "warning: %s: id is not safe for a file name; not sliced\n", s)
	}
	if err := writeAPIFile(filepath.Join(outDir, "catalog.json"), api.Catalog, cat); err != nil {
		return IndexSource{}, false, err
	}
	fmt.Fprintf(stdout, "%s: %d weeks, %d groups, %d teachers, %d files\n",
		src, len(weeks), len(cat.Groups), len(cat.Teachers), files)

	entry = IndexSource{ID: src, Name: cat.Institution.Name, ShortName: cat.Institution.ShortName, Catalog: src + "/catalog.json"}
	if _, err := os.Stat(filepath.Join(inDir, statusFile)); err == nil {
		entry.Status = src + "/" + statusFile
	}
	return entry, true, nil
}

// readWeeks reads the week documents in dir that end on or after from.
// If there are none, it also returns the latest older week, so the
// catalog can still name the institution, for example over the summer
// break. latest is nil when the source has no weeks at all.
func readWeeks(dir, from string) (weeks []*standard.Document, latest *standard.Document, err error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, nil, err
	}
	read := func(name string) (*standard.Document, error) {
		data, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return nil, err
		}
		var d standard.Document
		if err := json.Unmarshal(data, &d); err != nil {
			return nil, fmt.Errorf("%s: %w", name, err)
		}
		return &d, nil
	}
	// File names are Mondays, and ReadDir sorts them, so the weeks come
	// in date order. The history grows every week, so files that cannot
	// be recent are not read: a week ends six days after its Monday.
	first := ""
	if f, err := time.Parse(time.DateOnly, from); err == nil {
		first = f.AddDate(0, 0, -6).Format(time.DateOnly)
	}
	var names []string
	for _, e := range entries {
		if !e.IsDir() && weekFile.MatchString(e.Name()) {
			names = append(names, e.Name())
		}
	}
	for _, name := range names {
		if name < first {
			continue
		}
		d, err := read(name)
		if err != nil {
			return nil, nil, err
		}
		if d.Publication.Period.End >= from {
			weeks = append(weeks, d)
		}
	}
	switch {
	case len(weeks) > 0:
		latest = weeks[len(weeks)-1]
	case len(names) > 0:
		if latest, err = read(names[len(names)-1]); err != nil {
			return nil, nil, err
		}
	}
	return weeks, latest, nil
}

// writeValid writes a document only if it passes the standard cleanly.
// A slice that fails is a bug in slicing, not odd source data.
func writeValid(path string, doc *standard.Document) error {
	data, err := marshal(doc)
	if err != nil {
		return err
	}
	res, err := standard.Validate(data)
	if err != nil {
		return err
	}
	if !res.OK() {
		return fmt.Errorf("invalid slice: %v", res.Errors)
	}
	if len(res.Warnings) > 0 {
		return fmt.Errorf("slice with warnings: %v", res.Warnings)
	}
	if _, err := os.Stat(path); err == nil || !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("%s already exists: slice into a directory without old slices, or stale files would stay", path)
	}
	return writeFileAtomic(path, data)
}

// find returns a pointer to the first element that matches, or nil.
func find[T any](list []T, match func(T) bool) *T {
	for i := range list {
		if match(list[i]) {
			return &list[i]
		}
	}
	return nil
}
