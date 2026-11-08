// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

import { type ReactNode, useId, useState } from "react";
import type { Catalog, ScheduleDocument, Status } from "../api";
import { type Loaded, useJSON, useNow } from "../hooks";
import { ago, isStale } from "../lib/age";
import {
  addDays,
  formatDay,
  formatMoment,
  formatShortDate,
  minutesIn,
  mondayOf,
  todayIn,
} from "../lib/dates";
import {
  buildWeek,
  type CoverageState,
  type DayView,
  findNow,
  type LessonView,
  type WeekView,
} from "../lib/schedule";
import type { Selection } from "../lib/selection";
import { failedText } from "./messages";
import styles from "./Schedule.module.css";

/** The week of the selected group or teacher. */
export function Schedule({ sel, onChange }: { sel: Selection; onChange: () => void }) {
  const now = useNow();
  const catalog = useJSON<Catalog>(`${sel.source}/catalog.json`);
  const status = useJSON<Status>(`${sel.source}/status.json`);
  const headingId = useId();

  if (catalog.kind === "loading") {
    return <p aria-live="polite">Загружаем расписание…</p>;
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
        <div>
          <h2 id={headingId} className={styles.name}>
            {sel.kind === "group" ? `Группа ${name}` : name}
          </h2>
          <p className={styles.place}>{cat.institution.shortName ?? cat.institution.name}</p>
        </div>
        <button type="button" className={styles.change} onClick={onChange}>
          Сменить
        </button>
      </div>
      <Weeks
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
      <p role="alert">{children}</p>
      <button type="button" className={styles.change} onClick={onChange}>
        Выбрать другое расписание
      </button>
    </div>
  );
}

function Weeks({
  sel,
  catalog,
  status,
  catalogFromCache,
  now,
}: {
  sel: Selection;
  catalog: Catalog;
  status: Loaded<Status>;
  catalogFromCache: boolean;
  now: Date;
}) {
  const tz = catalog.institution.timeZone;
  const today = todayIn(tz, now);
  // On Sunday the coming week matters more than the one ending.
  const [offset, setOffset] = useState(() =>
    mondayOf(today) === mondayOf(addDays(today, 1)) ? 0 : 1,
  );
  const monday = addDays(mondayOf(today), 7 * offset);
  const entry = catalog.weeks.find((w) => w.start === monday);
  const folder = sel.kind === "group" ? "groups" : "teachers";
  const week = useJSON<ScheduleDocument>(
    entry ? `${sel.source}/${folder}/${encodeURIComponent(sel.id)}/${entry.file}` : null,
  );

  const fromCache =
    catalogFromCache ||
    (status.kind === "ready" && status.fromCache) ||
    (week.kind === "ready" && week.fromCache);

  return (
    <>
      <Freshness status={status} fromCache={fromCache} now={now} />
      <fieldset className={styles.tabs}>
        <legend className={styles.hidden}>Неделя</legend>
        {(["Эта неделя", "Следующая"] as const).map((label, i) => (
          <button
            key={label}
            type="button"
            className={styles.tab}
            aria-pressed={offset === i}
            onClick={() => setOffset(i)}
          >
            {label}
          </button>
        ))}
      </fieldset>
      {!entry ? (
        <p className={styles.notice}>
          Расписание на неделю с {formatShortDate(monday)} ещё не опубликовано.
        </p>
      ) : week.kind === "loading" ? (
        <p aria-live="polite">Загружаем неделю…</p>
      ) : week.kind === "missing" ? (
        <p className={styles.notice}>Расписание на эту неделю ещё не опубликовано.</p>
      ) : week.kind === "failed" ? (
        <p role="alert" className={styles.notice}>
          {failedText(week.reason, "эту неделю")}
        </p>
      ) : (
        <Week
          view={buildWeek(week.data, sel, catalog)}
          today={today}
          minutes={minutesIn(tz, now)}
          timeZone={tz}
          kind={sel.kind}
        />
      )}
    </>
  );
}

function Freshness({
  status,
  fromCache,
  now,
}: {
  status: Loaded<Status>;
  fromCache: boolean;
  now: Date;
}) {
  if (status.kind === "loading") return null;
  const checkedAt = status.kind === "ready" ? status.data.checkedAt : undefined;
  const age = checkedAt ? `проверено ${ago(checkedAt, now)}` : "когда проверено — неизвестно";
  if (fromCache) {
    return (
      <p role="status" className={styles.offline}>
        Нет связи — показана сохранённая копия, {age}. Расписание могло измениться.
      </p>
    );
  }
  if (!checkedAt || isStale(checkedAt, now)) {
    return (
      <p role="status" className={styles.offline}>
        Расписание давно не обновлялось: {age}. Оно могло измениться.
      </p>
    );
  }
  return <p className={styles.fresh}>Расписание {age}</p>;
}

function Week({
  view,
  today,
  minutes,
  timeZone,
  kind,
}: {
  view: WeekView;
  today: string;
  minutes: number;
  timeZone: string;
  kind: Selection["kind"];
}) {
  const todayView = view.days.find((d) => d.date === today);
  return (
    <>
      <CoverageNotice coverage={view.coverage} kind={kind} />
      {todayView && view.coverage !== "outside" && (
        <Today day={todayView} minutes={minutes} kind={kind} />
      )}
      {view.coverage !== "outside" &&
        view.days.map((day) => (
          <Day
            key={day.date}
            day={day}
            isToday={day.date === today}
            coverage={view.coverage}
            kind={kind}
          />
        ))}
      <p className={styles.muted}>Изменено в источнике {formatMoment(view.changedAt, timeZone)}</p>
    </>
  );
}

function CoverageNotice({ coverage, kind }: { coverage: CoverageState; kind: Selection["kind"] }) {
  if (coverage === "outside") {
    return (
      <p className={styles.notice}>
        Учебное заведение ещё не опубликовало расписание корпуса этой{" "}
        {kind === "group" ? "группы" : "записи"} на эту неделю.
      </p>
    );
  }
  if (coverage === "partial") {
    return (
      <p className={styles.notice}>
        На эту неделю опубликованы не все корпуса: пары в остальных здесь не видны.
      </p>
    );
  }
  return null;
}

function Today({ day, minutes, kind }: { day: DayView; minutes: number; kind: Selection["kind"] }) {
  const { current, next } = findNow(day.lessons, minutes);
  if (day.lessons.length === 0) return null;
  if (current.length === 0 && next.length === 0) {
    return <p className={styles.today}>На сегодня пары закончились.</p>;
  }
  return (
    <div className={styles.today}>
      {current.length > 0 && (
        <>
          <h3 className={styles.todayHeading}>Сейчас</h3>
          {current.map((l) => (
            <Lesson key={l.key} lesson={l} kind={kind} />
          ))}
        </>
      )}
      {next.length > 0 && (
        <>
          <h3 className={styles.todayHeading}>Дальше</h3>
          {next.map((l) => (
            <Lesson key={l.key} lesson={l} kind={kind} />
          ))}
        </>
      )}
    </div>
  );
}

function Day({
  day,
  isToday,
  coverage,
  kind,
}: {
  day: DayView;
  isToday: boolean;
  coverage: CoverageState;
  kind: Selection["kind"];
}) {
  return (
    <section className={styles.day} aria-label={formatDay(day.date)}>
      <h3 className={styles.dayHeading}>
        {capitalize(formatDay(day.date))}
        {isToday && <span className={styles.badge}>сегодня</span>}
      </h3>
      {day.lessons.length === 0 ? (
        <p className={styles.muted}>
          {coverage === "covered" ? "Пар нет" : "В опубликованных корпусах пар нет"}
        </p>
      ) : (
        <ol className={styles.lessons}>
          {day.lessons.map((l) => (
            <li key={l.key}>
              <Lesson lesson={l} kind={kind} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Lesson({ lesson: l, kind }: { lesson: LessonView; kind: Selection["kind"] }) {
  const who = kind === "teacher" ? [...l.groups, ...l.teachers] : l.teachers;
  const details = [l.lessonType, ...l.rooms, ...who].filter(Boolean);
  return (
    <article className={styles.lesson}>
      <div className={styles.time}>
        {l.start ? (
          <span className={styles.clock}>
            {l.start}
            {l.end && `–${l.end}`}
          </span>
        ) : null}
        {l.period !== undefined && <span className={styles.muted}>{l.period} пара</span>}
        {l.timeFromBells && (
          <span
            className={styles.bells}
            title="У пары нет времени в расписании; показано начало по сетке звонков"
          >
            по звонкам
          </span>
        )}
      </div>
      <div className={styles.body}>
        <p className={styles.subject}>
          {l.subject ?? <span className={styles.muted}>Предмет не указан</span>}
        </p>
        {details.length > 0 && <p className={styles.details}>{details.join(" · ")}</p>}
        {(l.subgroup || l.building) && (
          <p className={styles.details}>
            {[l.subgroup && `подгруппа ${l.subgroup}`, l.building].filter(Boolean).join(" · ")}
          </p>
        )}
        {l.note && <p className={styles.note}>{l.note}</p>}
      </div>
    </article>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
