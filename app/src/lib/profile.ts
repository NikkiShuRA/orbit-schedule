// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// The person's profile and settings. There are no accounts: all of it
// is kept on this device only (ADR 0005, point 3) and never sent
// anywhere. "My schedule" is one entry for now; several at once are
// ADR 0007 and issue #43.

import type { Selection } from "./selection";
import { createStore } from "./store";

/** A schedule with what is needed to list it without loading anything. */
export interface Entry extends Selection {
  /** "Группа 301" or the teacher's full name. */
  name: string;
  /** The institution's short name. */
  place: string;
}

export interface Profile {
  /** "My schedule": what the app opens by default. */
  mine?: Entry;
  /** Saved for a quick switch: a friend's group, a curator. */
  starred: Entry[];
  /** Opened lately, newest first. */
  recent: Entry[];
}

export type Theme = "system" | "light" | "dark";
/** "last": the view chosen last time on this device. */
export type StartView = "last" | "day" | "week";

export interface Prefs {
  theme: Theme;
  startView: StartView;
  /** My subgroup, by schedule key (see `keyOf`). */
  subgroups: Record<string, number>;
  /** The side panel on a wide screen, folded away to give the week room. */
  sideFolded: boolean;
}

const RECENT = 6;
const STARRED = 30;

export const keyOf = (s: Selection) => `${s.source}/${s.kind}/${s.id}`;
export const same = (a: Selection | undefined, b: Selection | undefined) =>
  !!a && !!b && keyOf(a) === keyOf(b);

function entry(v: unknown): Entry | undefined {
  if (typeof v !== "object" || v === null) return undefined;
  const e = v as Record<string, unknown>;
  const ok =
    typeof e.source === "string" &&
    e.source !== "" &&
    (e.kind === "group" || e.kind === "teacher") &&
    typeof e.id === "string" &&
    e.id !== "" &&
    typeof e.name === "string" &&
    typeof e.place === "string";
  return ok
    ? {
        source: e.source as string,
        kind: e.kind as Entry["kind"],
        id: e.id as string,
        name: e.name as string,
        place: e.place as string,
      }
    : undefined;
}

const entries = (v: unknown, max: number): Entry[] =>
  Array.isArray(v)
    ? v
        .flatMap((x) => entry(x) ?? [])
        .filter((e, i, all) => all.findIndex((o) => same(o, e)) === i)
        .slice(0, max)
    : [];

export function parseProfile(raw: unknown): Profile {
  const p = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const mine = entry(p.mine);
  return {
    ...(mine ? { mine } : {}),
    starred: entries(p.starred, STARRED),
    recent: entries(p.recent, RECENT),
  };
}

export function parsePrefs(raw: unknown): Prefs {
  const p = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const theme = p.theme === "light" || p.theme === "dark" ? p.theme : "system";
  const startView = p.startView === "day" || p.startView === "week" ? p.startView : "last";
  const subgroups: Record<string, number> = {};
  if (typeof p.subgroups === "object" && p.subgroups !== null) {
    for (const [k, n] of Object.entries(p.subgroups)) {
      if (Number.isInteger(n) && (n as number) > 0) subgroups[k] = n as number;
    }
  }
  return { theme, startView, subgroups, sideFolded: p.sideFolded === true };
}

export const profileStore = createStore("orbit.profile.v1", parseProfile);
export const prefsStore = createStore("orbit.prefs.v1", parsePrefs);

/**
 * A schedule was opened: it goes to the top of "recent". The first
 * schedule ever chosen becomes "mine"; the person can change that.
 */
export function visit(p: Profile, e: Entry): Profile {
  return {
    ...p,
    mine: p.mine ?? e,
    recent: [e, ...p.recent.filter((r) => !same(r, e))].slice(0, RECENT),
  };
}

export function toggleStar(p: Profile, e: Entry): Profile {
  const starred = p.starred.some((s) => same(s, e))
    ? p.starred.filter((s) => !same(s, e))
    : [...p.starred, e].slice(0, STARRED);
  return { ...p, starred };
}

export function setMine(p: Profile, e: Entry | undefined): Profile {
  const { mine: _, ...rest } = p;
  return e ? { ...rest, mine: e } : rest;
}

export function forgetRecent(p: Profile): Profile {
  return { ...p, recent: [] };
}

/** Sets or clears ("all") my subgroup in a schedule. */
export function setSubgroup(prefs: Prefs, sel: Selection, n: number | undefined): Prefs {
  const subgroups = { ...prefs.subgroups };
  if (n === undefined) delete subgroups[keyOf(sel)];
  else subgroups[keyOf(sel)] = n;
  return { ...prefs, subgroups };
}
