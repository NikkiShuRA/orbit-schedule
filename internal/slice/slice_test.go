// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

package slice

import (
	"encoding/json"
	"slices"
	"testing"

	"github.com/NikkiShuRA/orbit-schedule/internal/standard"
)

func intp(n int) *int { return &n }

// week is a fictional publication of two buildings out of three: b-3 is
// not published, so nothing is known about its lessons.
func week() *standard.Document {
	return &standard.Document{
		StandardVersion: standard.Version,
		Institution:     standard.Institution{ID: "ex", Name: "Колледж «Пример»", TimeZone: "Asia/Yekaterinburg"},
		Publication: standard.Publication{
			Period:   standard.Period{Start: "2026-11-09", End: "2026-11-15"},
			Coverage: standard.Coverage{BuildingIDs: []string{"b-1", "b-2"}},
		},
		Provenance: standard.Provenance{
			Connector:   standard.Connector{Name: "example", Version: "0.0.1"},
			Source:      standard.Source{Name: "Вымышленный источник"},
			RetrievedAt: "2026-11-08T12:00:00+05:00",
		},
		Buildings:   []standard.Building{{ID: "b-1", Name: "№1"}, {ID: "b-2", Name: "№2"}, {ID: "b-3", Name: "№3"}},
		Departments: []standard.Department{{ID: "d-1", Name: "Отделение ИТ"}},
		Rooms:       []standard.Room{{ID: "r-1", Name: "101", BuildingID: "b-1"}, {ID: "r-2", Name: "201", BuildingID: "b-2"}},
		Groups: []standard.Group{
			{ID: "g-a", Name: "ИС-25", BuildingID: "b-1", DepartmentID: "d-1"},
			{ID: "g-b", Name: "ЭК-24", BuildingID: "b-2"},
		},
		Teachers: []standard.Teacher{{ID: "t-1", Name: "Иванова А. П."}, {ID: "t-2", Name: "Петров П. П."}},
		Subjects: []standard.Subject{{ID: "s-1", Name: "Математика"}, {ID: "s-2", Name: "История"}},
		BellSchedules: []standard.BellSchedule{
			{ID: "bell-1", BuildingIDs: []string{"b-1"}, Periods: []standard.BellPeriod{{Period: 1, Start: "08:30"}}},
			{ID: "bell-3", BuildingIDs: []string{"b-3"}, Periods: []standard.BellPeriod{{Period: 1, Start: "09:00"}}},
		},
		Lessons: []standard.Lesson{
			{ID: "l-1", Date: "2026-11-09", Period: intp(1), BuildingID: "b-1", SubjectID: "s-1",
				Groups: []standard.LessonGroup{{GroupID: "g-a"}}, Teachers: []standard.TeacherRef{{TeacherID: "t-1"}},
				Rooms: []standard.RoomRef{{RoomID: "r-1"}}},
			{ID: "l-2", Date: "2026-11-10", Period: intp(2), BuildingID: "b-2", SubjectID: "s-2",
				Groups: []standard.LessonGroup{{GroupID: "g-b"}}, Teachers: []standard.TeacherRef{{TeacherID: "t-1"}},
				Rooms: []standard.RoomRef{{RoomID: "r-2"}}},
			{ID: "l-3", Date: "2026-11-11", Period: intp(1), BuildingID: "b-2", SubjectID: "s-2",
				Groups:   []standard.LessonGroup{{GroupID: "g-b"}},
				Teachers: []standard.TeacherRef{{Placeholder: standard.PlaceholderUnassigned, SourceText: "ВАКАНСИЯ"}}},
		},
	}
}

// valid fails the test unless doc passes the standard without errors
// or warnings: a slice must be as clean as the week it came from.
func valid(t *testing.T, doc *standard.Document) {
	t.Helper()
	data, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	res, err := standard.Validate(data)
	if err != nil {
		t.Fatal(err)
	}
	if !res.OK() || len(res.Warnings) > 0 {
		t.Fatalf("slice is not clean: errors %v, warnings %v", res.Errors, res.Warnings)
	}
}

func ids[T any](list []T, id func(T) string) []string {
	var out []string
	for _, x := range list {
		out = append(out, id(x))
	}
	return out
}

func TestForTeacher(t *testing.T) {
	w := week()
	doc, ok := ForTeacher(w, w.Teachers[0])
	if !ok {
		t.Fatal("teacher t-1 is inside the coverage")
	}
	valid(t, doc)

	if got, want := doc.Publication.Coverage, (standard.Coverage{BuildingIDs: []string{"b-1", "b-2"}, TeacherIDs: []string{"t-1"}}); !equalCoverage(got, want) {
		t.Errorf("coverage = %+v, want %+v: the week's buildings narrowed to the teacher", got, want)
	}
	if got := ids(doc.Lessons, func(l standard.Lesson) string { return l.ID }); !slices.Equal(got, []string{"l-1", "l-2"}) {
		t.Errorf("lessons = %v, want l-1 and l-2", got)
	}
	if got := ids(doc.Groups, func(g standard.Group) string { return g.ID }); !slices.Equal(got, []string{"g-a", "g-b"}) {
		t.Errorf("groups = %v, want both groups the teacher meets", got)
	}
	if got := ids(doc.Teachers, func(x standard.Teacher) string { return x.ID }); !slices.Equal(got, []string{"t-1"}) {
		t.Errorf("teachers = %v, want only t-1", got)
	}
	if got := ids(doc.BellSchedules, func(b standard.BellSchedule) string { return b.ID }); !slices.Equal(got, []string{"bell-1"}) {
		t.Errorf("bell schedules = %v, want only the one for b-1", got)
	}
	if doc.Provenance != w.Provenance {
		t.Error("provenance changed: slicing adds no data")
	}
}

func TestForGroupKeepsPlaceholders(t *testing.T) {
	w := week()
	doc, ok := ForGroup(w, w.Groups[1])
	if !ok {
		t.Fatal("group g-b is inside the coverage")
	}
	valid(t, doc)
	if got := ids(doc.Lessons, func(l standard.Lesson) string { return l.ID }); !slices.Equal(got, []string{"l-2", "l-3"}) {
		t.Errorf("lessons = %v, want l-2 and l-3", got)
	}
	if doc.Lessons[1].Teachers[0].SourceText != "ВАКАНСИЯ" {
		t.Error("the vacancy placeholder was lost")
	}
}

// A group with no lessons this week still gets a document: inside the
// coverage, "no lessons" is a fact worth stating.
func TestGroupWithoutLessons(t *testing.T) {
	w := week()
	quiet := standard.Group{ID: "g-c", Name: "ПР-23", BuildingID: "b-3"} // from the catalog, not this week
	doc, ok := ForGroup(w, quiet)
	if !ok {
		t.Fatal("the week does not limit groups, so g-c is covered within b-1 and b-2")
	}
	valid(t, doc)
	if doc.Lessons == nil || len(doc.Lessons) != 0 {
		t.Errorf("lessons = %v, want an empty list, not a missing one", doc.Lessons)
	}
	if got := ids(doc.Groups, func(g standard.Group) string { return g.ID }); !slices.Equal(got, []string{"g-c"}) {
		t.Errorf("groups = %v, want the group itself", got)
	}
}

func TestOutsideCoverage(t *testing.T) {
	w := week()
	w.Publication.Coverage = standard.Coverage{GroupIDs: []string{"g-a"}}
	if _, ok := ForGroup(w, w.Groups[1]); ok {
		t.Error("g-b is outside a coverage of g-a only; a slice would claim knowledge the week does not have")
	}
	if _, ok := ForGroup(w, w.Groups[0]); !ok {
		t.Error("g-a is inside the coverage")
	}
}

func TestInstitutionCoverage(t *testing.T) {
	w := week()
	w.Publication.Coverage = standard.Coverage{Institution: true}
	doc, ok := ForTeacher(w, w.Teachers[1])
	if !ok {
		t.Fatal("the whole institution covers every teacher")
	}
	valid(t, doc)
	if got := doc.Publication.Coverage; !equalCoverage(got, standard.Coverage{TeacherIDs: []string{"t-2"}}) {
		t.Errorf("coverage = %+v, want only the teacher", got)
	}
}

func TestSliceDoesNotShareMemory(t *testing.T) {
	w := week()
	doc, _ := ForTeacher(w, w.Teachers[0])
	doc.Publication.Coverage.BuildingIDs[0] = "changed"
	if w.Publication.Coverage.BuildingIDs[0] != "b-1" {
		t.Error("changing the slice changed the week")
	}
}

func TestCatalogLatestWins(t *testing.T) {
	older, newer := week(), week()
	older.Publication.Period = standard.Period{Start: "2026-11-02", End: "2026-11-08"}
	older.Groups[0].Name = "ИС-24" // renamed since
	older.Groups = append(older.Groups, standard.Group{ID: "g-old", Name: "Выпуск-22"})

	c := NewCatalog("ex", []*standard.Document{newer, older}, func(d *standard.Document) string {
		return d.Publication.Period.Start + ".json"
	})
	if got := ids(c.Weeks, func(w CatalogWeek) string { return w.File }); !slices.Equal(got, []string{"2026-11-02.json", "2026-11-09.json"}) {
		t.Errorf("weeks = %v, want both in date order", got)
	}
	names := map[string]string{}
	for _, g := range c.Groups {
		names[g.ID] = g.Name
	}
	if names["g-a"] != "ИС-25" {
		t.Errorf("g-a = %q, want the latest name", names["g-a"])
	}
	if names["g-old"] != "Выпуск-22" {
		t.Error("a group from an older week must stay in the catalog")
	}
}

func equalCoverage(a, b standard.Coverage) bool {
	return a.Institution == b.Institution && slices.Equal(a.BuildingIDs, b.BuildingIDs) &&
		slices.Equal(a.GroupIDs, b.GroupIDs) && slices.Equal(a.TeacherIDs, b.TeacherIDs)
}
