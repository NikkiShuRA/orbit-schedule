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

/** Loads a file of the API; `null` loads nothing. */
export function useJSON<T>(path: string | null): Loaded<T> {
  const [state, setState] = useState<{ path: string | null; loaded: Loaded<T> }>({
    path,
    loaded: { kind: "loading" },
  });

  useEffect(() => {
    if (path === null) return;
    const ctrl = new AbortController();
    setState({ path, loaded: { kind: "loading" } });
    getJSON<T>(path, ctrl.signal)
      .then((fetched) => setState({ path, loaded: { kind: "ready", ...fetched } }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        const loaded: Loaded<T> =
          err instanceof NotFoundError
            ? { kind: "missing" }
            : { kind: "failed", reason: err instanceof ServerError ? "server" : "offline" };
        setState({ path, loaded });
      });
    return () => ctrl.abort();
  }, [path]);

  // A result for another path is never shown, even for one render.
  return state.path === path ? state.loaded : { kind: "loading" };
}

/** The current time, updated every 30 seconds for "now" and ages. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
