// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// Everything known about a lesson, opened by a tap on its card. Loaded
// only when first needed, so it costs nothing at start (ADR 0010 budget).

import type { LessonState, Slot } from "../lib/calendar";
import { formatDay, formatMinutes, toMinutes } from "../lib/dates";
import type { Entry } from "../lib/profile";
import type { LessonView } from "../lib/schedule";
import type { Selection } from "../lib/selection";
import styles from "./Details.module.css";
import { Icon } from "./Icon";
import { Sheet } from "./ui";

export default function Details({
  slot,
  date,
  state,
  sel,
  place,
  changed,
  onOpen,
  onClose,
}: {
  slot: Slot;
  date: string;
  state: LessonState | undefined;
  sel: Selection;
  /** The institution's short name. */
  place: string;
  /** "Изменено в источнике …", already formatted. */
  changed: string;
  onOpen: (entry: Entry) => void;
  onClose: () => void;
}) {
  const subjects = new Set(slot.lessons.map((l) => l.subject));
  const shared = subjects.size === 1 ? slot.lessons[0] : undefined;
  const title = shared ? (shared.subject ?? "Предмет не указан") : "Пары подгрупп";
  const day = formatDay(date);
  const length =
    slot.start && slot.end ? formatMinutes(toMinutes(slot.end) - toMinutes(slot.start)) : undefined;

  return (
    <Sheet title={title} onClose={onClose} wide>
      <div className={styles.when}>
        <p className={styles.date}>{day.charAt(0).toUpperCase() + day.slice(1)}</p>
        <p className={styles.time}>
          {slot.start ?? "Время не указано"}
          {slot.end && `–${slot.end}`}
          {slot.period !== undefined && <span className={styles.muted}> · {slot.period} пара</span>}
          {length && <span className={styles.muted}> · {length}</span>}
        </p>
        {state && (
          <p className={`${styles.state} ${styles[state]}`}>
            {state === "now" ? "Идёт сейчас" : state === "next" ? "Следующая" : "Прошла"}
          </p>
        )}
        {slot.timeFromBells && (
          <p className={styles.bells}>
            <Icon name="info" />
            Время взято из сетки звонков: у самой пары его нет в расписании.
          </p>
        )}
        {!slot.end && slot.start && !slot.timeFromBells && (
          <p className={styles.bells}>
            <Icon name="info" />
            Учебное заведение не указало, когда пара заканчивается.
          </p>
        )}
      </div>

      {slot.lessons.map((l) => (
        <Part
          key={l.key}
          lesson={l}
          sel={sel}
          place={place}
          withSubject={!shared}
          withType={!!shared && l === slot.lessons[0]}
          onOpen={onOpen}
        />
      ))}

      <p className={styles.source}>
        {changed}. Данные — как их опубликовало учебное заведение ({place}).
      </p>
    </Sheet>
  );
}

function Part({
  lesson: l,
  sel,
  place,
  withSubject,
  withType,
  onOpen,
}: {
  lesson: LessonView;
  sel: Selection;
  place: string;
  withSubject: boolean;
  withType: boolean;
  onOpen: (entry: Entry) => void;
}) {
  const open = (kind: Selection["kind"], id: string, name: string) =>
    onOpen({ source: sel.source, kind, id, name, place });
  return (
    <section className={styles.part}>
      {l.subgroup !== undefined && <h3 className={styles.subgroup}>{l.subgroup} подгруппа</h3>}
      <dl className={styles.facts}>
        {withSubject && (
          <Fact label="Предмет">
            {l.subject ?? <span className={styles.muted}>не указан</span>}
          </Fact>
        )}
        {(withSubject || withType) && l.lessonType && <Fact label="Вид">{l.lessonType}</Fact>}
        <Fact label="Кабинет">
          {l.rooms.length > 0 ? (
            <span className={styles.room}>{l.rooms.join(", ")}</span>
          ) : (
            <span className={styles.muted}>не указан</span>
          )}
        </Fact>
        {l.building && <Fact label="Корпус">{l.building}</Fact>}
        {l.teacherNames.length > 0 && (
          <Fact label={l.teacherNames.length > 1 ? "Преподаватели" : "Преподаватель"}>
            <ul className={styles.people}>
              {l.teacherNames.map((name, i) => {
                const id = l.teacherIds[i];
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: the same name can repeat.
                  <li key={i}>
                    {id ? (
                      <button
                        type="button"
                        className={styles.link}
                        onClick={() => open("teacher", id, name)}
                      >
                        {name}
                        <span className={styles.linkHint}>расписание</span>
                      </button>
                    ) : (
                      name
                    )}
                  </li>
                );
              })}
            </ul>
          </Fact>
        )}
        {sel.kind === "teacher" && l.groups.length > 0 && (
          <Fact label={l.groups.length > 1 ? "Группы" : "Группа"}>
            <ul className={styles.people}>
              {l.groups.map((name, i) => {
                const id = l.groupIds[i];
                const plain = name.replace(/, подгруппа \d+$/, "");
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: names repeat by subgroup.
                  <li key={i}>
                    {id ? (
                      <button
                        type="button"
                        className={styles.link}
                        onClick={() => open("group", id, `Группа ${plain}`)}
                      >
                        {name}
                        <span className={styles.linkHint}>расписание</span>
                      </button>
                    ) : (
                      name
                    )}
                  </li>
                );
              })}
            </ul>
          </Fact>
        )}
        {l.together.length > 0 && (
          <Fact label="Вместе с группами">
            <ul className={styles.people}>
              {l.together.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    className={styles.link}
                    onClick={() => open("group", g.id, `Группа ${g.name}`)}
                  >
                    {g.name}
                    <span className={styles.linkHint}>расписание</span>
                  </button>
                </li>
              ))}
            </ul>
          </Fact>
        )}
        {l.note && <Fact label="Примечание">{l.note}</Fact>}
      </dl>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
