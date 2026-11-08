// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// Made-up data for tests, shaped like the API. No real institution,
// group or person is meant.

import type { Catalog, Index, ScheduleDocument, Status } from "./api";

export const index: Index = {
  sources: [{ id: "example", name: "Колледж «Пример»", shortName: "КП" }],
};

const institution = {
  id: "example",
  name: "Колледж «Пример»",
  shortName: "КП",
  timeZone: "Asia/Yekaterinburg",
};

export const catalog: Catalog = {
  source: "example",
  institution,
  weeks: [
    {
      start: "2026-11-09",
      end: "2026-11-15",
      file: "2026-11-09.json",
      coverage: { institution: true },
    },
  ],
  buildings: [
    { id: "b-main", name: "Главный корпус" },
    { id: "b-other", name: "Учебный корпус 2" },
  ],
  departments: [{ id: "d-1", name: "Отделение примеров" }],
  groups: [
    { id: "g-210", name: "210", course: 2, buildingId: "b-other" },
    { id: "g-101", name: "101", course: 1, departmentId: "d-1", buildingId: "b-main" },
    { id: "g-102", name: "102", course: 1, buildingId: "b-main" },
  ],
  teachers: [
    { id: "t-1", name: "Иванов Иван Иванович", shortName: "Иванов И. И." },
    { id: "t-2", name: "Семёнов Пётр" },
  ],
};

export const status: Status = { checkedAt: "2026-11-09T09:55:00+05:00" };

export const groupWeek: ScheduleDocument = {
  institution,
  publication: {
    period: { start: "2026-11-09", end: "2026-11-15" },
    coverage: { institution: true },
  },
  provenance: { retrievedAt: "2026-11-08T12:00:00+05:00" },
  buildings: [{ id: "b-main", name: "Главный корпус" }],
  rooms: [{ id: "r-5", name: "Кабинет 5", code: "5" }],
  groups: [{ id: "g-101", name: "101" }],
  teachers: catalog.teachers ?? [],
  subjects: [{ id: "s-math", name: "Математика" }],
  lessonTypes: [{ id: "lt-lecture", name: "Лекция" }],
  bellSchedules: [
    {
      id: "bells",
      name: "Начало пар",
      periods: [
        { period: 1, start: "09:00" },
        { period: 2, start: "10:40" },
      ],
    },
  ],
  lessons: [
    {
      date: "2026-11-09",
      period: 2,
      groups: [{ groupId: "g-101", subgroup: 2 }],
      teachers: [{ placeholder: "unassigned", sourceText: "ВАКАНСИЯ" }],
      rooms: [{ roomId: "r-5" }],
    },
    {
      date: "2026-11-09",
      period: 1,
      buildingId: "b-main",
      groups: [{ groupId: "g-101" }],
      subjectId: "s-math",
      lessonTypeId: "lt-lecture",
      teachers: [{ teacherId: "t-1" }],
      rooms: [{ roomId: "r-5" }],
    },
    {
      date: "2026-11-09",
      period: 2,
      groups: [{ groupId: "g-101", subgroup: 1 }],
      teachers: [{ teacherId: "t-2" }],
    },
    {
      date: "2026-11-10",
      period: 1,
      groups: [{ groupId: "g-101" }],
      subjectId: "s-math",
      teachers: [{ teacherId: "t-1" }],
      note: "Перенос с пятницы",
    },
  ],
};

export const teacherWeek: ScheduleDocument = {
  ...groupWeek,
  groups: [
    { id: "g-101", name: "101" },
    { id: "g-102", name: "102" },
  ],
  lessons: [
    {
      date: "2026-11-09",
      start: "09:00",
      end: "10:30",
      groups: [{ groupId: "g-101" }, { groupId: "g-102", subgroup: 2 }],
      subjectId: "s-math",
      teachers: [{ teacherId: "t-1" }],
    },
  ],
};
