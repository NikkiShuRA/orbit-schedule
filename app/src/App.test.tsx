// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// The app against a fake API. All data is made up (testdata.ts); no
// test goes to the network.

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "./App";
import type { Catalog } from "./api";
import { forgetAll } from "./lib/store";
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

/** The screen width the app sees: a phone unless a test says otherwise. */
function screenWidth(wide: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: wide && query.includes("min-width"),
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
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
  screenWidth(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  forgetAll();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
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
  expect(screen.getByText("через 10 мин")).toBeDefined();
  expect(screen.getByRole("tablist", { name: "Дни недели" })).toBeDefined();
  // The rest of the week, in the week view.
  fireEvent.click(screen.getByRole("button", { name: "Неделя" }));
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
  fireEvent.click(await screen.findByRole("button", { name: "Неделя" }));
  fireEvent.click(screen.getByRole("button", { name: "Следующая неделя" }));
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

test("coming back to the page refreshes quietly and keeps the week if that fails", async () => {
  serve(files);
  open("?s=example&g=g-101");
  expect(await screen.findByText("Дальше")).toBeDefined();
  vi.mocked(fetch).mockImplementation(async () => {
    throw new TypeError("Failed to fetch");
  });
  vi.mocked(fetch).mockClear();
  fireEvent(document, new Event("visibilitychange"));
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  await act(async () => {});
  expect(screen.getByText("Дальше")).toBeDefined();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("a day opens as a timeline; tabs, arrows and the view choice work", async () => {
  serve(files);
  open("?s=example&g=g-101");
  const monday = await screen.findByRole("tabpanel", { name: "Понедельник, 9 ноября" });
  expect(within(monday).getByText("сегодня")).toBeDefined();
  expect(screen.getByRole("button", { name: "Сегодня" })).toHaveProperty("disabled", true);

  fireEvent.click(screen.getByRole("tab", { name: /^вторник, 10 ноября/ }));
  expect(screen.getByRole("tabpanel", { name: "Вторник, 10 ноября" })).toBeDefined();
  expect(screen.getByRole("tab", { name: /^вторник/ }).getAttribute("aria-selected")).toBe("true");

  fireEvent.click(screen.getByRole("button", { name: "Следующий день" }));
  expect(screen.getByRole("tabpanel", { name: "Среда, 11 ноября" })).toBeDefined();
  expect(screen.getByText("Пар нет")).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Сегодня" }));
  expect(screen.getByRole("tabpanel", { name: "Понедельник, 9 ноября" })).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Неделя" }));
  expect(localStorage.getItem("orbit.view.v1")).toBe("week");
  expect(screen.queryByRole("tablist")).toBeNull();
});

test("a wide screen opens the week as a grid of periods", async () => {
  screenWidth(true);
  serve(files);
  open("?s=example&g=g-101");
  const wednesday = await screen.findByRole("region", { name: "среда, 11 ноября" });
  expect(within(wednesday).getByText("Пар нет")).toBeDefined();
  expect(screen.queryByRole("tablist")).toBeNull();
  // A day's header opens that day.
  fireEvent.click(within(wednesday).getByRole("button", { name: /11/ }));
  expect(screen.getByRole("tabpanel", { name: "Среда, 11 ноября" })).toBeDefined();
});

test("a tap on a lesson opens its details, and a teacher's name opens their schedule", async () => {
  serve(files);
  open("?s=example&g=g-101");
  const cards = await screen.findAllByRole("button", { name: /^Подробнее:/ });
  fireEvent.click(cards[0] as HTMLElement);
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/Данные — как их опубликовало учебное заведение/)).toBeDefined();
  fireEvent.click(within(dialog).getByRole("button", { name: /Иванов Иван Иванович/ }));
  expect(await screen.findByRole("heading", { name: "Иванов Иван Иванович" })).toBeDefined();
  expect(globalThis.location.search).toBe("?s=example&t=t-1");
});

test("the first schedule becomes mine, starred ones are listed in the profile", async () => {
  serve(files);
  open("?s=example&g=g-101");
  await screen.findByRole("heading", { name: "Группа 101" });
  fireEvent.click(screen.getByRole("button", { name: "В избранное" }));
  expect(screen.getByRole("button", { name: "В избранное" }).getAttribute("aria-pressed")).toBe(
    "true",
  );
  fireEvent.click(screen.getByRole("button", { name: "Профиль" }));
  const dialog = await screen.findByRole("dialog", { name: "Профиль" });
  expect(
    within(dialog).getByText("хранится только на этом устройстве", { exact: false }),
  ).toBeDefined();
  expect(within(dialog).getAllByText("Группа 101").length).toBeGreaterThan(1);
  expect(JSON.parse(localStorage.getItem("orbit.profile.v1") ?? "{}").mine.id).toBe("g-101");
});

test("the theme chosen in the settings is applied and remembered", async () => {
  serve(files);
  open("?s=example&g=g-101");
  await screen.findByRole("heading", { name: "Группа 101" });
  fireEvent.click(screen.getByRole("button", { name: "Настройки" }));
  const dialog = await screen.findByRole("dialog", { name: "Настройки" });
  fireEvent.click(within(dialog).getByRole("radio", { name: "Тёмная" }));
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(JSON.parse(localStorage.getItem("orbit.prefs.v1") ?? "{}").theme).toBe("dark");
  fireEvent.click(within(dialog).getByRole("radio", { name: "Как в системе" }));
  expect(document.documentElement.dataset.theme).toBeUndefined();
});

test("search moves through results with arrows and opens the first with Enter", async () => {
  serve(files);
  open("");
  const input = await screen.findByLabelText("Группа или преподаватель");
  await screen.findAllByRole("button", { name: /^101/ });
  fireEvent.change(input, { target: { value: "Иван" } });
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(document.activeElement?.textContent).toMatch(/Иванов/);
  fireEvent.keyDown(input, { key: "Enter" });
  expect(await screen.findByRole("heading", { name: "Иванов Иван Иванович" })).toBeDefined();
});

test("my subgroup hides the other's lessons and says how many", async () => {
  serve(files);
  open("?s=example&g=g-101");
  const choice = await screen.findByRole("group", { name: "Подгруппа" });
  fireEvent.click(within(choice).getByRole("button", { name: "1" }));
  expect(screen.getByText(/Показана 1 подгруппа · скрыто пар других: \d+/)).toBeDefined();
  fireEvent.click(within(choice).getByRole("button", { name: "Все" }));
  expect(screen.queryByText(/скрыто пар других/)).toBeNull();
});
