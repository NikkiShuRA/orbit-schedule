// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// A Cloudflare Worker that starts the Publish workflow on a timer
// (ADR 0011). It only asks GitHub to run the workflow; fetching,
// committing and deploying stay in GitHub Actions. The schedule is in
// wrangler.toml.

export const DISPATCH_URL =
  "https://api.github.com/repos/NikkiShuRA/orbit-schedule/actions/workflows/publish.yml/dispatches";

const USER_AGENT = "OrbitSchedule-trigger (+https://github.com/NikkiShuRA/orbit-schedule)";

/**
 * Asks GitHub to run the Publish workflow on main.
 * Throws when GitHub does not accept the request, so the failed run
 * shows up in the worker's logs.
 *
 * @param {{ GITHUB_TOKEN?: string }} env
 * @param {typeof fetch} fetchFn
 */
export async function dispatch(env, fetchFn = fetch) {
  if (!env.GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN is not set: run `wrangler secret put GITHUB_TOKEN`");
  }
  const res = await fetchFn(DISPATCH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({ ref: "main" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    // GitHub's error body says what is wrong (expired token, missing
    // permission) and never echoes the token back.
    const detail = (await res.text()).slice(0, 500);
    throw new Error(`GitHub answered ${res.status}: ${detail}`);
  }
}

export default {
  /** Runs on each cron trigger from wrangler.toml. */
  async scheduled(_controller, env) {
    await dispatch(env);
  },
};
