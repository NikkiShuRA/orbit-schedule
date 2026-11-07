#!/usr/bin/env node
// Validates Orbit schedule documents: JSON Schema first, then the rules
// JSON Schema cannot express (unique ids, references, date ranges).
//
// Usage: node tools/validate.mjs <file.json>...
// Exit code 1 if any file has errors. Warnings never fail validation:
// the standard keeps source data as published, even when it looks odd.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schemaPath = fileURLToPath(new URL("../schema/schedule.schema.json", import.meta.url));

export async function createValidator() {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  // strictRequired is off: anyOf branches like { required: ["period"] } refer
  // to properties declared on the parent object, which is valid JSON Schema.
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  addFormats(ajv);
  const validateSchema = ajv.compile(schema);

  return function validate(doc) {
    if (!validateSchema(doc)) {
      return {
        errors: validateSchema.errors.map((e) => `${e.instancePath || "/"} ${e.message}`),
        warnings: [],
      };
    }
    return checkSemantics(doc);
  };
}

const LISTS = [
  "buildings", "departments", "rooms", "groups", "teachers", "subjects", "lessonTypes", "bellSchedules", "lessons",
];

function checkSemantics(doc) {
  const errors = [];
  const warnings = [];
  const ids = {};

  for (const list of LISTS) {
    ids[list] = new Set();
    (doc[list] ?? []).forEach((item, i) => {
      if (item.id === undefined) return;
      if (ids[list].has(item.id)) errors.push(`/${list}/${i}/id duplicate id "${item.id}"`);
      ids[list].add(item.id);
    });
  }

  const ref = (list, id, path) => {
    if (!ids[list].has(id)) errors.push(`${path} unknown ${list} id "${id}"`);
  };

  const { period, coverage } = doc.publication;
  if (period.end < period.start) errors.push("/publication/period end is before start");
  coverage.buildingIds?.forEach((id, i) => ref("buildings", id, `/publication/coverage/buildingIds/${i}`));
  coverage.groupIds?.forEach((id, i) => ref("groups", id, `/publication/coverage/groupIds/${i}`));

  doc.rooms?.forEach((r, i) => r.buildingId && ref("buildings", r.buildingId, `/rooms/${i}/buildingId`));
  doc.groups?.forEach((g, i) => {
    if (g.buildingId) ref("buildings", g.buildingId, `/groups/${i}/buildingId`);
    if (g.departmentId) ref("departments", g.departmentId, `/groups/${i}/departmentId`);
  });
  doc.bellSchedules?.forEach((b, i) =>
    b.buildingIds?.forEach((id, j) => ref("buildings", id, `/bellSchedules/${i}/buildingIds/${j}`)));

  doc.lessons.forEach((l, i) => {
    const at = `/lessons/${i}`;
    l.groups.forEach((g, j) => ref("groups", g.groupId, `${at}/groups/${j}/groupId`));
    if (l.buildingId) ref("buildings", l.buildingId, `${at}/buildingId`);
    if (l.subjectId) ref("subjects", l.subjectId, `${at}/subjectId`);
    if (l.lessonTypeId) ref("lessonTypes", l.lessonTypeId, `${at}/lessonTypeId`);
    l.teachers?.forEach((t, j) => t.teacherId && ref("teachers", t.teacherId, `${at}/teachers/${j}/teacherId`));
    l.rooms?.forEach((r, j) => r.roomId && ref("rooms", r.roomId, `${at}/rooms/${j}/roomId`));

    if (l.date < period.start || l.date > period.end) warnings.push(`${at}/date ${l.date} is outside the publication period`);
    if (l.start && l.end <= l.start) warnings.push(`${at} ends (${l.end}) not after it starts (${l.start})`);
  });

  return { errors, warnings };
}

async function main(files) {
  if (files.length === 0) {
    console.error("Usage: node tools/validate.mjs <file.json>...");
    process.exit(2);
  }
  const validate = await createValidator();
  let failed = false;
  for (const file of files) {
    let result;
    try {
      result = validate(JSON.parse(await readFile(file, "utf8")));
    } catch (err) {
      result = { errors: [`cannot read JSON: ${err.message}`], warnings: [] };
    }
    for (const w of result.warnings) console.warn(`${file}: warning: ${w}`);
    for (const e of result.errors) console.error(`${file}: error: ${e}`);
    if (result.errors.length) failed = true;
    else console.log(`${file}: ok`);
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2));
}
