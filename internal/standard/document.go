// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// Package standard holds Go types for documents of the Orbit schedule
// standard (standard/schema/schedule.schema.json) and their validation.
//
// Optional fields use `omitempty`, so a field the source did not report
// is left out of the JSON instead of being written as an empty value.
package standard

// Version is the version of the standard these types implement.
const Version = "0.1.0"

// Document is one publication: the schedule of an institution for a
// date range.
type Document struct {
	StandardVersion string         `json:"standardVersion"`
	Institution     Institution    `json:"institution"`
	Publication     Publication    `json:"publication"`
	Provenance      Provenance     `json:"provenance"`
	Buildings       []Building     `json:"buildings,omitempty"`
	Departments     []Department   `json:"departments,omitempty"`
	Rooms           []Room         `json:"rooms,omitempty"`
	Groups          []Group        `json:"groups,omitempty"`
	Teachers        []Teacher      `json:"teachers,omitempty"`
	Subjects        []Subject      `json:"subjects,omitempty"`
	LessonTypes     []LessonType   `json:"lessonTypes,omitempty"`
	BellSchedules   []BellSchedule `json:"bellSchedules,omitempty"`
	// Lessons is required even when empty: an empty list means
	// "no lessons within the coverage", so it must never be nil.
	Lessons []Lesson `json:"lessons"`
}

type Institution struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	ShortName string `json:"shortName,omitempty"`
	TimeZone  string `json:"timeZone"`
}

type Publication struct {
	Period         Period          `json:"period"`
	Coverage       Coverage        `json:"coverage"`
	NonWorkingDays []NonWorkingDay `json:"nonWorkingDays,omitempty"`
}

// Period is a date range, both ends inclusive, as "YYYY-MM-DD".
type Period struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

// Coverage says what the publication is for. Exactly one field is set.
type Coverage struct {
	Institution bool     `json:"institution,omitempty"`
	BuildingIDs []string `json:"buildingIds,omitempty"`
	GroupIDs    []string `json:"groupIds,omitempty"`
}

type NonWorkingDay struct {
	Date string `json:"date"`
	Note string `json:"note,omitempty"`
}

type Provenance struct {
	Connector      Connector `json:"connector"`
	Source         Source    `json:"source"`
	RetrievedAt    string    `json:"retrievedAt"`
	SourceRevision string    `json:"sourceRevision,omitempty"`
}

type Connector struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type Source struct {
	Name string `json:"name"`
	URL  string `json:"url,omitempty"`
}

type Building struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	ShortName string `json:"shortName,omitempty"`
	Address   string `json:"address,omitempty"`
}

type Department struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	ShortName string `json:"shortName,omitempty"`
}

type Room struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Code       string `json:"code,omitempty"`
	BuildingID string `json:"buildingId,omitempty"`
}

type Group struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Course       int    `json:"course,omitempty"` // 0 means "not reported"
	BuildingID   string `json:"buildingId,omitempty"`
	DepartmentID string `json:"departmentId,omitempty"`
}

type Teacher struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	ShortName string `json:"shortName,omitempty"`
}

type Subject struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	ShortName string `json:"shortName,omitempty"`
}

type LessonType struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	ShortName string `json:"shortName,omitempty"`
}

type BellSchedule struct {
	ID          string       `json:"id"`
	Name        string       `json:"name,omitempty"`
	BuildingIDs []string     `json:"buildingIds,omitempty"`
	Periods     []BellPeriod `json:"periods"`
}

type BellPeriod struct {
	Period int    `json:"period"`
	Start  string `json:"start"`
	End    string `json:"end,omitempty"`
}

// Lesson is one class. Period is a pointer because 0 is a valid period
// number and must be distinguishable from "not reported" (nil).
type Lesson struct {
	ID           string        `json:"id,omitempty"`
	Date         string        `json:"date"`
	Period       *int          `json:"period,omitempty"`
	Start        string        `json:"start,omitempty"`
	End          string        `json:"end,omitempty"`
	BuildingID   string        `json:"buildingId,omitempty"`
	Groups       []LessonGroup `json:"groups"`
	SubjectID    string        `json:"subjectId,omitempty"`
	LessonTypeID string        `json:"lessonTypeId,omitempty"`
	Teachers     []TeacherRef  `json:"teachers,omitempty"`
	Rooms        []RoomRef     `json:"rooms,omitempty"`
	Note         string        `json:"note,omitempty"`
}

type LessonGroup struct {
	GroupID  string `json:"groupId"`
	Subgroup int    `json:"subgroup,omitempty"` // 0 means the whole group
}

// TeacherRef is either a reference (TeacherID) or a placeholder from the
// source, such as "ВАКАНСИЯ", kept with its original text.
type TeacherRef struct {
	TeacherID   string `json:"teacherId,omitempty"`
	Placeholder string `json:"placeholder,omitempty"`
	SourceText  string `json:"sourceText,omitempty"`
}

// RoomRef is either a reference (RoomID) or a placeholder from the source.
type RoomRef struct {
	RoomID      string `json:"roomId,omitempty"`
	Placeholder string `json:"placeholder,omitempty"`
	SourceText  string `json:"sourceText,omitempty"`
}

// PlaceholderUnassigned marks a value the source explicitly reports as
// not assigned.
const PlaceholderUnassigned = "unassigned"
