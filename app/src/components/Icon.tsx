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
  chevronLeft: "m15 6-6 6 6 6",
  cup: "M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9Zm11 2h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5v2.5M12 3.5v2.5",
  day: "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm-1 5h16M8 13h8M8 16.5h5",
  week: "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm4.3 0v16m5.4-16v16",
  swap: "M7 7h13m-4-4 4 4-4 4M17 17H4m4 4-4-4 4-4",
  cloudOff:
    "M3 3l18 18M8 8a5 5 0 0 0-1.9 9.6M17.5 17.5H8m10-1.2A4 4 0 0 0 16 9h-.3A6 6 0 0 0 10.6 6",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5v-5m0-3v.01",
  star: "m12 3.5 2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9L12 3.5Z",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-1.6.1-1.4-.1-1.4 2-1.6-2-3.4-2.4.9a7.5 7.5 0 0 0-2.4-1.4L14 2.5h-4l-.6 2.6A7.5 7.5 0 0 0 7 6.5l-2.4-.9-2 3.4 2 1.6-.1 1.4.1 1.4-2 1.6 2 3.4 2.4-.9a7.5 7.5 0 0 0 2.4 1.4l.6 2.6h4l.6-2.6a7.5 7.5 0 0 0 2.4-1.4l2.4.9 2-3.4-2-1.6Z",
  close: "M6 6l12 12M18 6 6 18",
  open: "M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  home: "M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-8Z",
} as const;

export type IconName = keyof typeof paths;

export function Icon({
  name,
  className,
  filled = false,
}: {
  name: IconName;
  className?: string | undefined;
  /** Filled shape: a chosen star. */
  filled?: boolean;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill={filled ? "currentColor" : "none"}
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
