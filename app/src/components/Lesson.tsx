// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

import { type ReactNode, useEffect, useRef } from "react";
import { type LessonState, roomLabel, type Slot } from "../lib/calendar";
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
 * subject once (when it is the same), then for each subgroup its number,
 * room and teacher. Two cards one under another read as two lessons in
 * a row, which is what confused people.
 *
 * `time` puts the time inside the card (lists); a timeline shows it
 * beside the card. `compact` is for the week grid: the period and time
 * on top, short names, no building.
 */
export function SlotCard({
  slot,
  kind,
  state,
  time = false,
  compact = false,
  onOpen,
}: {
  slot: Slot;
  kind: Kind;
  state?: LessonState | undefined;
  time?: boolean;
  compact?: boolean;
  /** Opens the details; the whole card is the target. */
  onOpen?: () => void;
}) {
  const subjects = new Set(slot.lessons.map((l) => l.subject));
  const shared = subjects.size === 1 ? slot.lessons[0] : undefined;
  const label = `Подробнее: ${shared ? (shared.subject ?? "предмет не указан") : "пары подгрупп"}${slot.start ? `, ${slot.start}` : ""}`;
  return (
    <article
      className={[styles.card, compact ? styles.compact : styles.full, time && styles.withTime]
        .filter(Boolean)
        .join(" ")}
      data-state={state}
    >
      {onOpen && (
        <button type="button" className={styles.open} aria-label={label} onClick={onOpen} />
      )}
      {time && (
        <div className={styles.time}>
          {slot.start ? <span className={styles.start}>{slot.start}</span> : null}
          {slot.end && <span className={styles.end}>{slot.end}</span>}
          {slot.period !== undefined && <span className={styles.period}>{slot.period} пара</span>}
          {slot.timeFromBells && <Bells />}
        </div>
      )}
      <div className={styles.body}>
        {compact && (slot.period !== undefined || slot.start) && (
          <p className={styles.meta}>
            {slot.period !== undefined && (
              <span className={styles.num} title={`${slot.period} пара`}>
                {slot.period}
              </span>
            )}
            {slot.start && (
              <span
                className={`${styles.metaTime} ${slot.timeFromBells ? styles.fromBells : ""}`}
                title={slot.timeFromBells ? "Время по сетке звонков" : undefined}
              >
                {slot.start}
                {slot.end && `–${slot.end}`}
                {slot.timeFromBells && <span className={styles.hidden}> (по звонкам)</span>}
              </span>
            )}
            <State state={state} compact />
          </p>
        )}
        {!compact && <State state={state} />}
        {shared && <Subject lesson={shared} fit={compact} />}
        <ul className={styles.parts}>
          {slot.lessons.map((l) => (
            <Part key={l.key} lesson={l} kind={kind} withSubject={!shared} compact={compact} />
          ))}
        </ul>
      </div>
    </article>
  );
}

function State({ state, compact }: { state: LessonState | undefined; compact?: boolean }) {
  if (state === "now") return <span className={`${styles.chip} ${styles.live}`}>Идёт сейчас</span>;
  if (state === "next" && !compact) {
    return <span className={`${styles.chip} ${styles.soon}`}>Следующая</span>;
  }
  return null;
}

function Subject({ lesson: l, fit = false }: { lesson: LessonView; fit?: boolean }) {
  const text = l.subject ?? <span className={styles.muted}>Предмет не указан</span>;
  return (
    <div className={fit ? `${styles.head} ${styles.fitHead}` : styles.head}>
      {fit ? (
        <FitText title={l.subject}>{text}</FitText>
      ) : (
        <p className={styles.subject} title={l.subject}>
          {text}
        </p>
      )}
      {l.lessonType && <p className={styles.type}>{l.lessonType}</p>}
    </div>
  );
}

/**
 * A subject in the week grid: two lines at least, and as many more as
 * the card has free room for, when a neighbour in the row is taller.
 * The text never makes the card taller than two lines would.
 */
function FitText({ title, children }: { title: string | undefined; children: ReactNode }) {
  const box = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const fit = () => {
      const line = Number.parseFloat(getComputedStyle(el).lineHeight) || 20;
      el.style.setProperty("--lines", String(Math.max(2, Math.floor(el.clientHeight / line))));
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <p ref={box} className={`${styles.subject} ${styles.fit}`} title={title}>
      <span className={styles.fitText}>{children}</span>
    </p>
  );
}

/** One lesson of the slot: the subgroup, the room and who teaches. */
function Part({
  lesson: l,
  kind,
  withSubject,
  compact,
}: {
  lesson: LessonView;
  kind: Kind;
  withSubject: boolean;
  compact: boolean;
}) {
  const room = l.rooms.map((r) => roomLabel(r, l.building)).join(", ");
  const fullRoom = l.rooms.join(", ");
  const teachers = l.teachers;
  return (
    <li className={styles.part}>
      {withSubject && <Subject lesson={l} />}
      <div className={styles.line}>
        {(l.subgroup !== undefined || room) && (
          <span className={styles.where}>
            {l.subgroup !== undefined && (
              <span className={styles.sg} title={`Подгруппа ${l.subgroup}`}>
                {l.subgroup}
                <span className={styles.hidden}> подгруппа</span>
              </span>
            )}
            {room && (
              <span className={styles.room} title={fullRoom}>
                {room}
              </span>
            )}
          </span>
        )}
        <span className={styles.who}>
          {kind === "teacher" && l.groups.length > 0 && (
            <span className={styles.person}>{l.groups.join(" · ")}</span>
          )}
          {teachers.map((name, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the same name can repeat.
            <span key={i} className={styles.person}>
              {name}
            </span>
          ))}
        </span>
      </div>
      {!compact && l.building && <p className={styles.building}>{l.building}</p>}
      {l.note && <p className={styles.note}>{l.note}</p>}
    </li>
  );
}
