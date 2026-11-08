// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// The app against a fake API. All data is made up (testdata.ts); no
// test goes to the network.

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "./App";
import type { Catalog } from "./api";
import { catalog, groupWeek, index, status, teacherWeek } from "./testdata";

type Files = Record<string, unknown>;

const files: Files = {
  "index.json": index,
  "example/catalog.json": catalog,
  "example/status.json": status,
  "example/groups/g-101/2026-11-09.json": groupWeek,
  "example/teachers/t-1/2026-11-09.json": teacherWeek,
};

/** Serves files by their path under /api/v1/; `cached` paths come from the saved copy. */
function serve(served: Files, cached: string[] = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL | string) => {
      const path = String(url).replace(/^.*\/api\/v1\//, "");
      if (!(path in served)) {
        return new Response("not found", { status: 404 });
      }
      const headers: Record<string, string> = cached.includes(path)
        ? { "x-orbit-from-cache": "1" }
        : {};
      return new Response(JSON.stringify(served[path]), { status: 200, headers });
    }),
  );
}

function open(search: string) {
  globalThis.history.replaceState(null, "", `/${search}`);
  render(<App />);
}

beforeEach(() => {
  // Monday 9 November 2026, 10:30 in the institution's zone (UTC+5).
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-09T05:30:00Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  globalThis.history.replaceState(null, "", "/");
});

test("finds a group by name and opens its week, remembering the choice", async () => {
  serve(files);
  open("");
  const input = await screen.findByLabelText("Группа или преподаватель");
  fireEvent.change(input, { target: { value: "101" } });
  fireEvent.click(await screen.findByRole("button", { name: /^101/ }));

  expect(await screen.findByRole("heading", { name: "Группа 101" })).toBeDefined();
  expect(globalThis.location.search).toBe("?s=example&g=g-101");
  expect(JSON.parse(localStorage.getItem("orbit.selection.v1") ?? "[]")).toEqual([
    { source: "example", kind: "group", id: "g-101" },
  ]);
});

test("shows the week as published: next lesson, bell times, placeholders, notes", async () => {
  serve(files);
  open("?s=example&g=g-101");

  expect(await screen.findByText("Дальше")).toBeDefined();
  expect(screen.getByText("Расписание проверено 35 минут назад")).toBeDefined();
  // 10:30: the first lesson started at 09:00, but its end is unknown,
  // so it is not called "on now"; the next ones start at 10:40.
  expect(screen.queryByText("Сейчас")).toBeNull();
  expect(screen.getAllByText("по звонкам").length).toBeGreaterThan(0);
  expect(screen.getAllByText(/ВАКАНСИЯ/).length).toBeGreaterThan(0);
  expect(screen.getAllByText("Предмет не указан").length).toBeGreaterThan(0);
  expect(screen.getByText("Перенос с пятницы")).toBeDefined();

  const wednesday = screen.getByRole("region", { name: "среда, 11 ноября" });
  expect(within(wednesday).getByText("Пар нет")).toBeDefined();
  expect(screen.getByText(/^Изменено в источнике 8 ноября в 12:00$/)).toBeDefined();
});

test("a teacher sees the groups of each lesson", async () => {
  serve(files);
  open("?s=example&t=t-1");
  expect(await screen.findByRole("heading", { name: "Иванов Иван Иванович" })).toBeDefined();
  expect(await screen.findByText(/101 · 102, подгруппа 2/)).toBeDefined();
  // 10:30 is after the 09:00–10:30 lesson.
  expect(screen.getByText("На сегодня пары закончились.")).toBeDefined();
});

test("says plainly that a saved copy is shown when the network failed", async () => {
  serve(files, ["example/status.json", "example/groups/g-101/2026-11-09.json"]);
  open("?s=example&g=g-101");
  expect((await screen.findByRole("status")).textContent).toMatch(
    /Нет связи — показана сохранённая копия, проверено 35 минут назад/,
  );
});

test("warns when the data has not been checked for long", async () => {
  serve({ ...files, "example/status.json": { checkedAt: "2026-11-09T06:00:00+05:00" } });
  open("?s=example&g=g-101");
  expect((await screen.findByRole("status")).textContent).toMatch(/давно не обновлялось/);
});

test("a week not published yet is not shown as empty", async () => {
  serve(files);
  open("?s=example&g=g-101");
  fireEvent.click(await screen.findByRole("button", { name: "Следующая" }));
  expect(
    await screen.findByText("Расписание на неделю с 16 ноября ещё не опубликовано."),
  ).toBeDefined();
  expect(screen.queryByText("Пар нет")).toBeNull();
});

test("a group in a building not published this week gets no 'no lessons'", async () => {
  const outside: Catalog = {
    ...catalog,
    weeks: catalog.weeks.map((w) => ({ ...w, coverage: { buildingIds: ["b-other"] } })),
  };
  serve({
    ...files,
    "example/catalog.json": outside,
    "example/groups/g-101/2026-11-09.json": {
      ...groupWeek,
      publication: { ...groupWeek.publication, coverage: { buildingIds: ["b-other"] } },
      lessons: [],
    },
  });
  open("?s=example&g=g-101");
  expect(await screen.findByText(/ещё не опубликовало расписание корпуса/)).toBeDefined();
  expect(screen.queryByText("Пар нет")).toBeNull();
});

test("without network and without a saved copy it says so", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }),
  );
  open("");
  expect((await screen.findByRole("alert")).textContent).toMatch(/нет сети/);
});

test("a server error is not called a missing network", async () => {
  serve({ ...files, "example/catalog.json": undefined });
  vi.mocked(fetch).mockImplementation(async () => new Response("<html>", { status: 200 }));
  open("?s=example&g=g-101");
  expect((await screen.findByRole("alert")).textContent).toMatch(/сервер ответил ошибкой/);
});

test("the saved choice opens with its link in the address", async () => {
  serve(files);
  localStorage.setItem(
    "orbit.selection.v1",
    JSON.stringify([{ source: "example", kind: "teacher", id: "t-1" }]),
  );
  open("");
  expect(await screen.findByRole("heading", { name: "Иванов Иван Иванович" })).toBeDefined();
  expect(globalThis.location.search).toBe("?s=example&t=t-1");
});

test("an old link to a group that is gone offers to choose again", async () => {
  serve(files);
  open("?s=example&g=g-404");
  expect((await screen.findByRole("alert")).textContent).toMatch(/Такой группы нет/);
  fireEvent.click(screen.getByRole("button", { name: "Выбрать другое расписание" }));
  expect(await screen.findByLabelText("Группа или преподаватель")).toBeDefined();
  expect(globalThis.location.search).toBe("");
});
