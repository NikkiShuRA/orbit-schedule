// SPDX-FileCopyrightText: 2026 Orbit contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

package standard

import (
	"os"
	"path/filepath"
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
