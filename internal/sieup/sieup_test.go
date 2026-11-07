package sieup

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"github.com/NikkiShuRA/orbit-schedule/internal/standard"
)

// fakeAPI serves the fixtures in testdata/ the way the real API does.
func fakeAPI(t *testing.T) *httptest.Server {
	t.Helper()
	file := func(name string) []byte {
		data, err := os.ReadFile(filepath.Join("testdata", name))
		if err != nil {
			t.Fatal(err)
		}
		return data
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /divisions", func(w http.ResponseWriter, r *http.Request) { w.Write(file("divisions.json")) })
	mux.HandleFunc("GET /weeks/date/{date}", func(w http.ResponseWriter, r *http.Request) {
		if r.PathValue("date") == "2026-11-11" {
			w.Write(file("week.json"))
			return
		}
		w.Write([]byte("[]"))
	})
	mux.HandleFunc("GET /lessons/division", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("week_id") != "wk-11" {
			http.Error(w, "bad week", http.StatusBadRequest)
			return
		}
		switch r.URL.Query().Get("divisionName") {
		case "№1, ул. Примерная, 1":
			w.Write(file("lessons-div-1.json"))
		case "№2, ул. Образцовая, 2":
			w.Write(file("lessons-div-2.json"))
		default:
			http.NotFound(w, r)
		}
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func testClient(urls ...string) *Client {
	bases := make([]Base, len(urls))
	for i, u := range urls {
		bases[i] = Base{URL: u, Name: fmt.Sprintf("test base %d", i)}
	}
	c := NewClient(bases...)
	c.HTTP.Timeout = 5 * time.Second
	return c
}

func fetchFixture(t *testing.T) *standard.Document {
	t.Helper()
	srv := fakeAPI(t)
	doc, err := Fetch(context.Background(), testClient(srv.URL), "2026-11-11")
	if err != nil {
		t.Fatal(err)
	}
	return doc
}

func TestFetchProducesValidDocument(t *testing.T) {
	doc := fetchFixture(t)
	data, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	res, err := standard.Validate(data)
	if err != nil {
		t.Fatal(err)
	}
	if !res.OK() {
		t.Fatalf("invalid document: %v", res.Errors)
	}
	if got, want := doc.Publication.Period, (standard.Period{Start: "2026-11-09", End: "2026-11-15"}); got != want {
		t.Errorf("period = %v, want %v", got, want)
	}
	if doc.Provenance.SourceRevision != "2" {
		t.Errorf("sourceRevision = %q, want week version 2", doc.Provenance.SourceRevision)
	}
}

func TestBuildingWithoutLessonsIsNotCovered(t *testing.T) {
	doc := fetchFixture(t)
	if got := doc.Publication.Coverage.BuildingIDs; !slices.Equal(got, []string{"div-1"}) {
		t.Errorf("coverage = %v, want only div-1: div-2 has not published", got)
	}
	if len(doc.Buildings) != 2 {
		t.Errorf("buildings = %d, want 2: unpublished buildings stay in the reference list", len(doc.Buildings))
	}
}

func TestLessonQuirks(t *testing.T) {
	doc := fetchFixture(t)
	byID := map[string]standard.Lesson{}
	for _, l := range doc.Lessons {
		byID[l.ID] = l
	}

	if got := byID["l1"].Note; got != "Перенос с 12.11" {
		t.Errorf("note = %q: only whitespace may be normalised", got)
	}
	if got := byID["l3"].Teachers; len(got) != 1 || got[0].Placeholder != standard.PlaceholderUnassigned || got[0].SourceText != "ВАКАНСИЯ" {
		t.Errorf("vacancy teacher = %+v, want an unassigned placeholder", got)
	}
	if got := byID["l3"].Groups[0].Subgroup; got != 2 {
		t.Errorf("subgroup = %d, want 2", got)
	}
	if got := byID["l1"].Groups[0].Subgroup; got != 0 {
		t.Errorf("whole-group lesson has subgroup %d, want 0 (omitted)", got)
	}
	l2 := byID["l2"]
	if l2.Rooms != nil {
		t.Errorf("lesson without cabinet has rooms %+v, want none", l2.Rooms)
	}
	if l2.SubjectID != "" {
		t.Errorf("lesson with empty subject name has subjectId %q, want none", l2.SubjectID)
	}
	for _, s := range doc.Teachers {
		if s.Name == "ВАКАНСИЯ" {
			t.Error("a vacancy must not become a teacher")
		}
	}
	for _, s := range doc.Teachers {
		if s.ID == "t-1" && s.Name != "Иванова Анна Петровна" {
			t.Errorf("teacher name = %q, want collapsed spaces", s.Name)
		}
	}
}

func TestLessonsAreSorted(t *testing.T) {
	doc := fetchFixture(t)
	var ids []string
	for _, l := range doc.Lessons {
		ids = append(ids, l.ID)
	}
	if want := []string{"l1", "l2", "l3", "l4"}; !slices.Equal(ids, want) {
		t.Errorf("lesson order = %v, want %v", ids, want)
	}
}

func TestNotPublishedWeek(t *testing.T) {
	srv := fakeAPI(t)
	_, err := Fetch(context.Background(), testClient(srv.URL), "2027-01-01")
	if !errors.Is(err, ErrNotPublished) {
		t.Errorf("err = %v, want ErrNotPublished", err)
	}
}

func TestFallsBackToMirrorAndRemembersIt(t *testing.T) {
	var deadHits int
	dead := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		deadHits++
		http.Error(w, "down", http.StatusBadGateway)
	}))
	t.Cleanup(dead.Close)
	mirror := fakeAPI(t)

	c := testClient(dead.URL, mirror.URL)
	doc, err := Fetch(context.Background(), c, "2026-11-11")
	if err != nil {
		t.Fatal(err)
	}
	if c.Base().URL != mirror.URL {
		t.Errorf("base = %q, want the mirror", c.Base().URL)
	}
	// Provenance must say the data came from the mirror, not the main API.
	if got := doc.Provenance.Source; got.URL != mirror.URL || got.Name != "test base 1" {
		t.Errorf("provenance source = %+v, want the mirror", got)
	}
	if deadHits != 1 {
		t.Errorf("dead base was tried %d times, want once per run", deadHits)
	}
}

func TestAllBasesDown(t *testing.T) {
	dead := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "down", http.StatusBadGateway)
	}))
	t.Cleanup(dead.Close)
	_, err := Fetch(context.Background(), testClient(dead.URL), "2026-11-11")
	if err == nil || errors.Is(err, ErrNotPublished) {
		t.Errorf("err = %v, want a fetch error", err)
	}
}
