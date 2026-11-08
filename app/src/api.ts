// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

import { dataURL } from "./config";

// The parts of the API that the app reads. The full description is
// api/v1/openapi.json, the documents are the Orbit standard
// (standard/schema). Fields not listed here are ignored, as API v1
// requires of readers (ADR 0008).

export interface Source {
  id: string;
  name: string;
  shortName?: string;
}

export interface Index {
  sources: Source[];
}

export interface Institution {
  id: string;
  name: string;
  shortName?: string;
  /** IANA time zone; dates and times in the documents are local to it. */
  timeZone: string;
}

export interface Coverage {
  institution?: true;
  buildingIds?: string[];
  groupIds?: string[];
  teacherIds?: string[];
}

export interface Named {
  id: string;
  name: string;
  shortName?: string;
}

export interface Group extends Named {
  course?: number;
  buildingId?: string;
  departmentId?: string;
}

export interface CatalogWeek {
  start: string;
  end: string;
  file: string;
  coverage: Coverage;
}

export interface Catalog {
  source: string;
  institution: Institution;
  weeks: CatalogWeek[];
  buildings?: Named[];
  departments?: Named[];
  groups?: Group[];
  teachers?: Named[];
}

export interface Status {
  /** When the source was last checked successfully (ADR 0004). */
  checkedAt: string;
}

/** An explicit stand-in from the source, such as «ВАКАНСИЯ». */
export interface Placeholder {
  placeholder: string;
  sourceText: string;
}

export interface Lesson {
  date: string;
  period?: number;
  start?: string;
  end?: string;
  buildingId?: string;
  groups: { groupId: string; subgroup?: number }[];
  subjectId?: string;
  lessonTypeId?: string;
  teachers?: ({ teacherId: string } | Placeholder)[];
  rooms?: ({ roomId: string } | Placeholder)[];
  note?: string;
}

export interface BellSchedule {
  id: string;
  name?: string;
  buildingIds?: string[];
  periods: { period: number; start: string; end?: string }[];
}

export interface ScheduleDocument {
  institution: Institution;
  publication: { period: { start: string; end: string }; coverage: Coverage };
  provenance: { retrievedAt: string };
  buildings?: Named[];
  rooms?: (Named & { code?: string })[];
  groups?: Group[];
  teachers?: Named[];
  subjects?: Named[];
  lessonTypes?: Named[];
  bellSchedules?: BellSchedule[];
  lessons?: Lesson[];
}

/** A file of the API and whether the service worker served it from its cache. */
export interface Fetched<T> {
  data: T;
  /** True when the network failed and this is the saved copy (ADR 0005). */
  fromCache: boolean;
}

/** The file does not exist: for a week, it is not published (yet). */
export class NotFoundError extends Error {}

/** The server answered, but not with the file: an error or not JSON. */
export class ServerError extends Error {}

/** The header the service worker adds to a response from its cache. */
export const FROM_CACHE_HEADER = "x-orbit-from-cache";

/** Reads a file of the API by its path relative to the API root. */
export async function getJSON<T>(path: string, signal?: AbortSignal): Promise<Fetched<T>> {
  const res = await fetch(new URL(path, dataURL), signal ? { signal } : {});
  if (res.status === 404) {
    throw new NotFoundError(path);
  }
  if (!res.ok) {
    throw new ServerError(`${path}: HTTP ${res.status}`);
  }
  let data: T;
  try {
    data = (await res.json()) as T;
  } catch {
    throw new ServerError(`${path}: not JSON`);
  }
  return { data, fromCache: res.headers.get(FROM_CACHE_HEADER) === "1" };
}
