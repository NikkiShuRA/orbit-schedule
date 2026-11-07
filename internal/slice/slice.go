// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// Package slice cuts a published week into small documents for one group
// or one teacher, and builds the catalog the app uses to find them.
//
// Every slice is a regular standard document (ADR 0006): its coverage is
// the week's coverage narrowed to the group or teacher, it holds the
// week's lessons of that group or teacher, and its reference lists keep
// only what those lessons use. Provenance is copied unchanged: slicing
// adds no data, it only selects.
package slice

import (
	"cmp"
	"slices"

	"github.com/NikkiShuRA/orbit-schedule/internal/standard"
)

// ForGroup returns the week of group g. g is the group's reference entry:
// from the week itself, or from the catalog when the group has no lessons
// this week. ok is false when the week's coverage leaves the group out,
// so nothing honest can be said about it.
func ForGroup(week *standard.Document, g standard.Group) (doc *standard.Document, ok bool) {
	cov, ok := narrow(week.Publication.Coverage, &week.Publication.Coverage.GroupIDs, g.ID)
	if !ok {
		return nil, false
	}
	cov.GroupIDs = []string{g.ID}
	lessons := filter(week.Lessons, func(l standard.Lesson) bool {
		return slices.ContainsFunc(l.Groups, func(x standard.LessonGroup) bool { return x.GroupID == g.ID })
	})
	return build(week, cov, lessons, []standard.Group{g}, nil), true
}

// ForTeacher returns the week of teacher t, like ForGroup.
func ForTeacher(week *standard.Document, t standard.Teacher) (doc *standard.Document, ok bool) {
	cov, ok := narrow(week.Publication.Coverage, &week.Publication.Coverage.TeacherIDs, t.ID)
	if !ok {
		return nil, false
	}
	cov.TeacherIDs = []string{t.ID}
	lessons := filter(week.Lessons, func(l standard.Lesson) bool {
		return slices.ContainsFunc(l.Teachers, func(x standard.TeacherRef) bool { return x.TeacherID == t.ID })
	})
	return build(week, cov, lessons, nil, []standard.Teacher{t}), true
}

// narrow copies the coverage for a slice by one id. list points at the
// coverage field of that kind. If the week already limits that field and
// the id is not in it, the week says nothing about the id: ok is false.
// "Whole institution" becomes "no limits" before the caller adds the id.
func narrow(c standard.Coverage, list *[]string, id string) (out standard.Coverage, ok bool) {
	if *list != nil && !slices.Contains(*list, id) {
		return standard.Coverage{}, false
	}
	if c.Institution {
		return standard.Coverage{}, true
	}
	// Copy the slices: the slice document must not share memory with
	// the week, or changing one would change the other.
	return standard.Coverage{
		BuildingIDs: slices.Clone(c.BuildingIDs),
		GroupIDs:    slices.Clone(c.GroupIDs),
		TeacherIDs:  slices.Clone(c.TeacherIDs),
	}, true
}

func filter(ls []standard.Lesson, keep func(standard.Lesson) bool) []standard.Lesson {
	out := []standard.Lesson{} // never nil: "no lessons" is written as []
	for _, l := range ls {
		if keep(l) {
			out = append(out, l)
		}
	}
	return out
}

// build assembles a slice document: the lessons plus every reference
// entry they, the coverage and the extra entries point at.
func build(week *standard.Document, cov standard.Coverage, lessons []standard.Lesson, extraGroups []standard.Group, extraTeachers []standard.Teacher) *standard.Document {
	need := newRefs()
	for _, id := range cov.BuildingIDs {
		need.buildings[id] = true
	}
	for _, g := range extraGroups {
		need.groups[g.ID] = true
	}
	for _, t := range extraTeachers {
		need.teachers[t.ID] = true
	}
	for _, l := range lessons {
		need.lesson(l)
	}
	// Rooms and groups point at buildings and departments, so they are
	// resolved first and add their own references.
	rooms := pick(week.Rooms, func(x standard.Room) string { return x.ID }, need.rooms)
	for _, r := range rooms {
		need.buildings[r.BuildingID] = true
	}
	groups := withExtra(pick(week.Groups, func(x standard.Group) string { return x.ID }, need.groups), extraGroups,
		func(x standard.Group) string { return x.ID })
	for _, g := range groups {
		need.buildings[g.BuildingID] = true
		need.departments[g.DepartmentID] = true
	}
	// Bell schedules are short and apply to buildings, not lessons: keep
	// those for the buildings in the slice.
	bells := filterFunc(week.BellSchedules, func(b standard.BellSchedule) bool {
		return len(b.BuildingIDs) == 0 || slices.ContainsFunc(b.BuildingIDs, func(id string) bool { return need.buildings[id] })
	})
	for _, b := range bells {
		for _, id := range b.BuildingIDs {
			need.buildings[id] = true // a kept schedule must resolve all its buildings
		}
	}

	return &standard.Document{
		StandardVersion: standard.Version,
		Institution:     week.Institution,
		Publication: standard.Publication{
			Period:         week.Publication.Period,
			Coverage:       cov,
			NonWorkingDays: week.Publication.NonWorkingDays,
		},
		Provenance:    week.Provenance,
		Buildings:     pick(week.Buildings, func(x standard.Building) string { return x.ID }, need.buildings),
		Departments:   pick(week.Departments, func(x standard.Department) string { return x.ID }, need.departments),
		Rooms:         rooms,
		Groups:        groups,
		Teachers:      withExtra(pick(week.Teachers, func(x standard.Teacher) string { return x.ID }, need.teachers), extraTeachers, func(x standard.Teacher) string { return x.ID }),
		Subjects:      pick(week.Subjects, func(x standard.Subject) string { return x.ID }, need.subjects),
		LessonTypes:   pick(week.LessonTypes, func(x standard.LessonType) string { return x.ID }, need.lessonTypes),
		BellSchedules: bells,
		Lessons:       lessons,
	}
}

// refs collects the ids a slice needs, one set per reference list.
type refs struct {
	buildings, departments, rooms, groups, teachers, subjects, lessonTypes map[string]bool
}

func newRefs() refs {
	return refs{
		buildings: map[string]bool{}, departments: map[string]bool{}, rooms: map[string]bool{},
		groups: map[string]bool{}, teachers: map[string]bool{}, subjects: map[string]bool{},
		lessonTypes: map[string]bool{},
	}
}

func (r refs) lesson(l standard.Lesson) {
	r.buildings[l.BuildingID] = true
	r.subjects[l.SubjectID] = true
	r.lessonTypes[l.LessonTypeID] = true
	for _, g := range l.Groups {
		r.groups[g.GroupID] = true
	}
	for _, t := range l.Teachers {
		r.teachers[t.TeacherID] = true
	}
	for _, x := range l.Rooms {
		r.rooms[x.RoomID] = true
	}
}

// pick keeps the entries whose id is needed, in their original order.
// It returns nil for none, because the standard forbids empty lists.
func pick[T any](list []T, id func(T) string, need map[string]bool) []T {
	var out []T
	for _, x := range list {
		if need[id(x)] {
			out = append(out, x)
		}
	}
	return out
}

func filterFunc[T any](list []T, keep func(T) bool) []T {
	var out []T
	for _, x := range list {
		if keep(x) {
			out = append(out, x)
		}
	}
	return out
}

// withExtra adds the extra entries that the list does not have yet. The
// week's own entry wins: it is what this week published.
func withExtra[T any](list, extra []T, id func(T) string) []T {
	for _, x := range extra {
		if !slices.ContainsFunc(list, func(y T) bool { return id(y) == id(x) }) {
			list = append(list, x)
		}
	}
	return list
}

// Catalog lists what a source has published recently, so the app can
// offer a search over groups and teachers and find their files. It is a
// publication file, not part of the standard (ADR 0006).
type Catalog struct {
	Source      string                `json:"source"`
	Institution standard.Institution  `json:"institution"`
	Weeks       []CatalogWeek         `json:"weeks"`
	Buildings   []standard.Building   `json:"buildings,omitempty"`
	Departments []standard.Department `json:"departments,omitempty"`
	Groups      []standard.Group      `json:"groups,omitempty"`
	Teachers    []standard.Teacher    `json:"teachers,omitempty"`
}

// CatalogWeek is one published week and what it covers.
type CatalogWeek struct {
	Start    string            `json:"start"`
	End      string            `json:"end"`
	File     string            `json:"file"`
	Coverage standard.Coverage `json:"coverage"`
}

// NewCatalog builds the catalog of a source from its weeks. When an
// entry differs between weeks, the latest week wins: names do change,
// for example when a group moves to the next course.
func NewCatalog(source string, weeks []*standard.Document, file func(*standard.Document) string) Catalog {
	sorted := slices.Clone(weeks)
	slices.SortFunc(sorted, func(a, b *standard.Document) int {
		return cmp.Compare(a.Publication.Period.Start, b.Publication.Period.Start)
	})
	c := Catalog{Source: source, Weeks: []CatalogWeek{}}
	buildings := map[string]standard.Building{}
	departments := map[string]standard.Department{}
	groups := map[string]standard.Group{}
	teachers := map[string]standard.Teacher{}
	for _, w := range sorted {
		c.Institution = w.Institution
		c.Weeks = append(c.Weeks, CatalogWeek{
			Start: w.Publication.Period.Start, End: w.Publication.Period.End,
			File: file(w), Coverage: w.Publication.Coverage,
		})
		for _, x := range w.Buildings {
			buildings[x.ID] = x
		}
		for _, x := range w.Departments {
			departments[x.ID] = x
		}
		for _, x := range w.Groups {
			groups[x.ID] = x
		}
		for _, x := range w.Teachers {
			teachers[x.ID] = x
		}
	}
	c.Buildings = byName(buildings, func(x standard.Building) string { return x.Name })
	c.Departments = byName(departments, func(x standard.Department) string { return x.Name })
	c.Groups = byName(groups, func(x standard.Group) string { return x.Name })
	c.Teachers = byName(teachers, func(x standard.Teacher) string { return x.Name })
	return c
}

// byName returns the map values ordered by name, then id, so the same
// input always gives the same file.
func byName[T any](m map[string]T, name func(T) string) []T {
	ids := make([]string, 0, len(m))
	for id := range m {
		ids = append(ids, id)
	}
	slices.SortFunc(ids, func(a, b string) int {
		return cmp.Or(cmp.Compare(name(m[a]), name(m[b])), cmp.Compare(a, b))
	})
	var out []T
	for _, id := range ids {
		out = append(out, m[id])
	}
	return out
}
