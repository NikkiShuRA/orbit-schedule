// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

import { dataURL } from "./config";

// The parts of the API that the app reads. The full description is
// api/v1/openapi.json; fields not listed here are ignored, as API v1
// requires of readers (ADR 0008).

export interface Source {
  id: string;
  name: string;
  shortName?: string;
}

export interface Index {
  sources: Source[];
}

/** Reads a file of the API by its path relative to the API root. */
export async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(new URL(path, dataURL), signal ? { signal } : {});
  if (!res.ok) {
    throw new Error(`${path}: HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}
