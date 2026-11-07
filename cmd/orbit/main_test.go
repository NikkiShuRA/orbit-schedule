// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// fakeSIEUiP serves the connector's fictional fixtures: the week of
// 2026-11-09 is published, every other week is not.
func fakeSIEUiP(t *testing.T) string {
	t.Helper()
	file := func(w http.ResponseWriter, name string) {
		data, err := os.ReadFile(filepath.Join("..", "..", "internal", "sieup", "testdata", name))
		if err != nil {
			t.Error(err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(data)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /divisions", func(w http.ResponseWriter, r *http.Request) { file(w, "divisions.json") })
	mux.HandleFunc("GET /weeks/date/{date}", func(w http.ResponseWriter, r *http.Request) {
		if d := r.PathValue("date"); d >= "2026-11-09" && d <= "2026-11-15" {
			file(w, "week.json")
			return
		}
		w.Write([]byte("[]"))
	})
	mux.HandleFunc("GET /lessons/division", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Query().Get("divisionName"), "№1") {
			file(w, "lessons-div-1.json")
			return
		}
		w.Write([]byte("[]"))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv.URL
}

// orbit runs the program with args and returns its exit code and output.
func orbit(t *testing.T, args ...string) (int, string) {
	t.Helper()
	var stdout, stderr bytes.Buffer
	code := run(context.Background(), args, &stdout, &stderr)
	return code, stdout.String() + stderr.String()
}

func readStatus(t *testing.T, out string) status {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(out, "sieup", statusFile))
	if err != nil {
		t.Fatal(err)
	}
	var st status
	if err := json.Unmarshal(data, &st); err != nil {
		t.Fatal(err)
	}
	return st
}

func TestFetchWritesWeeksAndStatus(t *testing.T) {
	api, out := fakeSIEUiP(t), t.TempDir()
	code, log := orbit(t, "fetch", "sieup", "--out", out, "--base", api, "--date", "2026-11-11", "--weeks", "2")
	if code != 0 {
		t.Fatalf("exit %d, want 0:\n%s", code, log)
	}

	if _, err := os.Stat(filepath.Join(out, "sieup", "2026-11-09.json")); err != nil {
		t.Errorf("the published week was not written: %v", err)
	}
	st := readStatus(t, out)
	if st.Source != "sieup" || st.CheckedAt == "" {
		t.Errorf("status = %+v, want source and checkedAt", st)
	}
	want := []weekResult{
		{Date: "2026-11-11", Result: resultUpdated, File: "2026-11-09.json"},
		{Date: "2026-11-18", Result: resultNotPublished},
	}
	if len(st.Weeks) != len(want) || st.Weeks[0] != want[0] || st.Weeks[1] != want[1] {
		t.Errorf("weeks = %+v, want %+v", st.Weeks, want)
	}
}

func TestUnchangedScheduleIsNotRewritten(t *testing.T) {
	api, out := fakeSIEUiP(t), t.TempDir()
	args := []string{"fetch", "sieup", "--out", out, "--base", api, "--date", "2026-11-11"}
	if code, log := orbit(t, args...); code != 0 {
		t.Fatalf("first run: exit %d:\n%s", code, log)
	}

	// Mark the file with an old retrieval time. If the second run
	// rewrote it, the mark would be gone.
	path := filepath.Join(out, "sieup", "2026-11-09.json")
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err := json.Unmarshal(data, &doc); err != nil {
		t.Fatal(err)
	}
	doc["provenance"].(map[string]any)["retrievedAt"] = "2020-01-01T00:00:00+05:00"
	marked, err := marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, marked, 0o644); err != nil {
		t.Fatal(err)
	}

	if code, log := orbit(t, args...); code != 0 {
		t.Fatalf("second run: exit %d:\n%s", code, log)
	}
	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(after, marked) {
		t.Error("an unchanged schedule was rewritten")
	}
	if got := readStatus(t, out).Weeks[0].Result; got != resultUnchanged {
		t.Errorf("result = %q, want %q", got, resultUnchanged)
	}
}

func TestChangedScheduleIsRewritten(t *testing.T) {
	api, out := fakeSIEUiP(t), t.TempDir()
	path := filepath.Join(out, "sieup", "2026-11-09.json")
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(`{"stale": true}`), 0o644); err != nil {
		t.Fatal(err)
	}

	if code, log := orbit(t, "fetch", "sieup", "--out", out, "--base", api, "--date", "2026-11-11"); code != 0 {
		t.Fatalf("exit %d:\n%s", code, log)
	}
	if got := readStatus(t, out).Weeks[0].Result; got != resultUpdated {
		t.Errorf("result = %q, want %q", got, resultUpdated)
	}
	if code, log := orbit(t, "validate", path); code != 0 {
		t.Errorf("rewritten file is invalid:\n%s", log)
	}
}

func TestNothingPublished(t *testing.T) {
	api, out := fakeSIEUiP(t), t.TempDir()
	code, log := orbit(t, "fetch", "sieup", "--out", out, "--base", api, "--date", "2027-01-01", "--weeks", "2")
	if code != exitNotPublished {
		t.Fatalf("exit %d, want %d:\n%s", code, exitNotPublished, log)
	}
	// The source was checked, so the status is still written.
	for _, w := range readStatus(t, out).Weeks {
		if w.Result != resultNotPublished {
			t.Errorf("week %s: result %q, want %q", w.Date, w.Result, resultNotPublished)
		}
	}
}

func TestFailedRunWritesNoStatus(t *testing.T) {
	dead := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "down", http.StatusBadGateway)
	}))
	t.Cleanup(dead.Close)
	out := t.TempDir()

	if code, log := orbit(t, "fetch", "sieup", "--out", out, "--base", dead.URL, "--date", "2026-11-11"); code != exitError {
		t.Fatalf("exit %d, want %d:\n%s", code, exitError, log)
	}
	if _, err := os.Stat(filepath.Join(out, "sieup", statusFile)); !os.IsNotExist(err) {
		t.Errorf("a failed run wrote %s (err = %v); it must not look like a fresh check", statusFile, err)
	}
}

func TestBadWeeks(t *testing.T) {
	for _, n := range []string{"0", "5"} {
		if code, _ := orbit(t, "fetch", "sieup", "--out", t.TempDir(), "--weeks", n); code != exitUsage {
			t.Errorf("--weeks %s: exit %d, want %d", n, code, exitUsage)
		}
	}
}
