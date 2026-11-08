// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// What the person chose to see: a group or a teacher of a source.
//
// It lives in the address (?s=spk&g=<id> or ?s=spk&t=<id>), so a link
// can be sent to a friend (ADR 0010), and in localStorage, so the next
// visit opens it at once (ADR 0005: localStorage holds settings only).
// "My schedule" is a list (ADR 0007); this version shows one entry.

export type Kind = "group" | "teacher";

export interface Selection {
  source: string;
  kind: Kind;
  id: string;
}

const STORAGE_KEY = "orbit.selection.v1";
const PARAM: Record<Kind, string> = { group: "g", teacher: "t" };

function valid(v: unknown): v is Selection {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.source === "string" &&
    s.source !== "" &&
    (s.kind === "group" || s.kind === "teacher") &&
    typeof s.id === "string" &&
    s.id !== ""
  );
}

export function fromSearch(search: string): Selection | undefined {
  const params = new URLSearchParams(search);
  const source = params.get("s");
  if (!source) return undefined;
  for (const kind of ["group", "teacher"] as const) {
    const id = params.get(PARAM[kind]);
    if (id) return { source, kind, id };
  }
  return undefined;
}

export function toSearch(sel: Selection | undefined): string {
  if (!sel) return "";
  const params = new URLSearchParams({ s: sel.source, [PARAM[sel.kind]]: sel.id });
  return `?${params}`;
}

// localStorage may be missing or throw (private mode, blocked storage):
// the app then works without remembering, never fails.

export function loadSaved(): Selection[] {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list) ? list.filter(valid) : [];
  } catch {
    return [];
  }
}

export function save(list: Selection[]): void {
  try {
    if (list.length === 0) {
      globalThis.localStorage?.removeItem(STORAGE_KEY);
    } else {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  } catch {
    // Not remembered; nothing else to do.
  }
}

/** Asks the browser not to clear the saved schedule (ADR 0005). */
export function askPersistentStorage(): void {
  navigator.storage?.persist?.().catch(() => {});
}
