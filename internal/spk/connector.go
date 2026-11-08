// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

package spk

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/NikkiShuRA/orbit-schedule/internal/standard"
)

// Name and Version identify this connector in provenance.
const (
	Name    = "spk"
	Version = "0.1.0"
)

// The institution and its time zone (Surgut, UTC+5).
const (
	InstitutionName      = "Сургутский политехнический колледж"
	InstitutionShortName = "СПК"
	TimeZone             = "Asia/Yekaterinburg"
)

// ErrNotPublished means the source has no schedule for the requested
// week yet. It is not a failure of the connector.
var ErrNotPublished = errors.New("schedule not published")

// nilGUID is how the source writes "no value" in a reference field.
const nilGUID = "00000000-0000-0000-0000-000000000000"

// Fetch downloads the week (Monday to Sunday) that contains date
// ("YYYY-MM-DD") and converts it to a standard document.
func Fetch(ctx context.Context, c *Client, date string) (*standard.Document, error) {
	loc, err := time.LoadLocation(TimeZone)
	if err != nil {
		return nil, err
	}
	d, err := time.ParseInLocation(time.DateOnly, date, loc)
	if err != nil {
		return nil, err
	}
	monday := mondayOf(d)

	days, err := c.days(ctx, monday)
	if err != nil {
		return nil, fmt.Errorf("lessons: %w", err)
	}
	ref, err := c.reference(ctx)
	if err != nil {
		return nil, fmt.Errorf("reference lists: %w", err)
	}
	doc, err := convert(ref, days, monday, c.Base, time.Now())
	if err != nil {
		return nil, err
	}
	// Start times are a separate, optional fact: without them the week is
	// still complete, so a problem here is a warning, not a failure.
	b, err := c.bells(ctx)
	if err != nil {
		if c.Warn != nil {
			c.Warn(fmt.Sprintf("start times of periods: %v; publishing without them", err))
		}
		return doc, nil
	}
	doc.BellSchedules = []standard.BellSchedule{b}
	return doc, nil
}

// mondayOf returns local midnight of the Monday of t's week. Go numbers
// weekdays from Sunday (0), so Monday is 1 and Sunday must go back 6.
func mondayOf(t time.Time) time.Time {
	back := (int(t.Weekday()) + 6) % 7
	y, m, d := t.AddDate(0, 0, -back).Date()
	return time.Date(y, m, d, 0, 0, 0, 0, t.Location())
}

// clean normalises whitespace only: trims the ends and collapses runs.
// The standard allows nothing else to change in source text.
func clean(s string) string { return strings.Join(strings.Fields(s), " ") }

// id turns the null GUID and blanks into "" (no value).
func id(s string) string {
	s = strings.TrimSpace(s)
	if s == nilGUID {
		return ""
	}
	return s
}

// convert is the pure part of the connector: source data in, document
// out. It is separate from Fetch so tests can run it on fixtures.
//
// Coverage is the whole college: the source publishes a week for all
// groups at once, as one response, and has no notion of a partly
// published week. A day without lessons inside a published week is a day
// without lessons. A week with no lessons at all is not published.
func convert(ref reference, days []day, monday time.Time, base Base, now time.Time) (*standard.Document, error) {
	loc := monday.Location()
	start := monday.Format(time.DateOnly)
	end := monday.AddDate(0, 0, 6).Format(time.DateOnly)

	idx := newIndex(ref)
	used := newUsed()
	lessons := []standard.Lesson{} // never nil: see standard.Document
	for _, d := range days {
		t := time.UnixMilli(d.Date).In(loc)
		if t.Hour() != 0 || t.Minute() != 0 || t.Second() != 0 || t.Nanosecond() != 0 {
			// Dates are sent as local midnight. Anything else means the
			// format changed, and picking a day would be a guess.
			return nil, fmt.Errorf("day %d is not a local midnight (%s)", d.Date, t.Format(time.RFC3339))
		}
		date := t.Format(time.DateOnly)
		if date < start || date > end {
			continue // the response also holds the neighbouring weeks
		}
		for i, l := range d.Lessons {
			out, err := convertLesson(l, date, idx, used)
			if err != nil {
				return nil, fmt.Errorf("%s, lesson %d: %w", date, i+1, err)
			}
			lessons = append(lessons, out)
		}
	}
	if len(lessons) == 0 {
		return nil, fmt.Errorf("%w: no lessons for %s – %s", ErrNotPublished, start, end)
	}

	// Groups are listed in full, also those without lessons this week:
	// for them the document says "no lessons", which is true within the
	// coverage. Other lists keep only what the lessons use: the source's
	// lists include about a thousand teachers and rooms of past years.
	var groups []standard.Group
	departments := map[string]bool{}
	for _, g := range ref.Groups {
		gid := id(g.ID)
		if gid == "" || clean(g.Name) == "" {
			continue
		}
		out := standard.Group{ID: gid, Name: clean(g.Name)}
		if g.Course > 0 {
			out.Course = g.Course
		}
		if _, ok := idx.departments[id(g.Division)]; ok {
			out.DepartmentID = id(g.Division)
			departments[out.DepartmentID] = true
		}
		groups = append(groups, out)
	}
	groupName := map[string]string{}
	for _, g := range groups {
		groupName[g.ID] = g.Name
	}
	sortLessons(lessons, groupName)

	return &standard.Document{
		StandardVersion: standard.Version,
		Institution: standard.Institution{
			ID:        Name,
			Name:      InstitutionName,
			ShortName: InstitutionShortName,
			TimeZone:  TimeZone,
		},
		Publication: standard.Publication{
			Period:   standard.Period{Start: start, End: end},
			Coverage: standard.Coverage{Institution: true},
		},
		Provenance: standard.Provenance{
			Connector:   standard.Connector{Name: Name, Version: Version},
			Source:      standard.Source{Name: base.Name, URL: base.URL},
			RetrievedAt: now.In(loc).Format(time.RFC3339),
		},
		Buildings: sorted(pickNamed(idx.buildings, used.buildings, func(n named) standard.Building {
			return standard.Building{ID: n.ID, Name: clean(n.Name)}
		}), func(x standard.Building) (string, string) { return x.Name, x.ID }),
		Departments: sorted(pickNamed(idx.departments, departments, func(n named) standard.Department {
			return standard.Department{ID: n.ID, Name: clean(n.Name)}
		}), func(x standard.Department) (string, string) { return x.Name, x.ID }),
		Rooms: sorted(pickNamed(idx.rooms, used.rooms, func(r room) standard.Room {
			return standard.Room{ID: r.ID, Name: clean(r.Name), Code: clean(r.ShortName)}
		}), func(x standard.Room) (string, string) { return x.Name, x.ID }),
		Groups: sorted(groups, func(x standard.Group) (string, string) { return x.Name, x.ID }),
		Teachers: sorted(pickNamed(idx.teachers, used.teachers, func(n named) standard.Teacher {
			return standard.Teacher{ID: n.ID, Name: clean(n.Name)}
		}), func(x standard.Teacher) (string, string) { return x.Name, x.ID }),
		Subjects: sorted(pickNamed(idx.subjects, used.subjects, func(n named) standard.Subject {
			return standard.Subject{ID: n.ID, Name: clean(n.Name)}
		}), func(x standard.Subject) (string, string) { return x.Name, x.ID }),
		LessonTypes: sorted(pickNamed(idx.lessonTypes, used.lessonTypes, func(n named) standard.LessonType {
			return standard.LessonType{ID: n.ID, Name: clean(n.Name)}
		}), func(x standard.LessonType) (string, string) { return x.Name, x.ID }),
		Lessons: lessons,
	}, nil
}

// index holds the source's reference lists by id. Entries without an id
// or a name are left out: the standard requires both.
type index struct {
	buildings, departments, teachers, subjects, lessonTypes map[string]named
	rooms                                                   map[string]room
	groups                                                  map[string]bool
}

func newIndex(ref reference) index {
	byID := func(list []named) map[string]named {
		m := make(map[string]named, len(list))
		for _, n := range list {
			if n.ID = id(n.ID); n.ID != "" && clean(n.Name) != "" {
				m[n.ID] = n
			}
		}
		return m
	}
	rooms := make(map[string]room, len(ref.Rooms))
	for _, r := range ref.Rooms {
		if r.ID = id(r.ID); r.ID != "" && clean(r.Name) != "" {
			rooms[r.ID] = r
		}
	}
	groups := make(map[string]bool, len(ref.Groups))
	for _, g := range ref.Groups {
		if gid := id(g.ID); gid != "" && clean(g.Name) != "" {
			groups[gid] = true
		}
	}
	return index{
		buildings:   byID(ref.Territories),
		departments: byID(ref.Divisions),
		teachers:    byID(ref.Teachers),
		subjects:    byID(ref.Disciplines),
		lessonTypes: byID(ref.LessonTypes),
		rooms:       rooms,
		groups:      groups,
	}
}

// used collects the ids the lessons refer to.
type used struct {
	buildings, rooms, teachers, subjects, lessonTypes map[string]bool
}

func newUsed() used {
	return used{
		buildings: map[string]bool{}, rooms: map[string]bool{}, teachers: map[string]bool{},
		subjects: map[string]bool{}, lessonTypes: map[string]bool{},
	}
}

// convertLesson turns one source lesson into a standard lesson.
//
// A reference to an entry the reference lists do not have is an error,
// not a silently dropped field: the connector reports what it cannot
// read instead of guessing, and the last good file stays published.
func convertLesson(l lesson, date string, idx index, u used) (standard.Lesson, error) {
	out := standard.Lesson{Date: date, Period: l.Number}
	if l.Subgroup < 0 {
		return out, fmt.Errorf("bad subgroup %d", l.Subgroup)
	}

	gid := id(l.Group)
	if gid == "" {
		return out, errors.New("no group")
	}
	if !idx.groups[gid] {
		return out, fmt.Errorf("unknown group %s", gid)
	}
	out.Groups = []standard.LessonGroup{{GroupID: gid, Subgroup: l.Subgroup}}

	// ref checks one optional reference and marks it as used.
	ref := func(kind, v string, known func(string) bool, mark map[string]bool) (string, error) {
		v = id(v)
		if v == "" {
			return "", nil
		}
		if !known(v) {
			return "", fmt.Errorf("unknown %s %s", kind, v)
		}
		mark[v] = true
		return v, nil
	}
	has := func(m map[string]named) func(string) bool {
		return func(k string) bool { _, ok := m[k]; return ok }
	}

	var err error
	if out.BuildingID, err = ref("building", l.Territory, has(idx.buildings), u.buildings); err != nil {
		return out, err
	}
	if out.SubjectID, err = ref("subject", l.Discipline, has(idx.subjects), u.subjects); err != nil {
		return out, err
	}
	if out.LessonTypeID, err = ref("lesson type", l.LessonType, has(idx.lessonTypes), u.lessonTypes); err != nil {
		return out, err
	}
	t, err := ref("teacher", l.Teacher, has(idx.teachers), u.teachers)
	if err != nil {
		return out, err
	}
	if t != "" {
		out.Teachers = []standard.TeacherRef{{TeacherID: t}}
	}
	r, err := ref("room", l.Room, func(k string) bool { _, ok := idx.rooms[k]; return ok }, u.rooms)
	if err != nil {
		return out, err
	}
	if r != "" {
		out.Rooms = []standard.RoomRef{{RoomID: r}}
	}
	return out, nil
}

// pickNamed converts the entries whose id is in need.
func pickNamed[S any, T any](all map[string]S, need map[string]bool, conv func(S) T) []T {
	var out []T
	for k := range need {
		if s, ok := all[k]; ok {
			out = append(out, conv(s))
		}
	}
	return out
}

// sorted orders the entries by name, then by id. Without a fixed order
// identical input could give different files, and the git history would
// show changes that are not there. It returns nil for none: the schema
// forbids empty lists.
func sorted[T any](list []T, key func(T) (name, id string)) []T {
	if len(list) == 0 {
		return nil
	}
	slices.SortFunc(list, func(a, b T) int {
		na, ia := key(a)
		nb, ib := key(b)
		return cmp.Or(cmp.Compare(na, nb), cmp.Compare(ia, ib))
	})
	return list
}

// sortLessons gives lessons a fixed order. The source has no lesson ids,
// so every field takes part: two lessons that tie on all of them are
// identical, and their order does not matter.
func sortLessons(ls []standard.Lesson, groupName map[string]string) {
	period := func(l standard.Lesson) int {
		if l.Period == nil {
			return -1
		}
		return *l.Period
	}
	first := func(l standard.Lesson) (teacher, room string) {
		if len(l.Teachers) > 0 {
			teacher = l.Teachers[0].TeacherID
		}
		if len(l.Rooms) > 0 {
			room = l.Rooms[0].RoomID
		}
		return
	}
	slices.SortFunc(ls, func(a, b standard.Lesson) int {
		ta, ra := first(a)
		tb, rb := first(b)
		return cmp.Or(
			cmp.Compare(a.Date, b.Date),
			cmp.Compare(period(a), period(b)),
			cmp.Compare(groupName[a.Groups[0].GroupID], groupName[b.Groups[0].GroupID]),
			cmp.Compare(a.Groups[0].GroupID, b.Groups[0].GroupID),
			cmp.Compare(a.Groups[0].Subgroup, b.Groups[0].Subgroup),
			cmp.Compare(a.SubjectID, b.SubjectID),
			cmp.Compare(ta, tb),
			cmp.Compare(ra, rb),
			cmp.Compare(a.BuildingID, b.BuildingID),
			cmp.Compare(a.LessonTypeID, b.LessonTypeID),
		)
	})
}
