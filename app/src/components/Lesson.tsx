// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

import type { LessonState } from "../lib/calendar";
import type { LessonView } from "../lib/schedule";
import type { Selection } from "../lib/selection";
import { Icon } from "./Icon";
import styles from "./Lesson.module.css";

type Kind = Selection["kind"];

/** "по звонкам": the time is not in the lesson but from the bell schedule. */
export function Bells() {
  return (
    <span
      className={styles.bells}
      title="У пары нет времени в расписании; показано начало по сетке звонков"
    >
      по звонкам
    </span>
  );
}

/**
 * A lesson as a card. `time` puts the time inside the card (lists);
 * a timeline shows the time beside it. `compact` is for the week grid.
 */
export function Lesson({
  lesson: l,
  kind,
  state,
  time = false,
  compact = false,
}: {
  lesson: LessonView;
  kind: Kind;
  state?: LessonState | undefined;
  time?: boolean;
  compact?: boolean;
}) {
  const people = kind === "teacher" ? l.groups : l.teachers;
  const others = kind === "teacher" ? l.teachers : [];
  const place = [l.rooms.join(", "), compact ? undefined : l.building].filter(Boolean).join(" · ");
  return (
    <article
      className={`${styles.lesson} ${compact ? styles.compact : ""} ${time ? styles.withTime : ""}`}
      data-state={state}
    >
      {time && (
        <div className={styles.time}>
          {l.start ? <span className={styles.start}>{l.start}</span> : null}
          {l.end && <span className={styles.end}>{l.end}</span>}
          {l.period !== undefined && <span className={styles.period}>{l.period} пара</span>}
          {l.timeFromBells && <Bells />}
        </div>
      )}
      <div className={styles.body}>
        {compact && l.start && (
          <p
            className={`${styles.compactTime} ${l.timeFromBells ? styles.fromBells : ""}`}
            title={l.timeFromBells ? "Время по сетке звонков" : undefined}
          >
            {l.start}
            {l.end && `–${l.end}`}
            {l.timeFromBells && <span className={styles.hidden}> (по звонкам)</span>}
          </p>
        )}
        {state === "now" && <span className={styles.live}>идёт</span>}
        {state === "next" && !compact && <span className={styles.soon}>следующая</span>}
        <p className={styles.subject} title={compact ? l.subject : undefined}>
          {l.subject ?? <span className={styles.muted}>Предмет не указан</span>}
        </p>
        {(l.lessonType || l.subgroup) && (
          <p className={styles.tags}>
            {l.lessonType && <span className={styles.tag}>{l.lessonType}</span>}
            {l.subgroup && <span className={styles.tag}>подгруппа {l.subgroup}</span>}
          </p>
        )}
        <ul className={styles.meta}>
          {place && (
            <li>
              <Icon name="place" className={styles.metaIcon} />
              <span>{place}</span>
            </li>
          )}
          {people.length > 0 && (
            <li>
              <Icon name={kind === "teacher" ? "people" : "person"} className={styles.metaIcon} />
              <span>{people.join(" · ")}</span>
            </li>
          )}
          {others.length > 0 && (
            <li>
              <Icon name="person" className={styles.metaIcon} />
              <span>{others.join(" · ")}</span>
            </li>
          )}
        </ul>
        {l.note && <p className={styles.note}>{l.note}</p>}
      </div>
    </article>
  );
}
