// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// Small building blocks shared by the screens.

import { type ReactNode, useEffect, useId, useRef } from "react";
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

/**
 * A panel over the page: a sheet from the bottom on a phone, a panel at
 * the side on a wide screen. A native modal dialog: focus stays inside,
 * Esc and a tap outside close it, the page behind is inert.
 */
export function Sheet({
  title,
  onClose,
  children,
  wide = false,
  side = "right",
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Wider panel, for lesson details with long names. */
  wide?: boolean;
  /** "left": slides from the left edge on every screen, like a menu. */
  side?: "left" | "right";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    }
    return () => {
      if (d.open && typeof d.close === "function") d.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={[styles.sheet, wide && styles.sheetWide, side === "left" && styles.sheetLeft]
        .filter(Boolean)
        .join(" ")}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // A click on the dim backdrop lands on the dialog itself.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className={styles.sheetInner}>
        <header className={styles.sheetHead}>
          <h2 id={titleId} className={styles.sheetTitle}>
            {title}
          </h2>
          <button type="button" className={styles.close} aria-label="Закрыть" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div className={styles.sheetBody}>{children}</div>
      </div>
    </dialog>
  );
}
