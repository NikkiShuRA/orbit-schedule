// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

package standard

import (
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"testing"
)

// The Go validator must agree with the Node validator on every shared
// example: valid/ passes, invalid/ fails.
func TestExamples(t *testing.T) {
	for _, kind := range []string{"valid", "invalid"} {
		files, err := filepath.Glob(filepath.Join("..", "..", "standard", "examples", kind, "*.json"))
		if err != nil {
			t.Fatal(err)
		}
		if len(files) == 0 {
			t.Fatalf("no examples in %s/", kind)
		}
		for _, f := range files {
			t.Run(kind+"/"+filepath.Base(f), func(t *testing.T) {
				data, err := os.ReadFile(f)
				if err != nil {
					t.Fatal(err)
				}
				res, err := Validate(data)
				if err != nil {
					t.Fatal(err)
				}
				if kind == "valid" && !res.OK() {
					t.Errorf("expected no errors, got %v", res.Errors)
				}
				if kind == "invalid" && res.OK() {
					t.Error("expected errors, got none")
				}
			})
		}
	}
}

// TestCoverageWarnings checks that a lesson outside a combined coverage
// is flagged, and that it is a warning, not an error.
func TestCoverageWarnings(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "standard", "examples", "valid", "teacher-week.json"))
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err := json.Unmarshal(data, &doc); err != nil {
		t.Fatal(err)
	}
	// Narrow the coverage to one building and a teacher the second lesson
	// does not have: it now falls outside on both counts.
	doc["teachers"] = append(doc["teachers"].([]any), map[string]any{"id": "t-2", "name": "Петров Пётр"})
	doc["publication"].(map[string]any)["coverage"] = map[string]any{
		"buildingIds": []any{"b-1"},
		"teacherIds":  []any{"t-1", "t-2"},
	}
	lesson := doc["lessons"].([]any)[1].(map[string]any)
	lesson["teachers"] = []any{map[string]any{"teacherId": "t-x"}}
	doc["teachers"] = append(doc["teachers"].([]any), map[string]any{"id": "t-x", "name": "Сидоров Сидор"})

	data, err = json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	res, err := Validate(data)
	if err != nil {
		t.Fatal(err)
	}
	if !res.OK() {
		t.Fatalf("errors %v: a lesson outside the coverage is a warning only", res.Errors)
	}
	want := []string{
		`/lessons/1 building "b-2" is outside the coverage`,
		`/lessons/1 has no teacher from the coverage`,
	}
	if !slices.Equal(res.Warnings, want) {
		t.Errorf("warnings = %q, want %q", res.Warnings, want)
	}
}
