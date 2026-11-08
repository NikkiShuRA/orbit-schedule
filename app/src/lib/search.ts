// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// Search over the groups and teachers of a source's catalog.

import type { Catalog } from "../api";
import type { Kind } from "./selection";

export interface Found {
  kind: Kind;
  id: string;
  title: string;
  details?: string;
}

/** Lower case, "ё" as "е", spaces squeezed: how people actually type. */
export function normalize(text: string): string {
  return text.toLowerCase().replaceAll("ё", "е").replace(/\s+/g, " ").trim();
}

const LIMIT = 50;

/**
 * Groups whose name contains the query, and teachers whose full or short
 * name contains it. Matches at the start come first. An empty query
 * finds nothing: hundreds of rows help nobody.
 */
export function search(catalog: Catalog, query: string): Found[] {
  const q = normalize(query);
  if (!q) return [];
  const departments = new Map((catalog.departments ?? []).map((d) => [d.id, d.name]));

  const scored: { found: Found; rank: number }[] = [];
  const add = (found: Found, names: string[]) => {
    const n = names.map(normalize);
    if (n.some((x) => x.startsWith(q))) {
      scored.push({ found, rank: 0 });
    } else if (n.some((x) => x.includes(q))) {
      scored.push({ found, rank: 1 });
    }
  };

  for (const g of catalog.groups ?? []) {
    const parts = [
      g.course ? `${g.course} курс` : undefined,
      g.departmentId ? departments.get(g.departmentId) : undefined,
    ].filter(Boolean);
    add(
      {
        kind: "group",
        id: g.id,
        title: g.name,
        ...(parts.length ? { details: parts.join(", ") } : {}),
      },
      [g.name],
    );
  }
  for (const t of catalog.teachers ?? []) {
    add({ kind: "teacher", id: t.id, title: t.name, details: "преподаватель" }, [
      t.name,
      ...(t.shortName ? [t.shortName] : []),
    ]);
  }

  return scored
    .sort((a, b) => a.rank - b.rank || a.found.title.localeCompare(b.found.title, "ru"))
    .slice(0, LIMIT)
    .map((s) => s.found);
}

export interface Part {
  title: string;
  items: Found[];
}

const byName = (a: Found, b: Found) =>
  a.title.localeCompare(b.title, "ru", { numeric: true, sensitivity: "base" });

/**
 * Everything to choose from without typing: groups by course, teachers
 * by the first letter of the surname.
 */
export function browse(catalog: Catalog, filter: "all" | Kind): Part[] {
  const departments = new Map((catalog.departments ?? []).map((d) => [d.id, d.name]));
  const parts: Part[] = [];

  if (filter !== "teacher") {
    const courses = new Map<number | undefined, Found[]>();
    for (const g of catalog.groups ?? []) {
      const dep = g.departmentId ? departments.get(g.departmentId) : undefined;
      const list = courses.get(g.course) ?? [];
      list.push({ kind: "group", id: g.id, title: g.name, ...(dep ? { details: dep } : {}) });
      courses.set(g.course, list);
    }
    const keys = [...courses.keys()].sort((a, b) => (a ?? 99) - (b ?? 99));
    for (const c of keys) {
      parts.push({
        title: c === undefined ? "Группы" : `${c} курс`,
        items: (courses.get(c) ?? []).sort(byName),
      });
    }
  }

  if (filter !== "group") {
    const letters = new Map<string, Found[]>();
    for (const t of catalog.teachers ?? []) {
      const letter = t.name.charAt(0).toUpperCase() || "#";
      const list = letters.get(letter) ?? [];
      list.push({ kind: "teacher", id: t.id, title: t.name });
      letters.set(letter, list);
    }
    const keys = [...letters.keys()].sort((a, b) => a.localeCompare(b, "ru"));
    for (const l of keys) {
      parts.push({
        title: filter === "teacher" ? l : `Преподаватели · ${l}`,
        items: (letters.get(l) ?? []).sort(byName),
      });
    }
  }
  return parts;
}
