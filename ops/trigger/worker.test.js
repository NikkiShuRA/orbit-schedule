// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { DISPATCH_URL, dispatch } from "./worker.js";

// A fake fetch that records the request and answers with the given status.
function fakeFetch(status, body = "") {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    return new Response(status === 204 ? null : body, { status });
  };
  return { fn, calls };
}

test("asks GitHub to run Publish on main", async () => {
  const { fn, calls } = fakeFetch(204);
  await dispatch({ GITHUB_TOKEN: "test-token" }, fn);

  assert.equal(calls.length, 1);
  const [{ url, init }] = calls;
  assert.equal(url, DISPATCH_URL);
  assert.equal(init.method, "POST");
  assert.equal(init.headers.Authorization, "Bearer test-token");
  assert.match(init.headers["User-Agent"], /^OrbitSchedule/);
  assert.deepEqual(JSON.parse(init.body), { ref: "main" });
});

test("fails when GitHub refuses", async () => {
  const { fn } = fakeFetch(401, '{"message":"Bad credentials"}');
  await assert.rejects(dispatch({ GITHUB_TOKEN: "expired" }, fn), /401.*Bad credentials/);
});

test("fails without a token and sends nothing", async () => {
  const { fn, calls } = fakeFetch(204);
  await assert.rejects(dispatch({}, fn), /GITHUB_TOKEN/);
  assert.equal(calls.length, 0);
});

// The worker must run on the same schedule as ADR 0004 and must not be
// reachable from the internet (ADR 0011).
test("wrangler.toml keeps the ADR schedule and no public URL", async () => {
  const toml = await readFile(new URL("./wrangler.toml", import.meta.url), "utf8");
  assert.match(toml, /^workers_dev = false$/m);
  assert.match(toml, /^crons = \["3-59\/10 2-15 \* \* \*", "17 0,1,16-23 \* \* \*"\]$/m);
});
