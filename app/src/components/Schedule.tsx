// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

import { type ReactNode, useId } from "react";
import type { Catalog, Status } from "../api";
import { useJSON, useNow } from "../hooks";
import type { Selection } from "../lib/selection";
import { Calendar } from "./Calendar";
import { Icon } from "./Icon";
import { failedText } from "./messages";
import styles from "./Schedule.module.css";
import { Notice, Skeleton } from "./ui";

/** The schedule of the selected group or teacher. */
export function Schedule({ sel, onChange }: { sel: Selection; onChange: () => void }) {
  const now = useNow();
  const catalog = useJSON<Catalog>(`${sel.source}/catalog.json`);
  const status = useJSON<Status>(`${sel.source}/status.json`);
  const headingId = useId();

  if (catalog.kind === "loading") {
    return <Skeleton label="Загружаем расписание…" rows={4} />;
  }
  if (catalog.kind !== "ready") {
    return (
      <Problem onChange={onChange}>
        {catalog.kind === "missing"
          ? "Это учебное заведение больше не публикуется в Orbit."
          : failedText(catalog.reason, "расписание")}
      </Problem>
    );
  }

  const cat = catalog.data;
  const name =
    sel.kind === "group"
      ? cat.groups?.find((g) => g.id === sel.id)?.name
      : cat.teachers?.find((t) => t.id === sel.id)?.name;
  if (!name) {
    return (
      <Problem onChange={onChange}>
        {sel.kind === "group" ? "Такой группы" : "Такого преподавателя"} нет в расписании{" "}
        {cat.institution.shortName ?? cat.institution.name}. Возможно, ссылка устарела.
      </Problem>
    );
  }

  return (
    <section aria-labelledby={headingId}>
      <div className={styles.who}>
        <div className={styles.whoText}>
          <h2 id={headingId} className={styles.name}>
            {sel.kind === "group" ? `Группа ${name}` : name}
          </h2>
          <p className={styles.place}>
            <Icon name="building" />
            {cat.institution.shortName ?? cat.institution.name}
            {sel.kind === "teacher" && " · преподаватель"}
          </p>
        </div>
        <button type="button" className={styles.change} onClick={onChange}>
          <Icon name="swap" />
          Сменить
        </button>
      </div>
      <Calendar
        sel={sel}
        catalog={cat}
        status={status}
        catalogFromCache={catalog.fromCache}
        now={now}
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
