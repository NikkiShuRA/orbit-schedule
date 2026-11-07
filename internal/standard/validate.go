// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

package standard

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"sync"

	"github.com/santhosh-tekuri/jsonschema/v6"
	"golang.org/x/text/language"
	"golang.org/x/text/message"

	"github.com/NikkiShuRA/orbit-schedule/standard/schema"
)

// Result of validating a document. Errors make the document invalid.
// Warnings flag odd but real source data and never fail validation.
type Result struct {
	Errors   []string
	Warnings []string
}

// OK reports whether the document has no errors.
func (r Result) OK() bool { return len(r.Errors) == 0 }

// compiled schema, built once on first use.
var (
	compileOnce sync.Once
	compiled    *jsonschema.Schema
	compileErr  error
)

func compiledSchema() (*jsonschema.Schema, error) {
	compileOnce.Do(func() {
		doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(schema.JSON))
		if err != nil {
			compileErr = fmt.Errorf("parse schema: %w", err)
			return
		}
		c := jsonschema.NewCompiler()
		c.AssertFormat() // check "date", "date-time", "uri", not only types
		if err := c.AddResource(schema.ID, doc); err != nil {
			compileErr = fmt.Errorf("add schema: %w", err)
			return
		}
		compiled, compileErr = c.Compile(schema.ID)
	})
	return compiled, compileErr
}

// Validate checks raw JSON against the schema, then checks what JSON
// Schema cannot express: unique ids, references and the period order.
// The returned error is only for broken input or a broken schema; an
// invalid document is reported in Result.Errors.
func Validate(data []byte) (Result, error) {
	sch, err := compiledSchema()
	if err != nil {
		return Result{}, err
	}
	inst, err := jsonschema.UnmarshalJSON(bytes.NewReader(data))
	if err != nil {
		return Result{}, fmt.Errorf("parse document: %w", err)
	}

	if err := sch.Validate(inst); err != nil {
		var ve *jsonschema.ValidationError
		if !errors.As(err, &ve) {
			return Result{}, err
		}
		return Result{Errors: schemaErrors(ve)}, nil
	}

	var doc Document
	if err := json.Unmarshal(data, &doc); err != nil {
		return Result{}, fmt.Errorf("decode document: %w", err)
	}
	return checkSemantics(&doc), nil
}

// printer renders schema error messages; the library needs one to turn
// an error kind into text.
var printer = message.NewPrinter(language.English)

// schemaErrors flattens the error tree into "location message" lines.
func schemaErrors(ve *jsonschema.ValidationError) []string {
	var out []string
	var walk func(e *jsonschema.ValidationError)
	walk = func(e *jsonschema.ValidationError) {
		if len(e.Causes) == 0 {
			out = append(out, fmt.Sprintf("/%s %s", joinPath(e.InstanceLocation), e.ErrorKind.LocalizedString(printer)))
			return
		}
		for _, c := range e.Causes {
			walk(c)
		}
	}
	walk(ve)
	sort.Strings(out)
	return out
}

func joinPath(parts []string) string {
	var b bytes.Buffer
	for i, p := range parts {
		if i > 0 {
			b.WriteByte('/')
		}
		b.WriteString(p)
	}
	return b.String()
}

// checkSemantics mirrors standard/tools/validate.mjs.
func checkSemantics(d *Document) Result {
	var r Result
	errf := func(format string, a ...any) { r.Errors = append(r.Errors, fmt.Sprintf(format, a...)) }
	warnf := func(format string, a ...any) { r.Warnings = append(r.Warnings, fmt.Sprintf(format, a...)) }

	// ids collects the ids of one reference list and reports duplicates.
	ids := func(list string, n int, id func(i int) string) map[string]bool {
		seen := make(map[string]bool, n)
		for i := 0; i < n; i++ {
			v := id(i)
			if v == "" {
				continue
			}
			if seen[v] {
				errf("/%s/%d/id duplicate id %q", list, i, v)
			}
			seen[v] = true
		}
		return seen
	}
	buildings := ids("buildings", len(d.Buildings), func(i int) string { return d.Buildings[i].ID })
	departments := ids("departments", len(d.Departments), func(i int) string { return d.Departments[i].ID })
	rooms := ids("rooms", len(d.Rooms), func(i int) string { return d.Rooms[i].ID })
	groups := ids("groups", len(d.Groups), func(i int) string { return d.Groups[i].ID })
	teachers := ids("teachers", len(d.Teachers), func(i int) string { return d.Teachers[i].ID })
	subjects := ids("subjects", len(d.Subjects), func(i int) string { return d.Subjects[i].ID })
	lessonTypes := ids("lessonTypes", len(d.LessonTypes), func(i int) string { return d.LessonTypes[i].ID })
	ids("bellSchedules", len(d.BellSchedules), func(i int) string { return d.BellSchedules[i].ID })
	ids("lessons", len(d.Lessons), func(i int) string { return d.Lessons[i].ID })

	ref := func(set map[string]bool, list, id, path string) {
		if id != "" && !set[id] {
			errf("%s unknown %s id %q", path, list, id)
		}
	}

	p := d.Publication.Period
	if p.End < p.Start { // "YYYY-MM-DD" strings compare like dates
		errf("/publication/period end is before start")
	}
	for i, id := range d.Publication.Coverage.BuildingIDs {
		ref(buildings, "buildings", id, fmt.Sprintf("/publication/coverage/buildingIds/%d", i))
	}
	for i, id := range d.Publication.Coverage.GroupIDs {
		ref(groups, "groups", id, fmt.Sprintf("/publication/coverage/groupIds/%d", i))
	}
	for i, x := range d.Rooms {
		ref(buildings, "buildings", x.BuildingID, fmt.Sprintf("/rooms/%d/buildingId", i))
	}
	for i, g := range d.Groups {
		ref(buildings, "buildings", g.BuildingID, fmt.Sprintf("/groups/%d/buildingId", i))
		ref(departments, "departments", g.DepartmentID, fmt.Sprintf("/groups/%d/departmentId", i))
	}
	for i, b := range d.BellSchedules {
		for j, id := range b.BuildingIDs {
			ref(buildings, "buildings", id, fmt.Sprintf("/bellSchedules/%d/buildingIds/%d", i, j))
		}
	}
	for i, l := range d.Lessons {
		at := fmt.Sprintf("/lessons/%d", i)
		ref(buildings, "buildings", l.BuildingID, at+"/buildingId")
		for j, g := range l.Groups {
			ref(groups, "groups", g.GroupID, fmt.Sprintf("%s/groups/%d/groupId", at, j))
		}
		ref(subjects, "subjects", l.SubjectID, at+"/subjectId")
		ref(lessonTypes, "lessonTypes", l.LessonTypeID, at+"/lessonTypeId")
		for j, t := range l.Teachers {
			ref(teachers, "teachers", t.TeacherID, fmt.Sprintf("%s/teachers/%d/teacherId", at, j))
		}
		for j, x := range l.Rooms {
			ref(rooms, "rooms", x.RoomID, fmt.Sprintf("%s/rooms/%d/roomId", at, j))
		}

		if l.Date < p.Start || l.Date > p.End {
			warnf("%s/date %s is outside the publication period", at, l.Date)
		}
		if l.Start != "" && l.End <= l.Start {
			warnf("%s ends (%s) not after it starts (%s)", at, l.End, l.Start)
		}
	}
	return r
}
