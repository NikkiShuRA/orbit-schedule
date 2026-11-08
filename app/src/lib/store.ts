// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// A value kept in localStorage that screens can subscribe to. Only
// settings live there (ADR 0005, point 3); nothing leaves the device.
//
// Storage may be missing or throw (private mode, blocked storage): the
// value then lives in memory for this visit, and the app never fails.

export interface Store<T> {
  get(): T;
  set(value: T): void;
  subscribe(listener: () => void): () => void;
}

/** Every store, so that forgetting all of them is seen at once. */
const resets: (() => void)[] = [];

export function createStore<T>(key: string, parse: (raw: unknown) => T): Store<T> {
  const read = (): T => {
    try {
      const raw = globalThis.localStorage?.getItem(key);
      return parse(raw ? JSON.parse(raw) : undefined);
    } catch {
      return parse(undefined);
    }
  };
  let value: T | undefined;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const l of listeners) l();
  };
  // Another tab changed it: read again.
  const onStorage = (e: StorageEvent) => {
    if (e.key === key || e.key === null) {
      value = read();
      notify();
    }
  };

  resets.push(() => {
    value = undefined;
    notify();
  });

  return {
    get() {
      value ??= read();
      return value;
    },
    set(next) {
      value = next;
      try {
        globalThis.localStorage?.setItem(key, JSON.stringify(next));
      } catch {
        // Kept in memory only.
      }
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) globalThis.addEventListener?.("storage", onStorage);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) globalThis.removeEventListener?.("storage", onStorage);
      };
    },
  };
}

/** Forgets every Orbit setting on this device. */
export function forgetAll(): void {
  try {
    const keys = Object.keys(globalThis.localStorage ?? {}).filter((k) => k.startsWith("orbit."));
    for (const k of keys) globalThis.localStorage.removeItem(k);
  } catch {
    // Nothing stored, nothing to forget.
  }
  for (const reset of resets) reset();
}
