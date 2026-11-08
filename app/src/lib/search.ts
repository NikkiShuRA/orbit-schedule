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
