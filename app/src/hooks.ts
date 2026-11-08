// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from "react";
import { type Fetched, getJSON, NotFoundError, ServerError } from "./api";

export type Loaded<T> =
  | { kind: "loading" }
  | ({ kind: "ready" } & Fetched<T>)
  /** The file does not exist, e.g. a week not published yet. */
  | { kind: "missing" }
  /**
   * offline: no network and no saved copy;
   * server: the server answered with an error or something broken.
   */
  | { kind: "failed"; reason: "offline" | "server" };

/**
 * Counts the moments when shown data may have gone stale: the page came
 * back to the screen (an installed app is often left open for days) or
 * the network came back.
 */
function useResume(): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const bump = () => {
      if (document.visibilityState === "visible") setCount((c) => c + 1);
    };
    document.addEventListener("visibilitychange", bump);
    globalThis.addEventListener("online", bump);
    return () => {
      document.removeEventListener("visibilitychange", bump);
      globalThis.removeEventListener("online", bump);
    };
  }, []);
  return count;
}

/**
 * Loads a file of the API; `null` loads nothing. When the page comes
 * back to the screen, the file is loaded again quietly: what is shown
 * stays until a newer answer arrives, and a failed refresh keeps it.
 */
export function useJSON<T>(path: string | null): Loaded<T> {
  const resumed = useResume();
  const [state, setState] = useState<{ path: string | null; loaded: Loaded<T> }>({
    path,
    loaded: { kind: "loading" },
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: `resumed` only triggers a reload.
  useEffect(() => {
    if (path === null) return;
    const ctrl = new AbortController();
    // What is already shown for this path stays while it is refreshed.
    const keepShown = (prev: { path: string | null; loaded: Loaded<T> }) =>
      prev.path === path && prev.loaded.kind === "ready";
    setState((prev) => (keepShown(prev) ? prev : { path, loaded: { kind: "loading" } }));
    getJSON<T>(path, ctrl.signal)
      .then((fetched) => setState({ path, loaded: { kind: "ready", ...fetched } }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        const loaded: Loaded<T> =
          err instanceof NotFoundError
            ? { kind: "missing" }
            : { kind: "failed", reason: err instanceof ServerError ? "server" : "offline" };
        setState((prev) => (keepShown(prev) ? prev : { path, loaded }));
      });
    return () => ctrl.abort();
  }, [path, resumed]);

  // A result for another path is never shown, even for one render.
  return state.path === path ? state.loaded : { kind: "loading" };
}

/**
 * The current time for "now" and ages: every 30 seconds, and at once
 * when the page comes back to the screen (timers sleep in background).
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return now;
}

/** Whether a media query matches, following changes (a rotated tablet). */
export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => globalThis.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mq = globalThis.matchMedia?.(query);
    if (!mq) return;
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return matches;
}
