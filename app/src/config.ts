// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// Where the data API lives (ADR 0003, ADR 0008). Set VITE_DATA_URL at
// build time to read another copy; by default the API is next to the
// app on the same site. Shared by the app and the service worker, so it
// must not touch the DOM.
export const dataURL = new URL(
  import.meta.env.VITE_DATA_URL || "./api/v1/",
  globalThis.location.href,
).href;
