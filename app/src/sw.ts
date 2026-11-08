// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// The service worker: how Orbit works without a network (ADR 0005,
// ADR 0010).

import type { WorkboxPlugin } from "workbox-core/types";
/// <reference lib="webworker" />
import { ExpirationPlugin } from "workbox-expiration";
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import { FROM_CACHE_HEADER } from "./api";
import { dataURL } from "./config";

declare const self: ServiceWorkerGlobalScope;

// The app shell (HTML, JS, CSS, icons) is cached ahead, version by
// version; caches of older versions are removed.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Data: the network first, but for no longer than 3 seconds, then the
// saved copy. With a working network a change of rooms must never be
// hidden behind an old copy, and a dead network must not keep the
// person waiting (ADR 0005). Copies not used for three weeks are
// dropped: by then their weeks are over.
//
// A response from the cache gets a header, so the page can say plainly
// that it shows a saved copy (ADR 0005). NetworkFirst only reads the
// cache when the network failed or was too slow.
const markSavedCopy: WorkboxPlugin = {
  cachedResponseWillBeUsed: async ({ cachedResponse }) => {
    if (!cachedResponse) return null;
    const headers = new Headers(cachedResponse.headers);
    headers.set(FROM_CACHE_HEADER, "1");
    return new Response(cachedResponse.body, {
      status: cachedResponse.status,
      statusText: cachedResponse.statusText,
      headers,
    });
  },
};

registerRoute(
  ({ request, url }) => request.method === "GET" && url.href.startsWith(dataURL),
  new NetworkFirst({
    cacheName: "orbit-data-v1",
    networkTimeoutSeconds: 3,
    plugins: [
      new ExpirationPlugin({ maxAgeSeconds: 21 * 24 * 60 * 60, purgeOnQuotaError: true }),
      markSavedCopy,
    ],
  }),
);
