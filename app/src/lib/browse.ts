// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// Choosing without typing, step by step, as in «Мой Сиелом»: groups by
// building (or department), then by course; teachers by the first letter
// of the surname. A step with only one choice is skipped. Nothing is
// guessed: a group without a building or course is listed as such.

import type { Catalog, Group } from "../api";
import type { Selection } from "./selection";

/** Where in the list of groups the person is. Undefined: not chosen yet. */
export interface GroupPath {
  /** A building or department id; "" for groups without one. */
  place?: string;
  /** null for groups without a course. */
  course?: number | null;
}

export interface Place {
  id: string;
  name: string;
  count: number;
}

export type GroupLevel =
  | { kind: "places"; places: Place[] }
  | { kind: "courses"; courses: { course: number | null; count: number }[] }
  | { kind: "groups"; groups: Group[] };

/** What groups are split by first: buildings, departments or nothing. */
export function placeKind(catalog: Catalog): "building" | "department" | undefined {
  const groups = catalog.groups ?? [];
  if (groups.some((g) => g.buildingId)) return "building";
  if (groups.some((g) => g.departmentId)) return "department";
  return undefined;
}

const placeOf = (g: Group, kind: "building" | "department" | undefined) =>
  (kind === "building" ? g.buildingId : kind === "department" ? g.departmentId : undefined) ?? "";

const natural = (a: string, b: string) =>
  a.localeCompare(b, "ru", { numeric: true, sensitivity: "base" });

/** The step to show for a path: places, courses or the groups themselves. */
export function groupLevel(catalog: Catalog, path: GroupPath): GroupLevel {
  const kind = placeKind(catalog);
  let groups = catalog.groups ?? [];

  if (kind) {
    const ids = [...new Set(groups.map((g) => placeOf(g, kind)))];
    if (path.place === undefined && ids.length > 1) {
      const named = new Map(
        (kind === "building" ? catalog.buildings : catalog.departments)?.map((p) => [
          p.id,
          p.name,
        ]) ?? [],
      );
      const places = ids
        .map((id) => ({
          id,
          name: id ? (named.get(id) ?? id) : kind === "building" ? "Без корпуса" : "Без отделения",
          count: groups.filter((g) => placeOf(g, kind) === id).length,
        }))
        .sort((a, b) => (a.id === "" ? 1 : b.id === "" ? -1 : natural(a.name, b.name)));
      return { kind: "places", places };
    }
    if (path.place !== undefined) groups = groups.filter((g) => placeOf(g, kind) === path.place);
  }

  const courses = [...new Set(groups.map((g) => g.course ?? null))];
  if (path.course === undefined && courses.length > 1) {
    return {
      kind: "courses",
      courses: courses
        .sort((a, b) => (a ?? 99) - (b ?? 99))
        .map((course) => ({
          course,
          count: groups.filter((g) => (g.course ?? null) === course).length,
        })),
    };
  }
  if (path.course !== undefined) groups = groups.filter((g) => (g.course ?? null) === path.course);
  return { kind: "groups", groups: [...groups].sort((a, b) => natural(a.name, b.name)) };
}

/** Whether a step of the path was a real choice (more than one option). */
export function pathSteps(catalog: Catalog, path: GroupPath): ("place" | "course")[] {
  const steps: ("place" | "course")[] = [];
  const kind = placeKind(catalog);
  const all = catalog.groups ?? [];
  if (kind && new Set(all.map((g) => placeOf(g, kind))).size > 1) steps.push("place");
  const inPlace =
    kind && path.place !== undefined ? all.filter((g) => placeOf(g, kind) === path.place) : all;
  if (new Set(inPlace.map((g) => g.course ?? null)).size > 1) steps.push("course");
  return steps;
}

/** The path that leads to a group, to open the list where it is. */
export function pathTo(catalog: Catalog, sel: Selection | undefined): GroupPath {
  if (sel?.kind !== "group") return {};
  const g = catalog.groups?.find((x) => x.id === sel.id);
  if (!g) return {};
  const steps = pathSteps(catalog, { place: placeOf(g, placeKind(catalog)) });
  return {
    ...(steps.includes("place") ? { place: placeOf(g, placeKind(catalog)) } : {}),
    ...(steps.includes("course") ? { course: g.course ?? null } : {}),
  };
}

export function placeName(catalog: Catalog, id: string): string {
  const kind = placeKind(catalog);
  if (!id) return kind === "department" ? "Без отделения" : "Без корпуса";
  const list = kind === "department" ? catalog.departments : catalog.buildings;
  return list?.find((p) => p.id === id)?.name ?? id;
}

/** First letters of teachers' names with how many there are. */
export function letters(catalog: Catalog): { letter: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of catalog.teachers ?? []) {
    const l = t.name.charAt(0).toUpperCase() || "#";
    counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  return [...counts]
    .sort(([a], [b]) => a.localeCompare(b, "ru"))
    .map(([letter, count]) => ({ letter, count }));
}

export function teachersBy(catalog: Catalog, letter: string) {
  return (catalog.teachers ?? [])
    .filter((t) => (t.name.charAt(0).toUpperCase() || "#") === letter)
    .sort((a, b) => natural(a.name, b.name));
}

/**
 * A short code in front of a name, shown as a badge: "ИС" of "ИС-23/9-2",
 * "№7" of "№7, Пролетарский,3", "СП-2" of "(СП-2) Отделение …".
 */
export function badgeOf(name: string): { badge?: string; rest: string } {
  const number = /^№\s*(\d+)[,\s]*(.+)$/.exec(name);
  if (number?.[1] && number[2]) return { badge: `№${number[1]}`, rest: number[2] };
  const paren = /^\(([^)]{1,8})\)\s*(.+)$/.exec(name);
  if (paren?.[1] && paren[2]) return { badge: paren[1], rest: paren[2] };
  const letters = /^(\p{L}{1,5})[-\s](.+)$/u.exec(name);
  if (letters?.[1] && letters[2]) return { badge: letters[1], rest: letters[2] };
  return { rest: name };
}
