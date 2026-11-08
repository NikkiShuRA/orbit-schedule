// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// How old the data is, in words (ADR 0005: the age is always shown).

const relative = new Intl.RelativeTimeFormat("ru-RU", { numeric: "auto" });

/** "только что", "5 минут назад", "3 часа назад", "вчера", "4 дня назад". */
export function ago(moment: string, now: Date): string {
  const minutes = Math.round((now.getTime() - new Date(moment).getTime()) / 60_000);
  if (Number.isNaN(minutes)) {
    return "неизвестно когда";
  }
  if (minutes < 1) {
    return "только что";
  }
  if (minutes < 60) {
    return relative.format(-minutes, "minute");
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return relative.format(-hours, "hour");
  }
  return relative.format(-Math.floor(hours / 24), "day");
}

/** Data checked longer ago than this is shown as possibly outdated. */
export const STALE_AFTER_MINUTES = 2 * 60;

export function isStale(moment: string, now: Date): boolean {
  const minutes = (now.getTime() - new Date(moment).getTime()) / 60_000;
  return !(minutes <= STALE_AFTER_MINUTES);
}
