// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// Calendar dates are plain "YYYY-MM-DD" strings, as in the standard.
// "Today" and "now" are taken in the institution's time zone, not the
// phone's: a student travelling or with a wrong zone setting must still
// see the institution's day.

const DAY_MS = 24 * 60 * 60 * 1000;

function parts(now: Date, timeZone: string): Record<string, string> {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(now)) {
    out[p.type] = p.value;
  }
  return out;
}

/** Today's date in the time zone. */
export function todayIn(timeZone: string, now: Date): string {
  const p = parts(now, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutes since midnight in the time zone. */
export function minutesIn(timeZone: string, now: Date): number {
  const p = parts(now, timeZone);
  return Number(p.hour) * 60 + Number(p.minute);
}

/** "HH:MM" to minutes since midnight. */
export function toMinutes(time: string): number {
  const [h = "0", m = "0"] = time.split(":");
  return Number(h) * 60 + Number(m);
}

function toUTC(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromUTC(new Date(toUTC(date).getTime() + days * DAY_MS));
}

/** The Monday of the week the date is in; documents start on Monday. */
export function mondayOf(date: string): string {
  const weekday = (toUTC(date).getUTCDay() + 6) % 7; // Monday is 0
  return addDays(date, -weekday);
}

/** The dates from start to end, both included. */
export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    out.push(d);
  }
  return out;
}

const dayFormat = new Intl.DateTimeFormat("ru-RU", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** "понедельник, 9 ноября" */
export function formatDay(date: string): string {
  return dayFormat.format(toUTC(date));
}

const shortFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** "9 ноября" */
export function formatShortDate(date: string): string {
  return shortFormat.format(toUTC(date));
}

/** "8 ноября в 12:00" for a moment, in the time zone. */
export function formatMoment(moment: string, timeZone: string): string {
  const d = new Date(moment);
  if (Number.isNaN(d.getTime())) return "неизвестно когда";
  const date = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone }).format(
    d,
  );
  const time = new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(d);
  return `${date} в ${time}`;
}

const weekdayFormat = new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" });

/** "пн", "вт"… for a day strip. */
export function formatWeekday(date: string): string {
  return weekdayFormat.format(toUTC(date)).replace(".", "");
}

/** "9" for the 9th of the month. */
export function dayOfMonth(date: string): string {
  return String(Number(date.slice(8, 10)));
}

/** "9–14 ноября" or "30 ноября – 5 декабря". */
export function formatRange(start: string, end: string): string {
  if (start.slice(0, 7) === end.slice(0, 7)) {
    return `${dayOfMonth(start)}–${formatShortDate(end)}`;
  }
  return `${formatShortDate(start)} – ${formatShortDate(end)}`;
}

/** "25 мин", "1 ч", "1 ч 20 мин": a span of minutes, as people say it. */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} мин`;
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}
