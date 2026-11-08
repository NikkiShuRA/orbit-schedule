// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

import { type ReactNode, useEffect, useId, useState } from "react";
import type { Catalog, ScheduleDocument, Status } from "../api";
import { type Loaded, useJSON, useNow } from "../hooks";
import { ago, isStale } from "../lib/age";
import {
  addDays,
  dayOfMonth,
  formatDay,
  formatMinutes,
  formatMoment,
  formatRange,
  formatShortDate,
  formatWeekday,
  minutesIn,
  mondayOf,
  todayIn,
  toMinutes,
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
import { Icon } from "./Icon";
import { failedText } from "./messages";
import styles from "./Schedule.module.css";
import { Notice, Skeleton } from "./ui";

type Kind = Selection["kind"];

/** The week of the selected group or teacher. */
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

  const who = (
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
  );

  return (
    <section aria-labelledby={headingId}>
      <Weeks
        sel={sel}
        who={who}
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

function Weeks({
  sel,
  who,
  catalog,
  status,
  catalogFromCache,
  now,
}: {
  sel: Selection;
  who: ReactNode;
  catalog: Catalog;
  status: Loaded<Status>;
  catalogFromCache: boolean;
  now: Date;
}) {
  const tz = catalog.institution.timeZone;
  const today = todayIn(tz, now);
  const minutes = minutesIn(tz, now);
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
  const view = week.kind === "ready" ? buildWeek(week.data, sel, catalog) : undefined;
  const todayView =
    view && view.coverage !== "outside" ? view.days.find((d) => d.date === today) : undefined;

  const fromCache =
    catalogFromCache ||
    (status.kind === "ready" && status.fromCache) ||
    (week.kind === "ready" && week.fromCache);

  return (
    <div className={styles.layout}>
      <aside className={styles.side}>
        {who}
        <Freshness status={status} fromCache={fromCache} now={now} />
        <fieldset className={styles.tabs}>
          <legend className={styles.hidden}>Неделя</legend>
          {(["Эта неделя", "Следующая"] as const).map((label, i) => {
            const start = addDays(mondayOf(today), 7 * i);
            return (
              <button
                key={label}
                type="button"
                className={styles.tab}
                aria-pressed={offset === i}
                onClick={() => setOffset(i)}
              >
                {label}
                <span className={styles.tabRange} aria-hidden="true">
                  {formatRange(start, addDays(start, 6))}
                </span>
              </button>
            );
          })}
        </fieldset>
        {todayView && <Today day={todayView} minutes={minutes} kind={sel.kind} />}
      </aside>

      <div className={styles.content}>
        {!entry ? (
          <Notice icon="clock">
            Расписание на неделю с {formatShortDate(monday)} ещё не опубликовано.
          </Notice>
        ) : week.kind === "loading" ? (
          <Skeleton label="Загружаем неделю…" rows={4} />
        ) : week.kind === "missing" ? (
          <Notice icon="clock">Расписание на эту неделю ещё не опубликовано.</Notice>
        ) : week.kind === "failed" ? (
          <Notice tone="warn" role="alert">
            {failedText(week.reason, "эту неделю")}
          </Notice>
        ) : (
          view && <Week view={view} today={today} minutes={minutes} timeZone={tz} kind={sel.kind} />
        )}
      </div>
    </div>
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
      <Notice tone="warn" role="status" icon="cloudOff">
        Нет связи — показана сохранённая копия, {age}. Расписание могло измениться.
      </Notice>
    );
  }
  if (!checkedAt || isStale(checkedAt, now)) {
    return (
      <Notice tone="warn" role="status">
        Расписание давно не обновлялось: {age}. Оно могло измениться.
      </Notice>
    );
  }
  return (
    <p className={styles.fresh}>
      <span className={styles.dot} aria-hidden="true" />
      Расписание {age}
    </p>
  );
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
  kind: Kind;
}) {
  return (
    <>
      <CoverageNotice coverage={view.coverage} kind={kind} />
      {view.coverage !== "outside" && (
        <>
          <DayStrip days={view.days} today={today} />
          {view.days.map((day) => (
            <Day
              key={day.date}
              day={day}
              today={day.date === today ? minutes : undefined}
              coverage={view.coverage}
              kind={kind}
            />
          ))}
        </>
      )}
      <p className={styles.changed}>
        Изменено в источнике {formatMoment(view.changedAt, timeZone)}
      </p>
    </>
  );
}

function CoverageNotice({ coverage, kind }: { coverage: CoverageState; kind: Kind }) {
  if (coverage === "outside") {
    return (
      <Notice tone="warn">
        Учебное заведение ещё не опубликовало расписание корпуса этой{" "}
        {kind === "group" ? "группы" : "записи"} на эту неделю.
      </Notice>
    );
  }
  if (coverage === "partial") {
    return (
      <Notice tone="warn">
        На эту неделю опубликованы не все корпуса: пары в остальных здесь не видны.
      </Notice>
    );
  }
  return null;
}

const dayId = (date: string) => `day-${date}`;

/** The days of the week as chips: a tap scrolls to the day. */
function DayStrip({ days, today }: { days: DayView[]; today: string }) {
  const active = useVisibleDay(days, today);
  return (
    <nav className={styles.strip} aria-label="Дни недели">
      {days.map((d) => (
        <button
          key={d.date}
          type="button"
          className={styles.chip}
          aria-current={d.date === active ? "true" : undefined}
          aria-label={`${formatDay(d.date)}: ${countLessons(d.lessons.length)}`}
          onClick={() => {
            const smooth = !globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
            document
              .getElementById(dayId(d.date))
              ?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
          }}
        >
          <span className={styles.chipDay}>{formatWeekday(d.date)}</span>
          <span className={styles.chipDate}>{dayOfMonth(d.date)}</span>
          <span
            className={`${styles.chipDot} ${d.date === today ? styles.chipToday : ""}`}
            data-empty={d.lessons.length === 0 || undefined}
          />
        </button>
      ))}
    </nav>
  );
}

/**
 * The day at the top of the screen, for the strip. Starts on today
 * (or the first day); follows scrolling where the browser can tell.
 */
function useVisibleDay(days: DayView[], today: string): string | undefined {
  const fallback = days.some((d) => d.date === today) ? today : days[0]?.date;
  const [visible, setVisible] = useState<string | undefined>(undefined);
  const dates = days.map((d) => d.date).join(",");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        const seen = entries.filter((e) => e.isIntersecting).map((e) => e.target.id);
        if (seen.length > 0) setVisible(seen.sort()[0]?.slice("day-".length));
      },
      // A band near the top, under the header and the strip.
      { rootMargin: "-25% 0px -65% 0px" },
    );
    for (const date of dates.split(",")) {
      const el = document.getElementById(dayId(date));
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [dates]);

  return visible ?? fallback;
}

/** Today at a glance: what is on now and what comes next. */
function Today({ day, minutes, kind }: { day: DayView; minutes: number; kind: Kind }) {
  const { current, next } = findNow(day.lessons, minutes);
  if (day.lessons.length === 0) return null;
  if (current.length === 0 && next.length === 0) {
    return (
      <div className={styles.hero}>
        <p className={styles.heroLabel}>Сегодня</p>
        <p className={styles.heroDone}>На сегодня пары закончились.</p>
      </div>
    );
  }
  const nextStart = next[0]?.start;
  return (
    <div className={styles.hero}>
      {current.length > 0 && (
        <div className={styles.heroBlock}>
          <h3 className={styles.heroLabel}>Сейчас</h3>
          {current.map((l) => (
            <HeroLesson key={l.key} lesson={l} kind={kind} minutes={minutes} live />
          ))}
        </div>
      )}
      {next.length > 0 && (
        <div className={styles.heroBlock}>
          <div className={styles.heroRow}>
            <h3 className={styles.heroLabel}>Дальше</h3>
            {nextStart && (
              <span className={styles.heroWhen}>
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
      ? (minutes - start) / (end - start)
      : undefined;
  return (
    <div className={styles.heroLesson}>
      <p className={styles.heroSubject}>{l.subject ?? "Предмет не указан"}</p>
      <p className={styles.heroMeta}>
        {l.start && (
          <span className={styles.heroTime}>
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
            aria-valuenow={Math.round(progress * 100)}
          >
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <span className={styles.heroWhen}>ещё {formatMinutes(end - minutes)}</span>
        </div>
      )}
    </div>
  );
}

function Day({
  day,
  today,
  coverage,
  kind,
}: {
  day: DayView;
  /** Minutes since midnight, if this day is today. */
  today: number | undefined;
  coverage: CoverageState;
  kind: Kind;
}) {
  const now = today !== undefined ? findNow(day.lessons, today) : undefined;
  const stateOf = (l: LessonView): LessonState | undefined => {
    if (!now || today === undefined) return undefined;
    if (now.current.includes(l)) return "now";
    if (now.next.includes(l)) return "next";
    if (l.end && toMinutes(l.end) <= today) return "past";
    return undefined;
  };
  return (
    <section id={dayId(day.date)} className={styles.day} aria-label={formatDay(day.date)}>
      <div className={styles.dayHead}>
        <h3 className={styles.dayHeading}>
          {capitalize(formatDay(day.date))}
          {today !== undefined && (
            <>
              {" "}
              <span className={styles.badge}>сегодня</span>
            </>
          )}
        </h3>
        {day.lessons.length > 0 && (
          <span className={styles.dayCount}>{countLessons(day.lessons.length)}</span>
        )}
      </div>
      {day.lessons.length === 0 ? (
        <p className={styles.empty}>
          {coverage === "covered" ? "Пар нет" : "В опубликованных корпусах пар нет"}
        </p>
      ) : (
        <ol className={styles.lessons}>
          {day.lessons.map((l) => (
            <li key={l.key}>
              <Lesson lesson={l} kind={kind} state={stateOf(l)} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

type LessonState = "now" | "next" | "past";

function Lesson({
  lesson: l,
  kind,
  state,
}: {
  lesson: LessonView;
  kind: Kind;
  state: LessonState | undefined;
}) {
  const people = kind === "teacher" ? l.groups : l.teachers;
  const others = kind === "teacher" ? l.teachers : [];
  return (
    <article className={styles.lesson} data-state={state}>
      <div className={styles.time}>
        {l.start ? <span className={styles.start}>{l.start}</span> : null}
        {l.end && <span className={styles.end}>{l.end}</span>}
        {l.period !== undefined && <span className={styles.period}>{l.period} пара</span>}
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
        {state === "now" && <span className={styles.live}>идёт</span>}
        {state === "next" && <span className={styles.soon}>следующая</span>}
        <p className={styles.subject}>
          {l.subject ?? <span className={styles.muted}>Предмет не указан</span>}
        </p>
        {(l.lessonType || l.subgroup) && (
          <p className={styles.tags}>
            {l.lessonType && <span className={styles.tag}>{l.lessonType}</span>}
            {l.subgroup && <span className={styles.tag}>подгруппа {l.subgroup}</span>}
          </p>
        )}
        <ul className={styles.meta}>
          {(l.rooms.length > 0 || l.building) && (
            <li>
              <Icon name="place" className={styles.metaIcon} />
              <span>{[l.rooms.join(", "), l.building].filter(Boolean).join(" · ")}</span>
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

/** "1 пара", "3 пары", "5 пар". */
function countLessons(n: number): string {
  const d = n % 10;
  const dd = n % 100;
  if (n === 0) return "пар нет";
  if (d === 1 && dd !== 11) return `${n} пара`;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return `${n} пары`;
  return `${n} пар`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
