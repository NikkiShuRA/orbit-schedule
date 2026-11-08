// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

import { type LessonState, type Slot, subjectColor } from "../lib/calendar";
import type { LessonView } from "../lib/schedule";
import type { Selection } from "../lib/selection";
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
 * Lessons at one time as one card. Subgroups are rows inside it: the
 * subject once (when it is the same), then for each subgroup its room
 * and teacher. Two cards one under another read as two lessons in a
 * row, which is what confused people.
 *
 * `time` puts the time inside the card (lists); a timeline shows it
 * beside the card. `compact` is for the week grid.
 */
export function SlotCard({
  slot,
  kind,
  state,
  time = false,
  compact = false,
}: {
  slot: Slot;
  kind: Kind;
  state?: LessonState | undefined;
  time?: boolean;
  compact?: boolean;
}) {
  const subjects = new Set(slot.lessons.map((l) => l.subject));
  const shared = subjects.size === 1 ? slot.lessons[0] : undefined;
  const color = shared ? subjectColor(shared.subject) : undefined;
  return (
    <article
      className={[styles.card, compact && styles.compact, time && styles.withTime]
        .filter(Boolean)
        .join(" ")}
      data-state={state}
      data-color={color}
    >
      {time && (
        <div className={styles.time}>
          {slot.start ? <span className={styles.start}>{slot.start}</span> : null}
          {slot.end && <span className={styles.end}>{slot.end}</span>}
          {slot.period !== undefined && <span className={styles.period}>{slot.period} пара</span>}
          {slot.timeFromBells && <Bells />}
        </div>
      )}
      <div className={styles.body}>
        {compact && slot.start && (
          <p
            className={`${styles.compactTime} ${slot.timeFromBells ? styles.fromBells : ""}`}
            title={slot.timeFromBells ? "Время по сетке звонков" : undefined}
          >
            {slot.start}
            {slot.end && `–${slot.end}`}
            {slot.timeFromBells && <span className={styles.hidden}> (по звонкам)</span>}
          </p>
        )}
        {state === "now" && <p className={styles.live}>Идёт сейчас</p>}
        {state === "next" && !compact && <p className={styles.soon}>Следующая</p>}
        {shared && <Subject lesson={shared} />}
        <ul className={styles.rows}>
          {slot.lessons.map((l) => (
            <Row key={l.key} lesson={l} kind={kind} withSubject={!shared} />
          ))}
        </ul>
      </div>
    </article>
  );
}

function Subject({ lesson: l }: { lesson: LessonView }) {
  return (
    <>
      <p className={styles.subject} title={l.subject}>
        {l.subject ?? <span className={styles.muted}>Предмет не указан</span>}
      </p>
      {l.lessonType && <p className={styles.type}>{l.lessonType}</p>}
    </>
  );
}

/** One lesson of the slot: where and with whom, and the subgroup if any. */
function Row({
  lesson: l,
  kind,
  withSubject,
}: {
  lesson: LessonView;
  kind: Kind;
  withSubject: boolean;
}) {
  const people = kind === "teacher" ? [...l.groups, ...l.teachers] : l.teachers;
  const room = l.rooms.join(", ");
  return (
    <li className={styles.row} data-color={withSubject ? subjectColor(l.subject) : undefined}>
      {l.subgroup !== undefined && (
        <span className={styles.subgroup}>
          {l.subgroup}
          <span className={styles.subgroupWord}> подгр.</span>
        </span>
      )}
      <div className={styles.rowBody}>
        {withSubject && <Subject lesson={l} />}
        {(room || l.building) && (
          <p className={styles.place}>
            {room && <span className={styles.room}>{room}</span>}
            {l.building && <span className={styles.building}>{l.building}</span>}
          </p>
        )}
        {people.length > 0 && <p className={styles.people}>{people.join(" · ")}</p>}
        {l.note && <p className={styles.note}>{l.note}</p>}
      </div>
    </li>
  );
}
