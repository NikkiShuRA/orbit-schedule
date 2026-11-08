// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

package spk

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"github.com/NikkiShuRA/orbit-schedule/internal/standard"
)

// monday1109 is 2026-11-09 00:00 in Surgut, as the API writes it.
const monday1109 = "1794164400000"

// fakeAPI serves the fixtures in testdata/ the way the real API does:
// the week of 2026-11-09 is published (with a day of the week before),
// every other week is not.
func fakeAPI(t *testing.T) *httptest.Server {
	t.Helper()
	file := func(w http.ResponseWriter, name string) {
		data, err := os.ReadFile(filepath.Join("testdata", name))
		if err != nil {
			t.Error(err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Write(data)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /index", func(w http.ResponseWriter, r *http.Request) { file(w, "index.json") })
	// The schedule site, on the same fake server.
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) { file(w, "site.html") })
	mux.HandleFunc("GET /assets/index-0a1b2c3d.js", func(w http.ResponseWriter, r *http.Request) { file(w, "site.js") })
	mux.HandleFunc("GET /schedule", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("date") == monday1109 {
			file(w, "schedule.json")
			return
		}
		w.Write([]byte(`{"success":true,"schedule":{"error":"","data":{"schedule":[]}}}`))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

// testClient talks only to the fake server, never to the real site.
func testClient(u string) *Client {
	c := NewClient(Base{URL: u, Name: "test"})
	c.Site = u
	return c
}

func fetchFixture(t *testing.T, date string) *standard.Document {
	t.Helper()
	srv := fakeAPI(t)
	doc, err := Fetch(context.Background(), testClient(srv.URL), date)
	if err != nil {
		t.Fatal(err)
	}
	return doc
}

func TestFetchProducesValidDocument(t *testing.T) {
	doc := fetchFixture(t, "2026-11-11")
	data, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	res, err := standard.Validate(data)
	if err != nil {
		t.Fatal(err)
	}
	if !res.OK() || len(res.Warnings) > 0 {
		t.Fatalf("errors %v, warnings %v", res.Errors, res.Warnings)
	}
	if got, want := doc.Publication.Period, (standard.Period{Start: "2026-11-09", End: "2026-11-15"}); got != want {
		t.Errorf("period = %v, want %v", got, want)
	}
	if !doc.Publication.Coverage.Institution {
		t.Errorf("coverage = %+v, want the whole college", doc.Publication.Coverage)
	}
}

func TestAnyDayFindsItsWeek(t *testing.T) {
	// Sunday belongs to the week that started on Monday, not the next one.
	for _, d := range []string{"2026-11-09", "2026-11-15"} {
		if got := fetchFixture(t, d).Publication.Period.Start; got != "2026-11-09" {
			t.Errorf("%s: week starts %s, want 2026-11-09", d, got)
		}
	}
}

func TestOnlyTheRequestedWeek(t *testing.T) {
	doc := fetchFixture(t, "2026-11-09")
	for _, l := range doc.Lessons {
		if l.Date < "2026-11-09" || l.Date > "2026-11-15" {
			t.Errorf("lesson on %s is outside the week", l.Date)
		}
	}
	if len(doc.Lessons) != 5 {
		t.Errorf("lessons = %d, want 5", len(doc.Lessons))
	}
}

func TestLessonQuirks(t *testing.T) {
	doc := fetchFixture(t, "2026-11-09")
	var pe standard.Lesson
	for _, l := range doc.Lessons {
		if l.Date == "2026-11-11" && l.Groups[0].GroupID == "g-101" {
			pe = l
		}
	}
	// The null GUID is "no value": no room, building or type, not a fake one.
	if pe.Rooms != nil || pe.BuildingID != "" || pe.LessonTypeID != "" {
		t.Errorf("lesson with null GUIDs = %+v, want no room, building or type", pe)
	}
	// Lessons have no time in the source, and none is made up.
	for _, l := range doc.Lessons {
		if l.Start != "" || l.End != "" || l.ID != "" {
			t.Errorf("lesson %+v has a time or id the source did not send", l)
		}
	}
	for _, x := range doc.Teachers {
		if x.ID == "t-1" && x.Name != "Иванова Анна Петровна" {
			t.Errorf("teacher name = %q, want collapsed spaces only", x.Name)
		}
	}
	for _, x := range doc.Rooms {
		if x.ID == "r-gym" && x.Code != "" {
			t.Errorf("room without a short name has code %q", x.Code)
		}
	}
}

func TestReferenceLists(t *testing.T) {
	doc := fetchFixture(t, "2026-11-09")
	ids := func(n int, id func(int) string) []string {
		var out []string
		for i := range n {
			out = append(out, id(i))
		}
		slices.Sort(out)
		return out
	}
	// All groups, also g-301 without lessons: "no lessons" is a fact.
	if got := ids(len(doc.Groups), func(i int) string { return doc.Groups[i].ID }); !slices.Equal(got, []string{"g-101", "g-201", "g-301"}) {
		t.Errorf("groups = %v, want all three", got)
	}
	// Only the teachers and rooms the week uses.
	if got := ids(len(doc.Teachers), func(i int) string { return doc.Teachers[i].ID }); !slices.Equal(got, []string{"t-1", "t-2"}) {
		t.Errorf("teachers = %v, want t-1 and t-2", got)
	}
	if got := ids(len(doc.Rooms), func(i int) string { return doc.Rooms[i].ID }); !slices.Equal(got, []string{"r-11", "r-gym"}) {
		t.Errorf("rooms = %v, want r-11 and r-gym", got)
	}
	for _, g := range doc.Groups {
		if g.ID == "g-301" && g.DepartmentID != "" {
			t.Errorf("group with a null department has %q", g.DepartmentID)
		}
		if g.ID == "g-201" && (g.Course != 2 || g.DepartmentID != "dep-2") {
			t.Errorf("group 201 = %+v, want course 2 in dep-2", g)
		}
	}
}

func TestLessonsAreSorted(t *testing.T) {
	doc := fetchFixture(t, "2026-11-09")
	type key struct {
		date     string
		period   int
		group    string
		subgroup int
	}
	var got []key
	for _, l := range doc.Lessons {
		got = append(got, key{l.Date, *l.Period, l.Groups[0].GroupID, l.Groups[0].Subgroup})
	}
	want := []key{
		{"2026-11-09", 1, "g-101", 0},
		{"2026-11-09", 2, "g-201", 1},
		{"2026-11-09", 2, "g-201", 2},
		{"2026-11-11", 1, "g-201", 0},
		{"2026-11-11", 3, "g-101", 0},
	}
	if !slices.Equal(got, want) {
		t.Errorf("order = %v, want %v", got, want)
	}
}

func TestNotPublishedWeek(t *testing.T) {
	srv := fakeAPI(t)
	_, err := Fetch(context.Background(), testClient(srv.URL), "2026-11-18")
	if !errors.Is(err, ErrNotPublished) {
		t.Errorf("err = %v, want ErrNotPublished", err)
	}
}

func TestUnknownReferenceIsAnError(t *testing.T) {
	ref := reference{Groups: []group{{ID: "g-1", Name: "101"}}}
	monday := time.Date(2026, 11, 9, 0, 0, 0, 0, time.FixedZone("UTC+5", 5*3600))
	n := 1
	days := []day{{Date: monday.UnixMilli(), Lessons: []lesson{{Group: "g-1", Teacher: "t-missing", Number: &n}}}}
	if _, err := convert(ref, days, monday, Base{}, monday); err == nil {
		t.Error("a lesson pointing at an unknown teacher was accepted")
	}
}

func TestDateThatIsNotMidnight(t *testing.T) {
	ref := reference{Groups: []group{{ID: "g-1", Name: "101"}}}
	monday := time.Date(2026, 11, 9, 0, 0, 0, 0, time.FixedZone("UTC+5", 5*3600))
	days := []day{{Date: monday.Add(time.Hour).UnixMilli(), Lessons: []lesson{{Group: "g-1"}}}}
	if _, err := convert(ref, days, monday, Base{}, monday); err == nil {
		t.Error("a day that is not a local midnight was accepted")
	}
}

func TestSourceError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"success":false,"schedule":{"error":"db is down","data":{"schedule":[]}}}`))
	}))
	t.Cleanup(srv.Close)
	_, err := Fetch(context.Background(), testClient(srv.URL), "2026-11-09")
	if err == nil || errors.Is(err, ErrNotPublished) {
		t.Errorf("err = %v, want a source error, not 'not published'", err)
	}
}

func TestBellsFromTheSite(t *testing.T) {
	doc := fetchFixture(t, "2026-11-09")
	if len(doc.BellSchedules) != 1 {
		t.Fatalf("bell schedules = %+v, want the site's one", doc.BellSchedules)
	}
	b := doc.BellSchedules[0]
	want := []standard.BellPeriod{{Period: 1, Start: "08:30"}, {Period: 2, Start: "10:00"}, {Period: 3, Start: "12:00"}}
	if b.Name != BellScheduleName || !slices.Equal(b.Periods, want) {
		t.Errorf("bells = %+v, want %v named after the site", b, want)
	}
	// The bell schedule never gives lessons a time.
	for _, l := range doc.Lessons {
		if l.Start != "" {
			t.Errorf("lesson got a time from the bell schedule: %+v", l)
		}
	}
}

func TestNoBellsIsOnlyAWarning(t *testing.T) {
	srv := fakeAPI(t)
	c := testClient(srv.URL)
	c.Site = srv.URL + "/missing"
	var warnings []string
	c.Warn = func(msg string) { warnings = append(warnings, msg) }
	doc, err := Fetch(context.Background(), c, "2026-11-09")
	if err != nil {
		t.Fatal(err)
	}
	if doc.BellSchedules != nil || len(warnings) != 1 {
		t.Errorf("bells %+v, warnings %q: want no bells and one warning", doc.BellSchedules, warnings)
	}
}

func TestParseBells(t *testing.T) {
	for _, bad := range []string{
		`nothing here`,
		`lessons:["8:30"] and again lessons:["9:00"]`, // two lists: which one?
		`lessons:["24:00"]`,
		`lessons:["8:61"]`,
	} {
		if _, err := parseBells(bad); err == nil {
			t.Errorf("%s: accepted", bad)
		}
	}
}
