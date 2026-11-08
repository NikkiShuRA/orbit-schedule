// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

import { formatMinutes, toMinutes } from "../lib/dates";
import { type DayView, findNow, type LessonView } from "../lib/schedule";
import type { Selection } from "../lib/selection";
import styles from "./Today.module.css";

type Kind = Selection["kind"];

/**
 * Today at a glance: what is on now and what comes next. The first
 * thing people want when they open the app between lessons.
 */
export function Today({ day, minutes, kind }: { day: DayView; minutes: number; kind: Kind }) {
  const { current, next } = findNow(day.lessons, minutes);
  if (day.lessons.length === 0) return null;
  if (current.length === 0 && next.length === 0) {
    return (
      <div className={styles.hero}>
        <div className={styles.block}>
          <p className={styles.label}>Сегодня</p>
          <p className={styles.done}>На сегодня пары закончились.</p>
        </div>
      </div>
    );
  }
  const nextStart = next[0]?.start;
  return (
    <div className={styles.hero}>
      {current.length > 0 && (
        <div className={styles.block}>
          <h3 className={styles.label}>Сейчас</h3>
          {current.map((l) => (
            <HeroLesson key={l.key} lesson={l} kind={kind} minutes={minutes} live />
          ))}
        </div>
      )}
      {next.length > 0 && (
        <div className={styles.block}>
          <div className={styles.row}>
            <h3 className={styles.label}>Дальше</h3>
            {nextStart && (
              <span className={styles.when}>
                через {formatMinutes(toMinutes(nextStart) - minutes)}
              </span>
            )}
          </div>
          {next.map((l) => (
            <HeroLesson key={l.key} lesson={l} kind={kind} minutes={minutes} />
          ))}
        </div>
      )}
    </div>
  );
}

function HeroLesson({
  lesson: l,
  kind,
  minutes,
  live,
}: {
  lesson: LessonView;
  kind: Kind;
  minutes: number;
  live?: boolean;
}) {
  const where = [...l.rooms, ...(kind === "teacher" ? l.groups : l.teachers)];
  const start = l.start ? toMinutes(l.start) : undefined;
  const end = l.end ? toMinutes(l.end) : undefined;
  const progress =
    live && start !== undefined && end !== undefined && end > start
      ? Math.round(((minutes - start) / (end - start)) * 100)
      : undefined;
  return (
    <div className={styles.lesson}>
      <p className={styles.subject}>{l.subject ?? "Предмет не указан"}</p>
      <p className={styles.meta}>
        {l.start && (
          <span className={styles.time}>
            {l.start}
            {l.end && `–${l.end}`}
          </span>
        )}
        {where.length > 0 && <span>{where.join(" · ")}</span>}
      </p>
      {progress !== undefined && end !== undefined && (
        <div className={styles.progressRow}>
          <div
            className={styles.progress}
            role="progressbar"
            aria-label="Прошло от пары"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          <span className={styles.when}>ещё {formatMinutes(end - minutes)}</span>
        </div>
      )}
    </div>
  );
}
