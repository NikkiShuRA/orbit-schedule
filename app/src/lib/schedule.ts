// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// Turns a document of the standard into what the screen shows. Nothing
// is guessed: a missing value stays missing, a placeholder is shown as
// the source wrote it, a time from the bell schedule is marked as such
// (ADR 0002), and "no lessons" is only said inside the coverage.

import type { BellSchedule, Catalog, Coverage, Lesson, Named, ScheduleDocument } from "../api";
import { datesBetween, toMinutes } from "./dates";
import type { Selection } from "./selection";

export interface LessonView {
  key: string;
  period?: number;
  start?: string;
  end?: string;
  /** The time is not in the lesson but taken from the bell schedule. */
  timeFromBells: boolean;
  subject?: string;
  lessonType?: string;
  rooms: string[];
  /** Short names ("Иванов И. И."), for tight places. */
  teachers: string[];
  /** Full names, in the same order, where there is room. */
  teacherNames: string[];
  groups: string[];
  /** The subgroup of the selected group, if the lesson is for one. */
  subgroup?: number;
  building?: string;
  note?: string;
}

export interface DayView {
  date: string;
  lessons: LessonView[];
}

/**
 * Whether the week tells everything about the selection:
 * - covered: a day without lessons really has none;
 * - outside: the group's building is not published this week, so
 *   nothing can be said about its lessons;
 * - partial: not every building is published; lessons elsewhere may be
 *   missing (a teacher may teach in several buildings).
 */
export type CoverageState = "covered" | "outside" | "partial";

export interface WeekView {
  days: DayView[];
  coverage: CoverageState;
  /** When this content first appeared at the source (ADR 0004). */
  changedAt: string;
}

function byId<T extends { id: string }>(list: T[] | undefined): Map<string, T> {
  return new Map((list ?? []).map((x) => [x.id, x]));
}

function label(item: Named | undefined): string | undefined {
  return item?.name;
}

export function coverageState(coverage: Coverage, sel: Selection, catalog: Catalog): CoverageState {
  const published = coverage.buildingIds;
  if (coverage.institution || !published) {
    return "covered";
  }
  if (sel.kind === "group") {
    const building = catalog.groups?.find((g) => g.id === sel.id)?.buildingId;
    if (building) {
      return published.includes(building) ? "covered" : "outside";
    }
  }
  const all = (catalog.buildings ?? []).map((b) => b.id);
  return all.every((b) => published.includes(b)) ? "covered" : "partial";
}

/** The bell schedule that applies to a building: its own, or a general one. */
function bellsFor(bells: BellSchedule[], buildingId: string | undefined): BellSchedule | undefined {
  return (
    (buildingId ? bells.find((b) => b.buildingIds?.includes(buildingId)) : undefined) ??
    bells.find((b) => !b.buildingIds)
  );
}

export function lessonTime(
  lesson: Lesson,
  bells: BellSchedule[],
): Pick<LessonView, "start" | "end" | "timeFromBells"> {
  if (lesson.start) {
    return {
      start: lesson.start,
      ...(lesson.end ? { end: lesson.end } : {}),
      timeFromBells: false,
    };
  }
  if (lesson.period === undefined) {
    return { timeFromBells: false };
  }
  const slot = bellsFor(bells, lesson.buildingId)?.periods.find((p) => p.period === lesson.period);
  if (!slot) {
    return { timeFromBells: false };
  }
  return { start: slot.start, ...(slot.end ? { end: slot.end } : {}), timeFromBells: true };
}

function sortKey(l: LessonView): [number, number, number] {
  return [l.period ?? 1e6, l.start ? toMinutes(l.start) : 1e6, l.subgroup ?? 0];
}

function compare(a: LessonView, b: LessonView): number {
  const ka = sortKey(a);
  const kb = sortKey(b);
  for (let i = 0; i < ka.length; i++) {
    const d = (ka[i] ?? 0) - (kb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function buildWeek(doc: ScheduleDocument, sel: Selection, catalog: Catalog): WeekView {
  const rooms = byId(doc.rooms);
  const teachers = byId(doc.teachers);
  const groups = byId(doc.groups);
  const subjects = byId(doc.subjects);
  const types = byId(doc.lessonTypes);
  const buildings = byId(doc.buildings);
  const bells = doc.bellSchedules ?? [];

  // Other teachers of a lesson: a teacher's own schedule leaves them out.
  const people = (refs: NonNullable<Lesson["teachers"]>) => {
    const others = refs.filter(
      (t) => !(sel.kind === "teacher" && "teacherId" in t && t.teacherId === sel.id),
    );
    const found = others.map((t) => ("teacherId" in t ? teachers.get(t.teacherId) : undefined));
    const missing = "преподаватель не найден";
    return {
      teachers: others.map((t, i) =>
        "teacherId" in t ? (found[i]?.shortName ?? found[i]?.name ?? missing) : t.sourceText,
      ),
      teacherNames: others.map((t, i) =>
        "teacherId" in t ? (found[i]?.name ?? missing) : t.sourceText,
      ),
    };
  };

  const byDate = new Map<string, LessonView[]>();
  (doc.lessons ?? []).forEach((lesson, i) => {
    const own = lesson.groups.find((g) => sel.kind === "group" && g.groupId === sel.id);
    const view: LessonView = {
      key: `${lesson.date}-${i}`,
      ...(lesson.period !== undefined ? { period: lesson.period } : {}),
      ...lessonTime(lesson, bells),
      rooms: (lesson.rooms ?? []).map((r) =>
        "roomId" in r ? (label(rooms.get(r.roomId)) ?? "аудитория не найдена") : r.sourceText,
      ),
      ...people(lesson.teachers ?? []),
      groups:
        sel.kind === "teacher"
          ? lesson.groups.map((g) => {
              const name = label(groups.get(g.groupId)) ?? "группа не найдена";
              return g.subgroup ? `${name}, подгруппа ${g.subgroup}` : name;
            })
          : [],
    };
    const subject = lesson.subjectId && label(subjects.get(lesson.subjectId));
    if (subject) view.subject = subject;
    const type = lesson.lessonTypeId && label(types.get(lesson.lessonTypeId));
    if (type) view.lessonType = type;
    if (own?.subgroup) view.subgroup = own.subgroup;
    const building = lesson.buildingId && buildings.get(lesson.buildingId);
    // The full name: it has the address, and some sources cut the short
    // one to a stub ("№7,").
    if (building) view.building = building.name;
    if (lesson.note) view.note = lesson.note;

    const day = byDate.get(lesson.date) ?? [];
    day.push(view);
    byDate.set(lesson.date, day);
  });

  const { start, end } = doc.publication.period;
  const days = datesBetween(start, end)
    // Sunday is shown only when it has lessons: most weeks do not.
    .filter((date, i) => i < 6 || byDate.has(date))
    .map((date) => ({ date, lessons: (byDate.get(date) ?? []).sort(compare) }));

  return {
    days,
    coverage: coverageState(doc.publication.coverage, sel, catalog),
    changedAt: doc.provenance.retrievedAt,
  };
}

export interface Now {
  /** Lessons going on now; several at once for subgroups. */
  current: LessonView[];
  /** The lessons that start next today. */
  next: LessonView[];
}

/**
 * What is on now and next. A lesson counts as going on only when both
 * its start and end are known: without an end it cannot be said.
 */
export function findNow(lessons: LessonView[], minutes: number): Now {
  const current = lessons.filter(
    (l) => l.start && l.end && toMinutes(l.start) <= minutes && minutes < toMinutes(l.end),
  );
  const upcoming = lessons.filter((l) => l.start && toMinutes(l.start) > minutes);
  const first = Math.min(...upcoming.map((l) => toMinutes(l.start ?? "")));
  const next = upcoming.filter((l) => toMinutes(l.start ?? "") === first);
  return { current, next };
}
