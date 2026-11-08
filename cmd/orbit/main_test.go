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

func TestSliceWritesAppFiles(t *testing.T) {
	api, data, site := fakeSIEUiP(t), t.TempDir(), t.TempDir()
	if code, log := orbit(t, "fetch", "sieup", "--out", data, "--base", api, "--date", "2026-11-11"); code != 0 {
		t.Fatalf("fetch: exit %d:\n%s", code, log)
	}
	if code, log := orbit(t, "slice", "--in", data, "--out", site, "--from", "2026-11-01"); code != 0 {
		t.Fatalf("slice: exit %d:\n%s", code, log)
	}

	var index Index
	readJSON(t, filepath.Join(site, "index.json"), &index)
	if len(index.Sources) != 1 || index.Sources[0].Catalog != "sieup/catalog.json" || index.Sources[0].Status != "sieup/status.json" {
		t.Errorf("index = %+v, want sieup with its catalog and status", index)
	}

	var cat struct {
		Weeks  []struct{ File string }
		Groups []struct{ ID string }
	}
	readJSON(t, filepath.Join(site, "sieup", "catalog.json"), &cat)
	if len(cat.Weeks) != 1 || cat.Weeks[0].File != "2026-11-09.json" || len(cat.Groups) == 0 {
		t.Fatalf("catalog = %+v, want one week and its groups", cat)
	}

	// Every group in the catalog has a valid file for the week.
	for _, g := range cat.Groups {
		path := filepath.Join(site, "sieup", "groups", g.ID, "2026-11-09.json")
		if code, log := orbit(t, "validate", path); code != 0 {
			t.Errorf("group %s: %s", g.ID, log)
		}
	}
	teachers, err := filepath.Glob(filepath.Join(site, "sieup", "teachers", "*", "2026-11-09.json"))
	if err != nil || len(teachers) == 0 {
		t.Errorf("no teacher files (err %v)", err)
	}

	// Slicing twice into the same place would mix in stale files.
	if code, _ := orbit(t, "slice", "--in", data, "--out", site, "--from", "2026-11-01"); code != exitError {
		t.Errorf("second slice into the same directory: exit %d, want %d", code, exitError)
	}
}

func TestSliceSkipsOldWeeks(t *testing.T) {
	api, data, site := fakeSIEUiP(t), t.TempDir(), t.TempDir()
	if code, log := orbit(t, "fetch", "sieup", "--out", data, "--base", api, "--date", "2026-11-11"); code != 0 {
		t.Fatalf("fetch: exit %d:\n%s", code, log)
	}
	if code, log := orbit(t, "slice", "--in", data, "--out", site, "--from", "2026-12-01"); code != 0 {
		t.Fatalf("slice: exit %d:\n%s", code, log)
	}
	if _, err := os.Stat(filepath.Join(site, "sieup", "groups")); !os.IsNotExist(err) {
		t.Error("a week that ended before --from was sliced")
	}
}

func readJSON(t *testing.T, path string, v any) {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, v); err != nil {
		t.Fatal(err)
	}
}

// fakeSPK serves the SPK connector's fictional fixtures: the week of
// 2026-11-09 is published, every other week is not.
func fakeSPK(t *testing.T) string {
	t.Helper()
	dir := filepath.Join("..", "..", "internal", "spk", "testdata")
	mux := http.NewServeMux()
	mux.HandleFunc("GET /index", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.Join(dir, "index.json"))
	})
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.Join(dir, "site.html"))
	})
	mux.HandleFunc("GET /assets/index-0a1b2c3d.js", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.Join(dir, "site.js"))
	})
	mux.HandleFunc("GET /schedule", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("date") == "1794164400000" { // 2026-11-09 00:00 +05:00
			http.ServeFile(w, r, filepath.Join(dir, "schedule.json"))
			return
		}
		w.Write([]byte(`{"success":true,"schedule":{"error":"","data":{"schedule":[]}}}`))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv.URL
}

func TestFetchSPKAndSliceBothSources(t *testing.T) {
	data, site := t.TempDir(), t.TempDir()
	spk := fakeSPK(t)
	code, log := orbit(t, "fetch", "spk", "--out", data, "--base", spk, "--site", spk, "--date", "2026-11-10", "--weeks", "2")
	if code != 0 {
		t.Fatalf("fetch spk: exit %d:\n%s", code, log)
	}
	if code, log := orbit(t, "validate", filepath.Join(data, "spk", "2026-11-09.json")); code != 0 {
		t.Fatalf("spk week is invalid:\n%s", log)
	}
	var st status
	readJSON(t, filepath.Join(data, "spk", statusFile), &st)
	if st.Source != "spk" || len(st.Weeks) != 2 || st.Weeks[0].Result != resultUpdated || st.Weeks[1].Result != resultNotPublished {
		t.Errorf("status = %+v, want the first week updated and the second not published", st)
	}

	if code, log := orbit(t, "fetch", "sieup", "--out", data, "--base", fakeSIEUiP(t), "--date", "2026-11-11"); code != 0 {
		t.Fatalf("fetch sieup: exit %d:\n%s", code, log)
	}
	if code, log := orbit(t, "slice", "--in", data, "--out", site, "--from", "2026-11-01"); code != 0 {
		t.Fatalf("slice: exit %d:\n%s", code, log)
	}
	var index Index
	readJSON(t, filepath.Join(site, "index.json"), &index)
	var ids []string
	for _, s := range index.Sources {
		ids = append(ids, s.ID)
	}
	if strings.Join(ids, ",") != "sieup,spk" {
		t.Errorf("sources = %v, want sieup and spk", ids)
	}
	// A group without lessons this week still gets its file: within the
	// coverage (the whole college) "no lessons" is a fact.
	path := filepath.Join(site, "spk", "groups", "g-301", "2026-11-09.json")
	if code, log := orbit(t, "validate", path); code != 0 {
		t.Errorf("group without lessons: %s", log)
	}
}

func TestSPKTakesOneBase(t *testing.T) {
	code, _ := orbit(t, "fetch", "spk", "--out", t.TempDir(), "--base", "https://a.example", "--base", "https://b.example")
	if code != exitUsage {
		t.Errorf("exit %d, want %d", code, exitUsage)
	}
}
