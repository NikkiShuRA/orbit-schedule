// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// A few line icons drawn by hand on a 24×24 grid: an icon library would
// cost more than the whole set (budget: ADR 0010). Icons are decoration;
// the text next to them carries the meaning.

const paths = {
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4.35-4.35",
  place:
    "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0",
  people:
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9a6 6 0 0 1 12 0m1.5-9a3 3 0 1 0 0-6m2 15a5.5 5.5 0 0 0-3-5",
  building: "M4 21V5l8-2v18m0-10 8 2v8M2 21h20M8 8v.01M8 12v.01M8 16v.01M16 15v.01M16 18v.01",
  chevron: "m9 6 6 6-6 6",
  swap: "M7 7h13m-4-4 4 4-4 4M17 17H4m4 4-4-4 4-4",
  cloudOff:
    "M3 3l18 18M8 8a5 5 0 0 0-1.9 9.6M17.5 17.5H8m10-1.2A4 4 0 0 0 16 9h-.3A6 6 0 0 0 10.6 6",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5v-5m0-3v.01",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, className }: { name: IconName; className?: string | undefined }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
