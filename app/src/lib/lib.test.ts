// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// Unit tests of the logic. All data here is made up.

import { afterEach, describe, expect, test, vi } from "vitest";
import { catalog, groupWeek, teacherWeek } from "../testdata";
import { ago, isStale } from "./age";
import {
  daySpan,
  initials,
  periodRange,
  slots,
  startDay,
  stepDay,
  timeline,
  weekName,
} from "./calendar";
import {
  addDays,
  datesBetween,
  formatDay,
  formatMinutes,
  formatRange,
  formatWeekday,
  minutesIn,
  mondayOf,
  todayIn,
} from "./dates";
import {
  type Entry,
  parsePrefs,
  parseProfile,
  setMine,
  setSubgroup,
  toggleStar,
  visit,
} from "./profile";
import { buildWeek, coverageState, findNow, type LessonView, lessonTime } from "./schedule";
import { browse, search } from "./search";
import { fromSearch, loadSaved, save, toSearch } from "./selection";

describe("dates", () => {
  test("today is the institution's day, not the phone's", () => {
    // 20:30 UTC on Sunday is already Monday 01:30 in UTC+5.
    const now = new Date("2026-11-08T20:30:00Z");
    expect(todayIn("Asia/Yekaterinburg", now)).toBe("2026-11-09");
    expect(todayIn("Europe/London", now)).toBe("2026-11-08");
    expect(minutesIn("Asia/Yekaterinburg", now)).toBe(90);
  });

  test("weeks start on Monday", () => {
    expect(mondayOf("2026-11-09")).toBe("2026-11-09");
    expect(mondayOf("2026-11-15")).toBe("2026-11-09");
    expect(mondayOf("2026-11-01")).toBe("2026-10-26");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(datesBetween("2026-11-09", "2026-11-11")).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
    ]);
    expect(formatDay("2026-11-09")).toBe("понедельник, 9 ноября");
  });

  test("short forms for the day strip, the week and countdowns", () => {
    expect(formatWeekday("2026-11-09")).toBe("пн");
    expect(formatRange("2026-11-09", "2026-11-14")).toBe("9–14 ноября");
    expect(formatRange("2026-11-30", "2026-12-05")).toBe("30 ноября – 5 декабря");
    expect(formatMinutes(25)).toBe("25 мин");
    expect(formatMinutes(60)).toBe("1 ч");
    expect(formatMinutes(80)).toBe("1 ч 20 мин");
  });
});

describe("age", () => {
  const now = new Date("2026-11-09T10:00:00Z");
  test("says how long ago in words", () => {
    expect(ago("2026-11-09T09:59:40Z", now)).toBe("только что");
    expect(ago("2026-11-09T09:55:00Z", now)).toBe("5 минут назад");
    expect(ago("2026-11-09T12:00:00+05:00", now)).toBe("3 часа назад");
    expect(ago("2026-11-08T09:00:00Z", now)).toBe("вчера");
    expect(ago("not a date", now)).toBe("неизвестно когда");
  });
  test("marks data older than two hours", () => {
    expect(isStale("2026-11-09T08:30:00Z", now)).toBe(false);
    expect(isStale("2026-11-09T07:30:00Z", now)).toBe(true);
    expect(isStale("not a date", now)).toBe(true);
  });
});

describe("selection", () => {
  afterEach(() => localStorage.clear());

  test("round-trips through the address", () => {
    const sel = { source: "example", kind: "teacher", id: "t-1" } as const;
    expect(fromSearch(toSearch(sel))).toEqual(sel);
    expect(fromSearch("?s=example&g=g-1")).toEqual({ source: "example", kind: "group", id: "g-1" });
    expect(fromSearch("?g=g-1")).toBeUndefined();
    expect(fromSearch("")).toBeUndefined();
  });

  test("survives broken or missing storage", () => {
    localStorage.setItem("orbit.selection.v1", "{not json");
    expect(loadSaved()).toEqual([]);
    localStorage.setItem("orbit.selection.v1", JSON.stringify([{ source: "x" }, 5]));
    expect(loadSaved()).toEqual([]);

    const sel = { source: "example", kind: "group", id: "g-1" } as const;
    save([sel]);
    expect(loadSaved()).toEqual([sel]);

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => save([sel])).not.toThrow();
    vi.restoreAllMocks();
  });
});

describe("search", () => {
  test("finds groups and teachers, starts of names first", () => {
    const found = search(catalog, "10");
    expect(found.map((f) => f.title)).toEqual(["101", "102", "210"]);
    expect(found[0]?.details).toBe("1 курс, Отделение примеров");
  });
  test("ignores case and ё", () => {
    expect(search(catalog, "СЕМЕНОВ").map((f) => f.id)).toEqual(["t-2"]);
    expect(search(catalog, "Иванов И.").map((f) => f.id)).toEqual(["t-1"]);
  });
  test("an empty query finds nothing", () => {
    expect(search(catalog, "  ")).toEqual([]);
  });
});

describe("week", () => {
  const sel = { source: "example", kind: "group", id: "g-101" } as const;

  test("takes the time from the lesson, or from the bells with a mark", () => {
    expect(lessonTime({ date: "x", groups: [], start: "09:00", end: "10:30" }, [])).toEqual({
      start: "09:00",
      end: "10:30",
      timeFromBells: false,
    });
    const bells = groupWeek.bellSchedules ?? [];
    expect(lessonTime({ date: "x", groups: [], period: 2 }, bells)).toEqual({
      start: "10:40",
      timeFromBells: true,
    });
    expect(lessonTime({ date: "x", groups: [], period: 9 }, bells)).toEqual({
      timeFromBells: false,
    });
  });

  test("builds days in order, keeping placeholders and missing values", () => {
    const week = buildWeek(groupWeek, sel, catalog);
    expect(week.days.map((d) => d.date)).toEqual(datesBetween("2026-11-09", "2026-11-14"));
    expect(week.coverage).toBe("covered");
    expect(week.changedAt).toBe("2026-11-08T12:00:00+05:00");

    const monday = week.days[0]?.lessons ?? [];
    expect(monday.map((l) => [l.period, l.subgroup])).toEqual([
      [1, undefined],
      [2, 1],
      [2, 2],
    ]);
    expect(monday[0]).toMatchObject({
      start: "09:00",
      timeFromBells: true,
      subject: "Математика",
      lessonType: "Лекция",
      rooms: ["Кабинет 5"],
      teachers: ["Иванов И. И."],
      teacherNames: ["Иванов Иван Иванович"],
      teacherIds: ["t-1"],
      building: "Главный корпус",
    });
    expect(monday[2]?.teachers).toEqual(["ВАКАНСИЯ"]);
    // A placeholder has no id to open a schedule by.
    expect(monday[2]?.teacherIds).toEqual([undefined]);
    expect(monday[1]?.subject).toBeUndefined();
    expect(week.days[1]?.lessons[0]?.note).toBe("Перенос с пятницы");
    expect(week.days[2]?.lessons).toEqual([]);
  });

  test("a teacher sees groups and not themselves", () => {
    const week = buildWeek(teacherWeek, { source: "example", kind: "teacher", id: "t-1" }, catalog);
    const lesson = week.days[0]?.lessons[0];
    expect(lesson?.groups).toEqual(["101", "102, подгруппа 2"]);
    expect(lesson?.teachers).toEqual([]);
  });

  test("tells published, outside and partial coverage apart", () => {
    const all = { institution: true } as const;
    expect(coverageState(all, sel, catalog)).toBe("covered");
    expect(coverageState({ buildingIds: ["b-main"] }, sel, catalog)).toBe("covered");
    expect(coverageState({ buildingIds: ["b-other"] }, sel, catalog)).toBe("outside");
    const teacher = { source: "example", kind: "teacher", id: "t-1" } as const;
    expect(coverageState({ buildingIds: ["b-main"] }, teacher, catalog)).toBe("partial");
    expect(coverageState({ buildingIds: ["b-main", "b-other"] }, teacher, catalog)).toBe("covered");
  });

  test("finds the lesson on now and the next one", () => {
    const lessons = [
      { key: "a", start: "09:00", end: "10:30", timeFromBells: false },
      { key: "b", start: "10:40", timeFromBells: true },
      { key: "c", start: "10:40", timeFromBells: true },
      { key: "d", start: "12:00", end: "13:30", timeFromBells: false },
    ].map((l) => ({
      rooms: [],
      teachers: [],
      teacherNames: [],
      teacherIds: [],
      groups: [],
      groupIds: [],
      together: [],
      ...l,
    }));
    const at = (m: number) => {
      const now = findNow(lessons, m);
      return [now.current.map((l) => l.key), now.next.map((l) => l.key)];
    };
    expect(at(8 * 60)).toEqual([[], ["a"]]);
    expect(at(9 * 60 + 30)).toEqual([["a"], ["b", "c"]]);
    // Without an end, a started lesson is not called "on now".
    expect(at(11 * 60)).toEqual([[], ["d"]]);
    expect(at(14 * 60)).toEqual([[], []]);
  });
});

describe("calendar", () => {
  const lesson = (key: string, start?: string, end?: string, period?: number): LessonView => ({
    key,
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
    ...(period !== undefined ? { period } : {}),
    timeFromBells: false,
    rooms: [],
    teachers: [],
    teacherNames: [],
    teacherIds: [],
    groupIds: [],
    together: [],
    groups: [],
  });

  test("a day shows free windows only between a known end and start", () => {
    const day = [
      lesson("a", "08:30", "10:00"),
      lesson("b", "10:10", "11:40"),
      lesson("c", "13:00", "14:30"),
      lesson("d", "16:00"),
      lesson("e", "18:00", "19:30"),
    ];
    const kinds = timeline(day).map((i) => (i.kind === "slot" ? i.slot.key : i.kind));
    // 10-minute break: no window; 80 minutes: a window; after an
    // unknown end nothing can be measured.
    expect(kinds).toEqual(["a", "b", "gap", "c", "gap", "d", "e"]);
    expect(timeline(day).find((i) => i.kind === "gap")).toMatchObject({ minutes: 80 });
  });

  test("today gets the now mark between lessons and states for lessons", () => {
    const day = [lesson("a", "08:30", "10:00"), lesson("b", "12:00", "13:30")];
    const at11 = timeline(day, 11 * 60);
    expect(at11.map((i) => (i.kind === "slot" ? `${i.slot.key}:${i.state}` : i.kind))).toEqual([
      "a:past",
      "gap",
      "now",
      "b:next",
    ]);
    // Inside a lesson the card itself shows it: no separate mark.
    const at9 = timeline(day, 9 * 60);
    expect(at9.some((i) => i.kind === "now")).toBe(false);
    expect(at9[0]).toMatchObject({ state: "now" });
  });

  test("subgroups at the same time are one slot", () => {
    const one = { ...lesson("a", "10:00", "11:30", 2), subgroup: 1 };
    const two = { ...lesson("b", "10:00", "11:40", 2), subgroup: 2 };
    const after = lesson("c", "12:00", undefined, 3);
    const out = slots([one, two, after]);
    expect(out.map((s) => s.lessons.map((l) => l.key))).toEqual([["a", "b"], ["c"]]);
    // The slot ends when the last subgroup ends; unknown ends stay unknown.
    expect(out[0]?.end).toBe("11:40");
    expect(out[1]?.end).toBeUndefined();
    // Two lessons with neither period nor time are never merged.
    expect(slots([lesson("x"), lesson("y")])).toHaveLength(2);
  });

  test("initials of a full and a short name", () => {
    expect(initials("Каюк Николай Васильевич")).toBe("КН");
    expect(initials("Каюк Н.В.")).toBe("КН");
    expect(initials("ВАКАНСИЯ")).toBe("В");
    expect(initials("кафедра")).toBe("");
  });

  test("a week is lined up by periods only if every lesson has one", () => {
    const days = [
      { date: "2026-11-09", lessons: [lesson("a", "08:30", undefined, 2)] },
      { date: "2026-11-10", lessons: [lesson("b", "08:30", undefined, 4)] },
    ];
    expect(periodRange(days)).toEqual({ first: 2, last: 4 });
    expect(periodRange([{ date: "2026-11-09", lessons: [lesson("c", "08:30")] }])).toBeUndefined();
  });

  test("the span of a day does not invent an end", () => {
    expect(daySpan([lesson("a", "08:30", "10:00"), lesson("b", "10:10", "11:40")])).toBe(
      "08:30–11:40",
    );
    expect(daySpan([lesson("a", "08:30", "10:00"), lesson("b", "10:10")])).toBe("с 08:30");
    expect(daySpan([lesson("a")])).toBeUndefined();
  });

  test("days step over an empty Sunday and weeks have names", () => {
    const week = [{ date: "2026-11-14", lessons: [] }];
    expect(stepDay("2026-11-14", 1, week)).toBe("2026-11-16");
    expect(stepDay("2026-11-16", -1, week)).toBe("2026-11-14");
    expect(stepDay("2026-11-14", 1, [{ date: "2026-11-15", lessons: [] }])).toBe("2026-11-15");
    expect(startDay("2026-11-15")).toBe("2026-11-16");
    expect(startDay("2026-11-11")).toBe("2026-11-11");
    expect(weekName("2026-11-16", "2026-11-11")).toBe("Следующая неделя");
    expect(weekName("2026-11-23", "2026-11-11")).toBeUndefined();
  });
});

describe("profile", () => {
  const a: Entry = { source: "x", kind: "group", id: "1", name: "Группа 1", place: "X" };
  const b: Entry = { source: "x", kind: "teacher", id: "2", name: "Петров П. П.", place: "X" };

  test("broken or foreign values give an empty profile, never an error", () => {
    expect(parseProfile(undefined)).toEqual({ starred: [], recent: [] });
    expect(
      parseProfile({ mine: { id: 1 }, starred: "x", recent: [a, a, { kind: "cat" }] }),
    ).toEqual({ starred: [], recent: [a] });
    expect(
      parsePrefs({ theme: "pink", startView: "week", subgroups: { k: 2, j: -1, z: "1" } }),
    ).toEqual({ theme: "system", startView: "week", subgroups: { k: 2 } });
  });

  test("the first visit becomes mine; recent is newest first without repeats", () => {
    let p = visit(parseProfile(undefined), a);
    p = visit(p, b);
    p = visit(p, a);
    expect(p.mine).toEqual(a);
    expect(p.recent).toEqual([a, b]);
    expect(setMine(p, b).mine).toEqual(b);
    expect(setMine(p, undefined).mine).toBeUndefined();
  });

  test("a star toggles, a subgroup is kept per schedule", () => {
    const p = toggleStar(parseProfile(undefined), a);
    expect(p.starred).toEqual([a]);
    expect(toggleStar(p, a).starred).toEqual([]);
    const prefs = setSubgroup(parsePrefs(undefined), a, 2);
    expect(prefs.subgroups).toEqual({ "x/group/1": 2 });
    expect(setSubgroup(prefs, a, undefined).subgroups).toEqual({});
  });
});

describe("browse", () => {
  test("groups by course and teachers by letter, in natural order", () => {
    const parts = browse(
      {
        ...catalog,
        groups: [
          { id: "g10", name: "10", course: 2 },
          { id: "g9", name: "9", course: 2 },
          { id: "g1", name: "1", course: 1 },
        ],
        teachers: [
          { id: "t1", name: "Смирнова А. А." },
          { id: "t2", name: "Андреев Б. Б." },
        ],
      },
      "all",
    );
    expect(parts.map((p) => [p.title, p.items.map((i) => i.title)])).toEqual([
      ["1 курс", ["1"]],
      ["2 курс", ["9", "10"]],
      ["Преподаватели · А", ["Андреев Б. Б."]],
      ["Преподаватели · С", ["Смирнова А. А."]],
    ]);
    expect(
      browse(catalog, "teacher").every((p) => p.items.every((i) => i.kind === "teacher")),
    ).toBe(true);
  });
});
