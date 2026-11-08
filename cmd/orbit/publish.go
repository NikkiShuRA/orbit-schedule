// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/NikkiShuRA/orbit-schedule/internal/standard"
)

// statusFile is written next to the documents of a source after every
// successful run. It says when the source was last checked, which the
// documents alone cannot say: an unchanged document is not rewritten,
// so its retrievedAt is the time this content was first seen.
const statusFile = "status.json"

// Results of fetching one week.
const (
	resultUpdated      = "updated"       // a new or changed document was written
	resultUnchanged    = "unchanged"     // the source has the same schedule as the file
	resultNotPublished = "not-published" // the source has no schedule for this week yet
)

type status struct {
	Source    string       `json:"source"`
	CheckedAt string       `json:"checkedAt"`
	Weeks     []weekResult `json:"weeks"`
}

type weekResult struct {
	Date   string `json:"date"`           // the date that was asked for
	Result string `json:"result"`         // one of the result constants
	File   string `json:"file,omitempty"` // the document, relative to the source directory
}

// fetchWeek fetches the week that contains day and writes its document
// into dir, unless the file already holds the same schedule.
func fetchWeek(ctx context.Context, src source, dir, day string, stdout, stderr io.Writer) (weekResult, error) {
	res := weekResult{Date: day}
	doc, err := src.fetch(ctx, day)
	if errors.Is(err, src.notPublished) {
		fmt.Fprintf(stdout, "week of %s: not published yet\n", day)
		res.Result = resultNotPublished
		return res, nil
	}
	if err != nil {
		return res, err
	}

	data, err := marshal(doc)
	if err != nil {
		return res, err
	}
	// Never publish a document that does not pass the standard: the last
	// good file stays in place instead.
	v, err := standard.Validate(data)
	if err != nil {
		return res, fmt.Errorf("validate: %w", err)
	}
	for _, w := range v.Warnings {
		fmt.Fprintln(stderr, "warning:", w)
	}
	if !v.OK() {
		for _, e := range v.Errors {
			fmt.Fprintln(stderr, "error:", e)
		}
		return res, errors.New("document is invalid; nothing written")
	}

	res.File = doc.Publication.Period.Start + ".json"
	path := filepath.Join(dir, res.File)
	same, err := sameSchedule(path, doc)
	if err != nil {
		return res, err
	}
	summary := fmt.Sprintf("%d lessons, %s", len(doc.Lessons), describeCoverage(doc))
	if same {
		fmt.Fprintf(stdout, "%s: unchanged (%s)\n", path, summary)
		res.Result = resultUnchanged
		return res, nil
	}
	if err := writeFileAtomic(path, data); err != nil {
		return res, err
	}
	fmt.Fprintf(stdout, "%s: updated (%s)\n", path, summary)
	res.Result = resultUpdated
	return res, nil
}

// sameSchedule reports whether the file at path holds the same document
// as doc, apart from the retrieval time. A missing file is not the same.
//
// Without this check every run would rewrite every file with a new
// retrievedAt, and the git history would be full of commits that change
// nothing but a timestamp.
func sameSchedule(path string, doc *standard.Document) (bool, error) {
	old, err := os.ReadFile(path)
	if errors.Is(err, fs.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	var prev standard.Document
	if err := json.Unmarshal(old, &prev); err != nil {
		return false, nil // unreadable: replace it with a good file
	}
	// Compare with the same retrievedAt on both sides. cur is a copy of
	// the struct, so the caller's document stays untouched.
	cur := *doc
	cur.Provenance.RetrievedAt = prev.Provenance.RetrievedAt
	a, err := marshal(&prev)
	if err != nil {
		return false, err
	}
	b, err := marshal(&cur)
	if err != nil {
		return false, err
	}
	return bytes.Equal(a, b), nil
}

// marshal is the one place that decides how files look, so that writing
// and comparing always agree.
func marshal(v any) ([]byte, error) {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(data, '\n'), nil
}

func writeJSON(path string, v any) error {
	data, err := marshal(v)
	if err != nil {
		return err
	}
	return writeFileAtomic(path, data)
}

// describeCoverage says in a few words what a document covers, for the log.
func describeCoverage(doc *standard.Document) string {
	c := doc.Publication.Coverage
	if c.Institution {
		return "whole institution published"
	}
	return fmt.Sprintf("%d of %d buildings published", len(c.BuildingIDs), len(doc.Buildings))
}
