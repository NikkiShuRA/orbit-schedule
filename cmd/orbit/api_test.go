// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

package main

import (
	"encoding/json"
	"reflect"
	"regexp"
	"slices"
	"strings"
	"testing"

	api "github.com/NikkiShuRA/orbit-schedule/api/v1"
	"github.com/NikkiShuRA/orbit-schedule/internal/slice"
)

// TestPublicationFilesMatchTheirSchemas compares the fields of the Go
// types that orbit writes with the properties in the API schemas, both
// ways. The schemas are open to new fields (ADR 0009), so validation
// alone would not notice a field that is written but not described, or
// described but never written.
func TestPublicationFilesMatchTheirSchemas(t *testing.T) {
	cases := []struct {
		schema  string // file in api/v1/schemas
		pointer string // where the object is in it
		typ     any
	}{
		{"index", "", Index{}},
		{"index", "$defs/source", IndexSource{}},
		{"status", "", status{}},
		{"status", "$defs/week", weekResult{}},
		{"catalog", "", slice.Catalog{}},
		{"catalog", "$defs/week", slice.CatalogWeek{}},
	}
	for _, c := range cases {
		t.Run(c.schema+"/"+c.pointer, func(t *testing.T) {
			data, err := api.Files.ReadFile("schemas/" + c.schema + ".schema.json")
			if err != nil {
				t.Fatal(err)
			}
			var obj map[string]any
			if err := json.Unmarshal(data, &obj); err != nil {
				t.Fatal(err)
			}
			if c.pointer != "" {
				for _, part := range strings.Split(c.pointer, "/") {
					obj, _ = obj[part].(map[string]any)
				}
			}
			props, _ := obj["properties"].(map[string]any)
			var described []string
			for name := range props {
				described = append(described, name)
			}
			written := jsonFields(reflect.TypeOf(c.typ))
			slices.Sort(described)
			slices.Sort(written)
			if !slices.Equal(written, described) {
				t.Errorf("Go writes %v, schema describes %v", written, described)
			}
			var required []string
			for _, r := range obj["required"].([]any) {
				required = append(required, r.(string))
			}
			for _, r := range required {
				if !slices.Contains(written, r) {
					t.Errorf("schema requires %q, Go never writes it", r)
				}
			}
			for _, f := range optionalFields(reflect.TypeOf(c.typ)) {
				if slices.Contains(required, f) {
					t.Errorf("%q is omitted when empty in Go, but the schema requires it", f)
				}
			}
		})
	}
}

// jsonFields returns the JSON names of the fields of a struct type.
func jsonFields(t reflect.Type) []string {
	var out []string
	for f := range t.Fields() {
		name, _, _ := strings.Cut(f.Tag.Get("json"), ",")
		if name != "" && name != "-" {
			out = append(out, name)
		}
	}
	return out
}

// optionalFields returns the JSON names of the fields that are left out
// when empty.
func optionalFields(t reflect.Type) []string {
	var out []string
	for f := range t.Fields() {
		name, opts, _ := strings.Cut(f.Tag.Get("json"), ",")
		if strings.Contains(opts, "omitempty") || strings.Contains(opts, "omitzero") {
			out = append(out, name)
		}
	}
	return out
}

// TestSourceNamesFitTheAPI checks that every source id can be a path in
// the API and does not clash with the files of the API description.
func TestSourceNamesFitTheAPI(t *testing.T) {
	ok := regexp.MustCompile(`^[a-z][a-z0-9-]*$`)
	for _, name := range sourceNames {
		if !ok.MatchString(name) {
			t.Errorf("source %q: not a valid id in the API", name)
		}
		if slices.Contains([]string{"schemas", "openapi", "index"}, name) {
			t.Errorf("source %q: the name is taken by the API description", name)
		}
	}
}
