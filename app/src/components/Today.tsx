// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

import { roomLabel, type Slot, slots } from "../lib/calendar";
import { formatMinutes, toMinutes } from "../lib/dates";
import { type DayView, findNow, type LessonView } from "../lib/schedule";
import type { Selection } from "../lib/selection";
import styles from "./Today.module.css";

type Kind = Selection["kind"];

/**
 * Today at a glance: what is on now and what comes next, read like a
 * departure board: how long until it starts, and the room, large.
 * The first thing people want when they open the app between lessons.
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
          {slots(current).map((s) => (
            <HeroSlot key={s.key} slot={s} kind={kind} minutes={minutes} live />
          ))}
        </div>
      )}
      {next.length > 0 && (
        <div className={styles.block}>
          <div className={styles.head}>
            <h3 className={styles.label}>Дальше</h3>
            {nextStart && (
              <p className={styles.countdown}>
                через {formatMinutes(toMinutes(nextStart) - minutes)}
              </p>
            )}
          </div>
          {slots(next).map((s) => (
            <HeroSlot key={s.key} slot={s} kind={kind} minutes={minutes} />
          ))}
        </div>
      )}
    </div>
  );
}

function HeroSlot({
  slot,
  kind,
  minutes,
  live,
}: {
  slot: Slot;
  kind: Kind;
  minutes: number;
  live?: boolean;
}) {
  const subjects = new Set(slot.lessons.map((l) => l.subject));
  const shared = subjects.size === 1 ? slot.lessons[0] : undefined;
  const start = slot.start ? toMinutes(slot.start) : undefined;
  const end = slot.end ? toMinutes(slot.end) : undefined;
  const progress =
    live && start !== undefined && end !== undefined && end > start
      ? Math.round(((minutes - start) / (end - start)) * 100)
      : undefined;
  return (
    <div className={styles.slot}>
      {shared && <p className={styles.subject}>{shared.subject ?? "Предмет не указан"}</p>}
      {slot.start && (
        <p className={styles.time}>
          {slot.start}
          {slot.end && `–${slot.end}`}
          {slot.period !== undefined && <span> · {slot.period} пара</span>}
        </p>
      )}
      <ul className={styles.places}>
        {slot.lessons.map((l) => (
          <Place key={l.key} lesson={l} kind={kind} withSubject={!shared} />
        ))}
      </ul>
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
          <span className={styles.left}>ещё {formatMinutes(end - minutes)}</span>
        </div>
      )}
    </div>
  );
}

/** Where to go: the room large, like a gate, then the building and people. */
function Place({
  lesson: l,
  kind,
  withSubject,
}: {
  lesson: LessonView;
  kind: Kind;
  withSubject: boolean;
}) {
  const people = kind === "teacher" ? l.groups : l.teachers;
  const room = l.rooms.map((r) => roomLabel(r, l.building)).join(", ");
  return (
    <li className={styles.place}>
      {l.subgroup !== undefined && <span className={styles.subgroup}>{l.subgroup} подгр.</span>}
      {withSubject && <span className={styles.rowSubject}>{l.subject ?? "Предмет не указан"}</span>}
      {room && <span className={styles.room}>{room}</span>}
      {(l.building || people.length > 0) && (
        <span className={styles.who}>{[l.building, ...people].filter(Boolean).join(" · ")}</span>
      )}
    </li>
  );
}
