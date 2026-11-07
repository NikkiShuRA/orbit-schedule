package sieup

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/NikkiShuRA/orbit-schedule/internal/standard"
)

// Name and Version identify this connector in provenance.
const (
	Name    = "sieup"
	Version = "0.1.0"
)

// The institution and its time zone (Surgut, UTC+5). All times in the
// source are local.
const (
	InstitutionName      = "Сургутский институт экономики, управления и права"
	InstitutionShortName = "СИЭУиП"
	TimeZone             = "Asia/Yekaterinburg"
)

// ErrNotPublished means the source has no schedule for the requested
// week yet. It is not a failure of the connector.
var ErrNotPublished = errors.New("schedule not published")

// Fetch downloads the week that contains date ("YYYY-MM-DD") and converts
// it to a standard document.
//
// Buildings are fetched one after another, not in parallel: there are
// only a few of them, and a sequential run is gentler on the source.
func Fetch(ctx context.Context, c *Client, date string) (*standard.Document, error) {
	w, err := c.weekAt(ctx, date)
	if err != nil {
		return nil, fmt.Errorf("week: %w", err)
	}
	divs, err := c.divisions(ctx)
	if err != nil {
		return nil, fmt.Errorf("buildings: %w", err)
	}
	byDivision := make(map[string][]lesson, len(divs))
	for _, d := range divs {
		ls, err := c.lessons(ctx, d.Name, w.ID)
		if err != nil {
			return nil, fmt.Errorf("lessons of %q: %w", d.Name, err)
		}
		byDivision[d.ID] = ls
	}
	return convert(w, divs, byDivision, c.Base(), time.Now())
}

var vacancy = regexp.MustCompile(`(?i)^вакансия$`)

// clean normalises whitespace only: trims the ends and collapses runs.
// The standard allows nothing else to change in source text.
func clean(s string) string { return strings.Join(strings.Fields(s), " ") }

// sourceDate turns "2026-11-09T00:00:00.000Z" into "2026-11-09". The
// source writes calendar dates as UTC midnight, so the UTC date is the
// intended one.
func sourceDate(s string) (string, error) {
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return "", fmt.Errorf("bad date %q: %w", s, err)
	}
	return t.UTC().Format(time.DateOnly), nil
}

// convert is the pure part of the connector: source data in, document
// out. It is separate from Fetch so tests can run it on fixtures.
func convert(w week, divs []division, byDivision map[string][]lesson, base string, now time.Time) (*standard.Document, error) {
	start, err := sourceDate(w.DateStart)
	if err != nil {
		return nil, err
	}
	end, err := sourceDate(w.DateEnd)
	if err != nil {
		return nil, err
	}
	loc, err := time.LoadLocation(TimeZone)
	if err != nil {
		return nil, err
	}

	// Reference lists are built as maps keyed by id, so each item is
	// added once however many lessons mention it.
	buildings := map[string]standard.Building{}
	rooms := map[string]standard.Room{}
	groups := map[string]standard.Group{}
	teachers := map[string]standard.Teacher{}
	subjects := map[string]standard.Subject{}

	for _, d := range divs {
		buildings[d.ID] = standard.Building{ID: d.ID, Name: clean(d.Name), ShortName: clean(d.AbbName)}
	}

	var covered []string
	lessons := []standard.Lesson{} // never nil: see standard.Document
	for _, d := range divs {
		ls := byDivision[d.ID]
		// The source publishes a week building by building. A building
		// with no lessons at all in the week is not published yet, so it
		// stays out of the coverage ("unknown"), not "no lessons".
		if len(ls) == 0 {
			continue
		}
		covered = append(covered, d.ID)

		for _, l := range ls {
			out, err := convertLesson(l, d.ID, groups, rooms, teachers, subjects)
			if err != nil {
				return nil, fmt.Errorf("lesson %s: %w", l.ID, err)
			}
			lessons = append(lessons, out)
		}
	}
	if len(covered) == 0 {
		return nil, fmt.Errorf("%w: week %d (%s – %s) has no lessons in any building", ErrNotPublished, w.Number, start, end)
	}

	// Groups refer to buildings; keep only references the document can
	// resolve, in case a group lists a building the API does not return.
	for id, g := range groups {
		if _, ok := buildings[g.BuildingID]; !ok {
			g.BuildingID = ""
			groups[id] = g
		}
	}

	sortLessons(lessons, groups)
	doc := &standard.Document{
		StandardVersion: standard.Version,
		Institution: standard.Institution{
			ID:        "sieup",
			Name:      InstitutionName,
			ShortName: InstitutionShortName,
			TimeZone:  TimeZone,
		},
		Publication: standard.Publication{
			Period:   standard.Period{Start: start, End: end},
			Coverage: standard.Coverage{BuildingIDs: covered},
		},
		Provenance: standard.Provenance{
			Connector:      standard.Connector{Name: Name, Version: Version},
			Source:         standard.Source{Name: "API расписания СИЭУиП", URL: base},
			RetrievedAt:    now.In(loc).Format(time.RFC3339),
			SourceRevision: strconv.Itoa(w.Version),
		},
		Buildings: sorted(buildings, func(x standard.Building) string { return x.Name }),
		Rooms:     sorted(rooms, func(x standard.Room) string { return x.Name }),
		Groups:    sorted(groups, func(x standard.Group) string { return x.Name }),
		Teachers:  sorted(teachers, func(x standard.Teacher) string { return x.Name }),
		Subjects:  sorted(subjects, func(x standard.Subject) string { return x.Name }),
		Lessons:   lessons,
	}
	return doc, nil
}

func convertLesson(
	l lesson,
	buildingID string,
	groups map[string]standard.Group,
	rooms map[string]standard.Room,
	teachers map[string]standard.Teacher,
	subjects map[string]standard.Subject,
) (standard.Lesson, error) {
	if l.Group == nil || l.Group.ID == "" {
		return standard.Lesson{}, errors.New("no group")
	}
	out := standard.Lesson{
		ID:         l.ID,
		Date:       l.Date,
		Period:     l.LessonNumber,
		BuildingID: buildingID,
		Groups:     []standard.LessonGroup{{GroupID: l.Group.ID, Subgroup: l.Subgroup}},
		Note:       clean(deref(l.Note)),
	}
	// Times are kept only as a pair: the standard has no half-known time.
	if l.TimeStart != "" && l.TimeEnd != "" {
		out.Start, out.End = l.TimeStart, l.TimeEnd
	}

	if _, ok := groups[l.Group.ID]; !ok {
		g := standard.Group{ID: l.Group.ID, Name: clean(l.Group.Name), BuildingID: l.Group.DivisionID}
		if n, err := strconv.Atoi(strings.TrimSpace(l.Group.Course)); err == nil && n > 0 {
			g.Course = n
		}
		groups[g.ID] = g
	}

	if c := l.Cabinet; c != nil && c.ID != "" {
		out.Rooms = []standard.RoomRef{{RoomID: c.ID}}
		if _, ok := rooms[c.ID]; !ok {
			rooms[c.ID] = standard.Room{ID: c.ID, Name: clean(c.Name), Code: clean(c.Number)}
		}
	}

	if s := l.Subject; s != nil && s.ID != "" && clean(s.Name) != "" {
		out.SubjectID = s.ID
		if _, ok := subjects[s.ID]; !ok {
			subjects[s.ID] = standard.Subject{ID: s.ID, Name: clean(s.Name), ShortName: clean(s.AbbName)}
		}
	}

	if t := l.Teacher; t != nil && clean(t.Name) != "" {
		name := clean(t.Name)
		switch {
		case vacancy.MatchString(name):
			out.Teachers = []standard.TeacherRef{{Placeholder: standard.PlaceholderUnassigned, SourceText: name}}
		case t.ID != "":
			out.Teachers = []standard.TeacherRef{{TeacherID: t.ID}}
			if _, ok := teachers[t.ID]; !ok {
				teachers[t.ID] = standard.Teacher{ID: t.ID, Name: name, ShortName: clean(t.AbbName)}
			}
		}
	}
	return out, nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// sorted returns the map values ordered by name, then by id (the map
// key). Go maps have no order, so without sorting every run would write
// the lists differently; a stable order keeps the output identical for
// identical input, and git history shows only real changes.
func sorted[T any](m map[string]T, name func(T) string) []T {
	if len(m) == 0 {
		return nil // omitted from JSON; the schema forbids empty lists
	}
	ids := make([]string, 0, len(m))
	for id := range m {
		ids = append(ids, id)
	}
	slices.SortFunc(ids, func(a, b string) int {
		return cmp.Or(cmp.Compare(name(m[a]), name(m[b])), cmp.Compare(a, b))
	})
	out := make([]T, len(ids))
	for i, id := range ids {
		out[i] = m[id]
	}
	return out
}

func sortLessons(ls []standard.Lesson, groups map[string]standard.Group) {
	period := func(l standard.Lesson) int {
		if l.Period == nil {
			return -1
		}
		return *l.Period
	}
	slices.SortFunc(ls, func(a, b standard.Lesson) int {
		return cmp.Or(
			cmp.Compare(a.Date, b.Date),
			cmp.Compare(period(a), period(b)),
			cmp.Compare(a.Start, b.Start),
			cmp.Compare(groups[a.Groups[0].GroupID].Name, groups[b.Groups[0].GroupID].Name),
			cmp.Compare(a.Groups[0].Subgroup, b.Groups[0].Subgroup),
			cmp.Compare(a.ID, b.ID),
		)
	})
}
