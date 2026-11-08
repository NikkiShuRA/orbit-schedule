// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

package api

import (
	"bytes"
	"encoding/json"
	"os"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/santhosh-tekuri/jsonschema/v6"
)

// openAPISchemaID is the $id of testdata/openapi-3.1.schema.json, the
// official schema of OpenAPI 3.1 documents (see testdata/README.md).
const openAPISchemaID = "https://spec.openapis.org/oas/3.1/schema/2026-08-03"

func readJSON(t *testing.T, data []byte) any {
	t.Helper()
	v, err := jsonschema.UnmarshalJSON(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	return v
}

func openAPI(t *testing.T) []byte {
	t.Helper()
	data, err := Files.ReadFile("openapi.json")
	if err != nil {
		t.Fatal(err)
	}
	return data
}

// TestOpenAPIDocumentIsValid checks openapi.json against the official
// schema of OpenAPI 3.1.
func TestOpenAPIDocumentIsValid(t *testing.T) {
	raw, err := os.ReadFile("testdata/openapi-3.1.schema.json")
	if err != nil {
		t.Fatal(err)
	}
	c := jsonschema.NewCompiler()
	if err := c.AddResource(openAPISchemaID, readJSON(t, raw)); err != nil {
		t.Fatal(err)
	}
	s, err := c.Compile(openAPISchemaID)
	if err != nil {
		t.Fatal(err)
	}
	if err := s.Validate(readJSON(t, openAPI(t))); err != nil {
		t.Fatalf("openapi.json is not a valid OpenAPI 3.1 document:\n%v", err)
	}
}

// TestSchemaIDsAreTheirAddresses makes sure every schema says where it
// is published, so references to it resolve on the site.
func TestSchemaIDsAreTheirAddresses(t *testing.T) {
	entries, err := Files.ReadDir("schemas")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		data, _ := Files.ReadFile("schemas/" + e.Name())
		var s struct {
			Schema string `json:"$schema"`
			ID     string `json:"$id"`
		}
		if err := json.Unmarshal(data, &s); err != nil {
			t.Fatalf("%s: %v", e.Name(), err)
		}
		if want := BaseURL + "schemas/" + e.Name(); s.ID != want {
			t.Errorf("%s: $id = %q, want %q", e.Name(), s.ID, want)
		}
		if s.Schema != "https://json-schema.org/draft/2020-12/schema" {
			t.Errorf("%s: $schema = %q, want JSON Schema 2020-12", e.Name(), s.Schema)
		}
	}
	for _, n := range []string{Index, Catalog, Status} {
		if _, err := Files.ReadFile("schemas/" + n + ".schema.json"); err != nil {
			t.Errorf("schema of %s: %v", n, err)
		}
	}
}

// TestOpenAPIReferencesResolve checks what the official schema cannot:
// every local "$ref" points somewhere, every schema compiles with its
// references, and every path template has its parameters declared.
func TestOpenAPIReferencesResolve(t *testing.T) {
	doc := readJSON(t, openAPI(t))

	var refs []string
	walk(doc, func(m map[string]any) {
		if r, ok := m["$ref"].(string); ok {
			refs = append(refs, r)
		}
	})
	if len(refs) == 0 {
		t.Fatal("no $ref found; the walk is broken")
	}
	for _, r := range refs {
		if strings.HasPrefix(r, "#/") {
			if _, ok := pointer(doc, r); !ok {
				t.Errorf("$ref %q points nowhere", r)
			}
		}
	}

	c := compiler(t)
	schemas, _ := pointer(doc, "#/components/schemas")
	for name := range schemas.(map[string]any) {
		if _, err := c.Compile(BaseURL + "openapi.json#/components/schemas/" + name); err != nil {
			t.Errorf("schema %s: %v", name, err)
		}
	}

	param := regexp.MustCompile(`\{([^}]+)\}`)
	paths, _ := pointer(doc, "#/paths")
	for path, item := range paths.(map[string]any) {
		var want []string
		for _, m := range param.FindAllStringSubmatch(path, -1) {
			want = append(want, m[1])
		}
		var got []string
		op := item.(map[string]any)["get"].(map[string]any)
		params, _ := op["parameters"].([]any)
		for _, p := range params {
			p := p.(map[string]any)
			if r, ok := p["$ref"].(string); ok {
				v, _ := pointer(doc, r)
				p = v.(map[string]any)
			}
			if p["in"] == "path" {
				got = append(got, p["name"].(string))
			}
		}
		slices.Sort(want)
		slices.Sort(got)
		if !slices.Equal(got, want) {
			t.Errorf("%s: path parameters %v, template has %v", path, got, want)
		}
	}
}

// TestOpenAPIExamplesMatchSchemas validates every example of a response
// against the schema of that response.
func TestOpenAPIExamplesMatchSchemas(t *testing.T) {
	doc := readJSON(t, openAPI(t))
	c := compiler(t)
	checked := 0
	paths, _ := pointer(doc, "#/paths")
	for path, item := range paths.(map[string]any) {
		responses := item.(map[string]any)["get"].(map[string]any)["responses"].(map[string]any)
		for code, resp := range responses {
			resp := resp.(map[string]any)
			if r, ok := resp["$ref"].(string); ok {
				v, _ := pointer(doc, r)
				resp = v.(map[string]any)
			}
			content, _ := resp["content"].(map[string]any)
			media, ok := content["application/json"].(map[string]any)
			if !ok {
				continue
			}
			ref := media["schema"].(map[string]any)["$ref"].(string)
			s, err := c.Compile(BaseURL + "openapi.json" + ref)
			if err != nil {
				t.Fatalf("%s %s: %v", path, code, err)
			}
			examples, _ := media["examples"].(map[string]any)
			for name, ex := range examples {
				ex := ex.(map[string]any)
				if r, ok := ex["$ref"].(string); ok {
					v, _ := pointer(doc, r)
					ex = v.(map[string]any)
				}
				if err := s.Validate(ex["value"]); err != nil {
					t.Errorf("%s %s, example %s:\n%v", path, code, name, err)
				}
				checked++
			}
		}
	}
	all, _ := pointer(doc, "#/components/examples")
	if want := len(all.(map[string]any)); checked < want {
		t.Errorf("checked %d examples, but components has %d: some are not used by any response", checked, want)
	}
}

func TestValidate(t *testing.T) {
	good := map[string]string{
		Index:   `{"sources": [{"id": "spk", "name": "Колледж", "catalog": "spk/catalog.json"}]}`,
		Status:  `{"source": "spk", "checkedAt": "2026-11-08T07:07:28+05:00", "weeks": [{"date": "2026-11-15", "result": "not-published"}], "future": 1}`,
		Catalog: `{"source": "spk", "institution": {"id": "spk", "name": "Колледж", "timeZone": "Asia/Yekaterinburg"}, "weeks": []}`,
	}
	for name, doc := range good {
		if err := Validate(name, []byte(doc)); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}

	bad := []struct{ name, doc, why string }{
		{Index, `{}`, "no sources"},
		{Index, `{"sources": [{"id": "SPK", "name": "Колледж", "catalog": "spk/catalog.json"}]}`, "id with capitals"},
		{Status, `{"source": "spk", "checkedAt": "yesterday", "weeks": []}`, "checkedAt is not a date-time"},
		{Status, `{"source": "spk", "checkedAt": "2026-11-08T07:07:28+05:00", "weeks": [{"date": "2026-11-15", "result": "maybe"}]}`, "unknown result"},
		{Status, `{"source": "spk", "checkedAt": "2026-11-08T07:07:28+05:00", "weeks": [{"date": "2026-11-15", "result": "updated"}]}`, "updated week without a file"},
		{Status, `{"source": "spk", "checkedAt": "2026-11-08T07:07:28+05:00", "weeks": [{"date": "2026-11-15", "result": "not-published", "file": "2026-11-09.json"}]}`, "file of an unpublished week"},
		{Catalog, `{"source": "spk", "institution": {"id": "", "name": "", "timeZone": ""}, "weeks": []}`, "empty institution"},
		{Catalog, `{"source": "spk", "institution": {"id": "spk", "name": "Колледж", "timeZone": "Asia/Yekaterinburg"}, "weeks": [{"start": "2026-11-09", "end": "2026-11-15", "file": "2026-11-09.json", "coverage": {}}]}`, "empty coverage"},
	}
	for _, b := range bad {
		if err := Validate(b.name, []byte(b.doc)); err == nil {
			t.Errorf("%s with %s: want an error", b.name, b.why)
		}
	}

	if err := Validate("nonsense", []byte(`{}`)); err == nil {
		t.Error("unknown file kind: want an error")
	}
}

// compiler returns NewCompiler with openapi.json added, so schemas can
// be compiled by their place in the OpenAPI document.
func compiler(t *testing.T) *jsonschema.Compiler {
	t.Helper()
	c, err := NewCompiler()
	if err != nil {
		t.Fatal(err)
	}
	if err := c.AddResource(BaseURL+"openapi.json", readJSON(t, openAPI(t))); err != nil {
		t.Fatal(err)
	}
	return c
}

// walk calls f for every object in v, depth first.
func walk(v any, f func(map[string]any)) {
	switch v := v.(type) {
	case map[string]any:
		f(v)
		for _, x := range v {
			walk(x, f)
		}
	case []any:
		for _, x := range v {
			walk(x, f)
		}
	}
}

// pointer resolves a local reference such as "#/components/schemas/Index".
func pointer(doc any, ref string) (any, bool) {
	cur := doc
	for _, part := range strings.Split(strings.TrimPrefix(ref, "#/"), "/") {
		part = strings.NewReplacer("~1", "/", "~0", "~").Replace(part)
		m, ok := cur.(map[string]any)
		if !ok {
			return nil, false
		}
		if cur, ok = m[part]; !ok {
			return nil, false
		}
	}
	return cur, true
}
