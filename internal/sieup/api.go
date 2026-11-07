// SPDX-FileCopyrightText: 2026 Orbit contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

// Package sieup is the connector for the SIEUiP schedule API (a REST API
// over 1C). It fetches one week and converts it to the Orbit standard.
package sieup

// Types below mirror the source JSON. Only the fields the connector uses
// are declared; encoding/json ignores the rest.

type division struct {
	ID      string `json:"id_1c"`
	Name    string `json:"name"`
	AbbName string `json:"abb_name"`
}

type week struct {
	ID        string `json:"id"`
	Number    int    `json:"number"`
	Version   int    `json:"version"`
	DateStart string `json:"dateStart"` // a date disguised as UTC midnight
	DateEnd   string `json:"dateEnd"`
}

type lesson struct {
	ID           string   `json:"id"`
	Date         string   `json:"date"` // "YYYY-MM-DD"
	LessonNumber *int     `json:"lessonNumber"`
	TimeStart    string   `json:"timeStart"`
	TimeEnd      string   `json:"timeEnd"`
	Subgroup     int      `json:"subgroup"` // 0 is the whole group
	Note         *string  `json:"note"`
	Group        *group   `json:"group"`
	Division     *named   `json:"division"`
	Cabinet      *cabinet `json:"cabinet"`
	Subject      *named   `json:"subject"`
	Teacher      *named   `json:"teacher"`
}

// Nested objects are pointers: the source may send null for any of them.

type group struct {
	ID         string `json:"id_1c"`
	Name       string `json:"name"`
	Course     string `json:"course"`
	DivisionID string `json:"divisionId"`
}

type named struct {
	ID      string `json:"id_1c"`
	Name    string `json:"name"`
	AbbName string `json:"abb_name"`
}

type cabinet struct {
	ID     string `json:"id_1c"`
	Name   string `json:"name"`
	Number string `json:"number"`
}
