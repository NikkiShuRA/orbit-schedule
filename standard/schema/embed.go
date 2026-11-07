// SPDX-FileCopyrightText: 2026 Orbit contributors
// SPDX-License-Identifier: AGPL-3.0-or-later

// Package schema embeds the JSON Schema of the Orbit schedule standard,
// so Go programs validate against exactly the file in this directory.
package schema

import _ "embed"

// JSON is the content of schedule.schema.json.
//
//go:embed schedule.schema.json
var JSON []byte

// ID is the $id of the schema.
const ID = "https://raw.githubusercontent.com/NikkiShuRA/orbit-schedule/main/standard/schema/schedule.schema.json"
