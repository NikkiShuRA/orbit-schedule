// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

import { type ReactNode, useEffect, useId, useRef } from "react";
import type { Catalog, Status } from "../api";
import { useJSON, useNow } from "../hooks";
import { type Entry, keyOf, type Prefs, setSubgroup } from "../lib/profile";
import type { Selection } from "../lib/selection";
import { Calendar } from "./Calendar";
import { Icon } from "./Icon";
import { failedText } from "./messages";
import styles from "./Schedule.module.css";
import { Notice, Skeleton } from "./ui";

/** The schedule of the selected group or teacher. */
export function Schedule({
  sel,
  onChange,
  onSeen,
  onFind,
  onOpen,
  starred,
  mine,
  onStar,
  prefs,
  onPrefs,
}: {
  sel: Selection;
  /** Choose another schedule, when this one cannot be shown. */
  onChange: () => void;
  /** The schedule was found and is on screen. */
  onSeen: (e: Entry) => void;
  /** Open search; none when search is already on screen. */
  onFind: (() => void) | undefined;
  /** Open another schedule, e.g. a teacher's from lesson details. */
  onOpen: (e: Entry) => void;
  starred: boolean;
  mine: boolean;
  onStar: (e: Entry) => void;
  prefs: Prefs;
  onPrefs: (p: Prefs) => void;
}) {
  const now = useNow();
  const catalog = useJSON<Catalog>(`${sel.source}/catalog.json`);
  const status = useJSON<Status>(`${sel.source}/status.json`);
  const headingId = useId();

  const cat = catalog.kind === "ready" ? catalog.data : undefined;
  const found =
    sel.kind === "group"
      ? cat?.groups?.find((g) => g.id === sel.id)?.name
      : cat?.teachers?.find((t) => t.id === sel.id)?.name;
  const place = cat ? (cat.institution.shortName ?? cat.institution.name) : "";
  const title = found && (sel.kind === "group" ? `Группа ${found}` : found);
  const entry: Entry | undefined = title ? { ...sel, name: title, place } : undefined;

  // Reported once per schedule, for "recent" in the profile.
  const reported = useRef("");
  const seenKey = entry ? JSON.stringify(entry) : "";
  useEffect(() => {
    if (seenKey && reported.current !== seenKey) {
      reported.current = seenKey;
      onSeen(JSON.parse(seenKey) as Entry);
    }
  });

  if (catalog.kind === "loading") {
    return <Skeleton label="Загружаем расписание…" rows={4} />;
  }
  if (catalog.kind !== "ready" || !cat) {
    return (
      <Problem onChange={onChange}>
        {catalog.kind === "missing"
          ? "Это учебное заведение больше не публикуется в Orbit."
          : failedText(catalog.kind === "failed" ? catalog.reason : "server", "расписание")}
      </Problem>
    );
  }
  if (!entry) {
    return (
      <Problem onChange={onChange}>
        {sel.kind === "group" ? "Такой группы" : "Такого преподавателя"} нет в расписании {place}.
        Возможно, ссылка устарела.
      </Problem>
    );
  }

  const head = (
    <div className={styles.who}>
      <div className={styles.whoText}>
        <h2 id={headingId} className={styles.name}>
          {entry.name}
        </h2>
        <p className={styles.place}>
          <Icon name="building" />
          {place}
          {sel.kind === "teacher" && " · преподаватель"}
          {mine && <span className={styles.mine}>моё</span>}
        </p>
      </div>
      <div className={styles.whoActions}>
        <button
          type="button"
          className={styles.star}
          aria-pressed={starred}
          aria-label="В избранное"
          title={starred ? "Убрать из избранного" : "В избранное"}
          onClick={() => onStar(entry)}
        >
          <Icon name="star" filled={starred} />
        </button>
        {onFind && (
          <button type="button" className={styles.change} onClick={onFind}>
            <Icon name="swap" />
            Сменить
          </button>
        )}
      </div>
    </div>
  );

  return (
    <section aria-labelledby={headingId}>
      <Calendar
        sel={sel}
        catalog={cat}
        status={status}
        catalogFromCache={catalog.fromCache}
        now={now}
        head={head}
        place={place}
        startView={prefs.startView}
        subgroup={prefs.subgroups[keyOf(sel)]}
        onSubgroup={(n) => onPrefs(setSubgroup(prefs, sel, n))}
        onOpen={onOpen}
      />
    </section>
  );
}

function Problem({ children, onChange }: { children: ReactNode; onChange: () => void }) {
  return (
    <div className={styles.problem}>
      <Notice tone="warn" role="alert">
        {children}
      </Notice>
      <button type="button" className={styles.primary} onClick={onChange}>
        Выбрать другое расписание
      </button>
    </div>
  );
}
