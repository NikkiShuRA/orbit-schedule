// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// Small building blocks shared by the screens.

import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import styles from "./ui.module.css";

/** A message in a box: "warn" for what may mislead, "info" otherwise. */
export function Notice({
  children,
  tone = "info",
  icon,
  role,
}: {
  children: ReactNode;
  tone?: "info" | "warn";
  icon?: IconName;
  role?: "alert" | "status";
}) {
  return (
    <div className={`${styles.notice} ${tone === "warn" ? styles.warn : ""}`}>
      <Icon name={icon ?? (tone === "warn" ? "info" : "clock")} className={styles.noticeIcon} />
      <p role={role}>{children}</p>
    </div>
  );
}

/** Grey placeholders while something loads; the label is for screen readers. */
export function Skeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className={styles.skeleton}>
      <p aria-live="polite" className={styles.hidden}>
        {label}
      </p>
      {Array.from({ length: rows }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders.
        <div key={i} className={styles.block} />
      ))}
    </div>
  );
}
