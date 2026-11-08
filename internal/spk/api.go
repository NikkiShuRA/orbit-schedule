// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// Package spk is the connector for the schedule API of the Surgut
// Polytechnic College (SPK), the API behind its schedule site. It fetches
// one week and converts it to the Orbit standard.
//
// The API has two calls. /index returns the reference lists (groups,
// teachers, rooms...) and /schedule?date=<ms> returns lessons that refer
// to them by GUID. Lessons have no id and no time, only a period number.
package spk

// Types below mirror the source JSON. Only the fields the connector uses
// are declared; encoding/json ignores the rest. Field names, including
// the typos ("curse", "audithories", "lesson_Types"), are the source's.

type indexResponse struct {
	Success  bool `json:"success"`
	BaseInfo struct {
		Error string    `json:"error"`
		Data  reference `json:"data"`
	} `json:"baseInfo"`
}

type reference struct {
	Divisions   []named `json:"divisions"`   // departments ("отделения")
	Territories []named `json:"territories"` // buildings
	Groups      []group `json:"groups"`
	Teachers    []named `json:"teachers"`
	Rooms       []room  `json:"audithories"`
	Disciplines []named `json:"disciplines"`
	LessonTypes []named `json:"lesson_Types"`
}

type named struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type group struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Division string `json:"division"`
	Course   int    `json:"curse"`
}

type room struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	ShortName string `json:"short_name"`
}

type scheduleResponse struct {
	Success  bool `json:"success"`
	Schedule struct {
		Error string `json:"error"`
		Data  struct {
			Days []day `json:"schedule"`
		} `json:"data"`
	} `json:"schedule"`
}

// day is one calendar day. Days without lessons are not sent at all.
type day struct {
	Date    int64    `json:"date"` // milliseconds since the epoch for local midnight
	Lessons []lesson `json:"lessons"`
}

// lesson refers to the reference lists by GUID. A missing value is sent
// as the null GUID, not as null.
type lesson struct {
	Group      string `json:"group"`
	Discipline string `json:"discipline"`
	Teacher    string `json:"teacher"`
	Room       string `json:"auditoria"`
	Territory  string `json:"territory"`
	LessonType string `json:"lesson_type"`
	Number     *int   `json:"number_lesson"`
	Subgroup   int    `json:"subgroup"` // 0 is the whole group
}
