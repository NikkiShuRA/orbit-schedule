// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// How a week is laid out on screen: a day as a timeline, a week as a
// grid of periods. Only published times are used: a gap is shown only
// between a known end and a known start, nothing is stretched or
// guessed.

import { addDays, mondayOf, toMinutes } from "./dates";
import { type DayView, findNow, type LessonView } from "./schedule";

export type View = "day" | "week";

/** Where a lesson is relative to now, for today only. */
export type LessonState = "now" | "next" | "past";

export type TimelineItem =
  | { kind: "lesson"; lesson: LessonView; state?: LessonState }
  /** Free time between two lessons, long enough to plan for. */
  | { kind: "gap"; key: string; minutes: number }
  /** The moment now, between lessons (inside a lesson the card shows it). */
  | { kind: "now"; key: string };

/** Breaks shorter than this are ordinary breaks, not a free window. */
export const GAP_MINUTES = 30;

/**
 * The lessons of a day with free windows between them and, for today
 * (`minutes` given), the "now" mark. Lessons that run in parallel (two
 * subgroups) are next to each other and never make a gap.
 */
export function timeline(lessons: LessonView[], minutes?: number): TimelineItem[] {
  const now = minutes !== undefined ? findNow(lessons, minutes) : undefined;
  const items: TimelineItem[] = [];
  let lastEnd: number | undefined;
  let nowPlaced = !now || now.current.length > 0;

  for (const lesson of lessons) {
    const start = lesson.start ? toMinutes(lesson.start) : undefined;
    if (lastEnd !== undefined && start !== undefined && start - lastEnd >= GAP_MINUTES) {
      items.push({ kind: "gap", key: `gap-${lesson.key}`, minutes: start - lastEnd });
    }
    if (!nowPlaced && minutes !== undefined && start !== undefined && start > minutes) {
      items.push({ kind: "now", key: "now" });
      nowPlaced = true;
    }
    const state = now ? stateOf(lesson, now, minutes) : undefined;
    items.push(state ? { kind: "lesson", lesson, state } : { kind: "lesson", lesson });

    const end = lesson.end ? toMinutes(lesson.end) : undefined;
    // An unknown end breaks the chain: no gap can be measured after it.
    lastEnd = end === undefined ? undefined : Math.max(lastEnd ?? 0, end);
  }
  return items;
}

function stateOf(
  lesson: LessonView,
  now: ReturnType<typeof findNow>,
  minutes: number | undefined,
): LessonState | undefined {
  if (now.current.includes(lesson)) return "now";
  if (now.next.includes(lesson)) return "next";
  if (minutes !== undefined && lesson.end && toMinutes(lesson.end) <= minutes) return "past";
  return undefined;
}

/**
 * The periods a week grid needs: from the earliest to the latest used.
 * Undefined when some lesson has no period number: such a week cannot
 * be lined up by periods and is shown as plain columns.
 */
export function periodRange(days: DayView[]): { first: number; last: number } | undefined {
  const all = days.flatMap((d) => d.lessons);
  if (all.length === 0 || all.some((l) => l.period === undefined)) return undefined;
  const periods = all.map((l) => l.period ?? 0);
  return { first: Math.min(...periods), last: Math.max(...periods) };
}

/** "08:30–15:00", or "с 08:30" when the end of the last lesson is unknown. */
export function daySpan(lessons: LessonView[]): string | undefined {
  const starts = lessons.flatMap((l) => (l.start ? [l.start] : []));
  const first = starts.sort()[0];
  if (!first) return undefined;
  const last = lessons.at(-1);
  const ends = lessons.flatMap((l) => (l.end ? [l.end] : []));
  // The day's end is known only if the last lesson's end is.
  return last?.end ? `${first}–${ends.sort().at(-1)}` : `с ${first}`;
}

/**
 * The next or previous day to show. Sunday is skipped unless the week
 * being shown has lessons on it.
 */
export function stepDay(date: string, delta: 1 | -1, days: DayView[]): string {
  const next = addDays(date, delta);
  const isSunday = mondayOf(next) !== mondayOf(addDays(next, 1));
  if (isSunday && !days.some((d) => d.date === next)) return addDays(next, delta);
  return next;
}

/** "Эта неделя", "Следующая неделя", "Прошлая неделя" or nothing. */
export function weekName(monday: string, today: string): string | undefined {
  const diff = Math.round((Date.parse(monday) - Date.parse(mondayOf(today))) / (7 * 864e5));
  return { "-1": "Прошлая неделя", "0": "Эта неделя", "1": "Следующая неделя" }[diff];
}

/** The day that opens first: today, or Monday of the next week on Sunday. */
export function startDay(today: string): string {
  const isSunday = mondayOf(today) !== mondayOf(addDays(today, 1));
  return isSunday ? addDays(today, 1) : today;
}

const VIEW_KEY = "orbit.view.v1";

/** The view chosen last time on this device, if any. */
export function loadView(): View | undefined {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === "day" || v === "week" ? v : undefined;
  } catch {
    return undefined;
  }
}

export function saveView(view: View): void {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Private mode or full storage: the choice is just not remembered.
  }
}

/** "1 пара", "3 пары", "5 пар". */
export function countLessons(n: number): string {
  const d = n % 10;
  const dd = n % 100;
  if (n === 0) return "пар нет";
  if (d === 1 && dd !== 11) return `${n} пара`;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return `${n} пары`;
  return `${n} пар`;
}
