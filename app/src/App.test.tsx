// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { App } from "./App";

afterEach(cleanup);

function serve(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

test("lists the published sources from index.json", async () => {
  serve({
    sources: [
      { id: "example", name: "Колледж «Пример»", shortName: "КП", catalog: "example/catalog.json" },
      { id: "sample", name: "Институт «Образец»", catalog: "sample/catalog.json", future: true },
    ],
  });
  render(<App />);
  expect(await screen.findByText("Колледж «Пример» (КП)")).toBeDefined();
  expect(screen.getByText("Институт «Образец»")).toBeDefined();
  const url = String(vi.mocked(fetch).mock.calls[0]?.[0]);
  expect(url).toMatch(/\/api\/v1\/index\.json$/);
});

test("says plainly when there is no network and no saved copy", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }),
  );
  render(<App />);
  expect((await screen.findByRole("alert")).textContent).toMatch(/Нет сети/);
});

test("treats an HTTP error as a failure, not as an empty list", async () => {
  serve({}, 404);
  render(<App />);
  expect(await screen.findByRole("alert")).toBeDefined();
});
