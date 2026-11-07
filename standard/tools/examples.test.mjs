// Every file in examples/valid must pass validation, every file in
// examples/invalid must fail it. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createValidator } from "./validate.mjs";

const examples = fileURLToPath(new URL("../examples/", import.meta.url));
const validate = await createValidator();

for (const kind of ["valid", "invalid"]) {
  const files = (await readdir(examples + kind)).filter((f) => f.endsWith(".json"));
  assert.ok(files.length > 0, `no examples in ${kind}/`);

  for (const file of files) {
    test(`${kind}/${file}`, async () => {
      const doc = JSON.parse(await readFile(`${examples}${kind}/${file}`, "utf8"));
      const { errors } = validate(doc);
      if (kind === "valid") assert.deepEqual(errors, [], "expected no errors");
      else assert.ok(errors.length > 0, `expected errors: ${doc["x-invalidBecause"]}`);
    });
  }
}
