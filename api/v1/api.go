// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// Package api embeds the description of the published static API, v1:
// the OpenAPI document and the JSON Schemas of the publication files
// (index.json, catalog.json, status.json). See ADR 0008 and ADR 0009.
//
// The files in this directory are published as they are, next to the
// data, so the description on the site is always the one tested here.
package api

import (
	"bytes"
	"embed"
	"errors"
	"fmt"
	"slices"
	"strings"
	"sync"

	"github.com/santhosh-tekuri/jsonschema/v6"
	"golang.org/x/text/language"
	"golang.org/x/text/message"

	standardschema "github.com/NikkiShuRA/orbit-schedule/standard/schema"
)

// BaseURL is where this version of the API is published. The $id of
// every schema here starts with it.
const BaseURL = "https://nikkishura.github.io/orbit-schedule/api/v1/"

// Files holds openapi.json and schemas/*.schema.json.
//
//go:embed openapi.json schemas/*.schema.json
var Files embed.FS

// The publication files that have a schema.
const (
	Index   = "index"
	Catalog = "catalog"
	Status  = "status"
)

var (
	once     sync.Once
	compiled map[string]*jsonschema.Schema
	errInit  error
)

// NewCompiler returns a compiler that knows every schema of the API and
// the schema of the standard by their $id, so references between them
// resolve without the network.
func NewCompiler() (*jsonschema.Compiler, error) {
	c := jsonschema.NewCompiler()
	c.DefaultDraft(jsonschema.Draft2020)
	c.AssertFormat() // "date" and "date-time" are checked, not just noted
	add := func(url string, data []byte) error {
		doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(data))
		if err != nil {
			return fmt.Errorf("%s: %w", url, err)
		}
		return c.AddResource(url, doc)
	}
	if err := add(standardschema.ID, standardschema.JSON); err != nil {
		return nil, err
	}
	names, err := Files.ReadDir("schemas")
	if err != nil {
		return nil, err
	}
	for _, e := range names {
		data, err := Files.ReadFile("schemas/" + e.Name())
		if err != nil {
			return nil, err
		}
		if err := add(BaseURL+"schemas/"+e.Name(), data); err != nil {
			return nil, err
		}
	}
	return c, nil
}

// SchemaURL returns the $id of the schema of a publication file.
func SchemaURL(name string) string {
	return BaseURL + "schemas/" + name + ".schema.json"
}

// Validate checks a publication file (Index, Catalog or Status) against
// its schema. It returns nil if the file is valid.
func Validate(name string, data []byte) error {
	once.Do(func() {
		c, err := NewCompiler()
		if err != nil {
			errInit = err
			return
		}
		compiled = map[string]*jsonschema.Schema{}
		for _, n := range []string{Index, Catalog, Status} {
			s, err := c.Compile(SchemaURL(n))
			if err != nil {
				errInit = err
				return
			}
			compiled[n] = s
		}
	})
	if errInit != nil {
		return fmt.Errorf("API schemas: %w", errInit)
	}
	s, ok := compiled[name]
	if !ok {
		return fmt.Errorf("no schema for %q", name)
	}
	inst, err := jsonschema.UnmarshalJSON(bytes.NewReader(data))
	if err != nil {
		return err
	}
	if err := s.Validate(inst); err != nil {
		var ve *jsonschema.ValidationError
		if errors.As(err, &ve) {
			return fmt.Errorf("%s.json does not match its schema: %s", name, leaves(ve))
		}
		return err
	}
	return nil
}

// printer renders schema error messages; the library needs one to turn
// an error kind into text.
var printer = message.NewPrinter(language.English)

// leaves lists the innermost errors, where the actual problems are, as
// "/path: message".
func leaves(ve *jsonschema.ValidationError) string {
	var out []string
	var walk func(e *jsonschema.ValidationError)
	walk = func(e *jsonschema.ValidationError) {
		if len(e.Causes) == 0 {
			out = append(out, "/"+strings.Join(e.InstanceLocation, "/")+": "+e.ErrorKind.LocalizedString(printer))
			return
		}
		for _, c := range e.Causes {
			walk(c)
		}
	}
	walk(ve)
	slices.Sort(out)
	return strings.Join(out, "; ")
}
