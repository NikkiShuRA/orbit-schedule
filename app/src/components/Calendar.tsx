// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// The schedule as a calendar: a day as a timeline, a week as a grid of
// periods on a wide screen and as a list on a phone. The design notes
// with the reasons are in docs/app-design.md.

import {
  type CSSProperties,
  type KeyboardEvent,
  lazy,
  type ReactNode,
  Suspense,
  type TouchEvent,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { Catalog, ScheduleDocument, Status } from "../api";
import { type Loaded, useJSON, useMedia } from "../hooks";
import { ago, isStale } from "../lib/age";
import {
  countLessons,
  daySpan,
  type LessonState,
  loadView,
  periodRange,
  type Slot,
  saveView,
  slots,
  startDay,
  stepDay,
  type TimelineItem,
  timeline,
  type View,
  weekName,
} from "../lib/calendar";
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
} from "../lib/dates";
import type { Entry, StartView } from "../lib/profile";
import { buildWeek, type CoverageState, type DayView, type WeekView } from "../lib/schedule";
import type { Selection } from "../lib/selection";
import styles from "./Calendar.module.css";
import { Icon } from "./Icon";
import { Bells, SlotCard } from "./Lesson";
import { failedText } from "./messages";
import { Today } from "./Today";
import { Notice, Skeleton } from "./ui";

type Kind = Selection["kind"];

const WIDE = "(min-width: 1024px)";

// Lesson details are loaded on the first tap (ADR 0010 budget).
const Details = lazy(() => import("./Details"));

/** Opens the details of a slot of a day. */
type OpenSlot = (slot: Slot, date: string, state: LessonState | undefined) => void;

interface Opened {
  slot: Slot;
  date: string;
  state: LessonState | undefined;
}

export function Calendar({
  sel,
  catalog,
  status,
  catalogFromCache,
  now,
  head,
  topSlot,
  place,
  startView,
  subgroup,
  onSubgroup,
  onOpen,
}: {
  sel: Selection;
  catalog: Catalog;
  status: Loaded<Status>;
  catalogFromCache: boolean;
  now: Date;
  /** The name of the schedule with its buttons. */
  head: ReactNode;
  /** On a wide screen the name and the controls go to the app's top bar. */
  topSlot: HTMLElement | null;
  /** The institution's short name. */
  place: string;
  startView: StartView;
  /** My subgroup in this schedule; undefined shows all. */
  subgroup: number | undefined;
  onSubgroup: (n: number | undefined) => void;
  onOpen: (e: Entry) => void;
}) {
  const tz = catalog.institution.timeZone;
  const today = todayIn(tz, now);
  const minutes = minutesIn(tz, now);
  const wide = useMedia(WIDE);

  const [date, setDate] = useState(() => startDay(today));
  const [view, setViewState] = useState<View>(() =>
    startView === "last" ? (loadView() ?? (wide ? "week" : "day")) : startView,
  );
  const [opened, setOpened] = useState<Opened>();
  const open: OpenSlot = (slot, date, state) => setOpened({ slot, date, state });
  const setView = (v: View) => {
    setViewState(v);
    saveView(v);
  };

  const monday = mondayOf(date);
  const entry = catalog.weeks.find((w) => w.start === monday);
  const folder = sel.kind === "group" ? "groups" : "teachers";
  const week = useJSON<ScheduleDocument>(
    entry ? `${sel.source}/${folder}/${encodeURIComponent(sel.id)}/${entry.file}` : null,
  );
  const full = week.kind === "ready" ? buildWeek(week.data, sel, catalog) : undefined;
  // A group's subgroups this week. With "my subgroup" chosen, the lessons
  // of the others are hidden, and the screen says how many.
  const subgroups =
    sel.kind === "group" && full
      ? [...new Set(full.days.flatMap((d) => d.lessons.flatMap((l) => l.subgroup ?? [])))].sort(
          (a, b) => a - b,
        )
      : [];
  const mySubgroup = subgroup !== undefined && subgroups.includes(subgroup) ? subgroup : undefined;
  const weekView: WeekView | undefined =
    full && mySubgroup !== undefined
      ? {
          ...full,
          days: full.days.map((d) => ({
            ...d,
            lessons: d.lessons.filter((l) => l.subgroup === undefined || l.subgroup === mySubgroup),
          })),
        }
      : full;
  const hidden =
    full && weekView
      ? full.days.reduce((n, d) => n + d.lessons.length, 0) -
        weekView.days.reduce((n, d) => n + d.lessons.length, 0)
      : 0;
  const fromCache =
    catalogFromCache ||
    (status.kind === "ready" && status.fromCache) ||
    (week.kind === "ready" && week.fromCache);
  const covered = weekView && weekView.coverage !== "outside";
  const todayView = covered ? weekView.days.find((d) => d.date === today) : undefined;

  const step = (delta: 1 | -1) =>
    setDate(view === "day" ? stepDay(date, delta, weekView?.days ?? []) : addDays(date, 7 * delta));
  const home = startDay(today);
  const atHome = view === "day" ? date === home : mondayOf(date) === mondayOf(home);
  const unit = view === "day" ? "день" : "неделя";

  // The days of the shown week, for the day tabs, even before it loads.
  const days: DayView[] =
    weekView?.days ??
    Array.from({ length: 6 }, (_, i) => ({ date: addDays(monday, i), lessons: [] }));

  // On a phone the controls sit at the bottom, under the thumb:
  // switching days and weeks is what people do most.
  const toolbar = (
    <div className={styles.toolbar}>
      <button
        type="button"
        className={styles.todayButton}
        onClick={() => setDate(home)}
        disabled={atHome}
      >
        Сегодня
      </button>
      <div className={styles.nav}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={view === "day" ? "Предыдущий день" : "Предыдущая неделя"}
          onClick={() => step(-1)}
        >
          <Icon name="chevronLeft" />
        </button>
        <div className={styles.navLabel} aria-live="polite">
          <span className={styles.navMain}>
            {view === "day"
              ? `${capitalize(formatWeekday(date))}, ${formatShortDate(date)}`
              : formatRange(monday, addDays(monday, 6))}
          </span>
          <span className={atHome ? styles.navSub : `${styles.navSub} ${styles.awaySub}`}>
            {weekName(monday, today) ?? " "}
          </span>
          {!atHome && (
            // On a phone there is no room for a "today" button: the way
            // back shows up right here, only when it is needed.
            <button type="button" className={styles.back} onClick={() => setDate(home)}>
              Вернуться к сегодня
            </button>
          )}
        </div>
        <button
          type="button"
          className={styles.iconButton}
          aria-label={view === "day" ? "Следующий день" : "Следующая неделя"}
          onClick={() => step(1)}
        >
          <Icon name="chevron" />
        </button>
      </div>
      <fieldset className={styles.views}>
        <legend className={styles.hidden}>Вид: {unit}</legend>
        <button type="button" aria-pressed={view === "day"} onClick={() => setView("day")}>
          <Icon name="day" />
          <span className={styles.viewLabel}>День</span>
        </button>
        <button type="button" aria-pressed={view === "week"} onClick={() => setView("week")}>
          <Icon name="week" />
          <span className={styles.viewLabel}>Неделя</span>
        </button>
      </fieldset>
    </div>
  );
  const tabs = view === "day" && (
    <DayTabs
      days={days}
      selected={date}
      today={today}
      onSelect={setDate}
      docked={!wide}
      panelId="day-panel"
    />
  );

  const subgroupPick = subgroups.length > 0 && (
    <SubgroupPick all={subgroups} mine={mySubgroup} onChange={onSubgroup} />
  );

  return (
    <div className={wide ? styles.fill : tabs ? styles.withDockTall : styles.withDock}>
      {wide && topSlot
        ? createPortal(
            <div className={styles.top}>
              <div className={styles.topHead}>{head}</div>
              {subgroupPick}
              {toolbar}
            </div>,
            topSlot,
          )
        : head}
      {wide ? (
        <div className={styles.statusBar}>
          <Freshness status={status} fromCache={fromCache} now={now} bar />
          {weekView && (
            <span className={styles.statusChanged}>
              Изменено в источнике {formatMoment(weekView.changedAt, tz)}
            </span>
          )}
        </div>
      ) : (
        <Freshness status={status} fromCache={fromCache} now={now} />
      )}

      <div className={wide ? styles.scroll : styles.flow}>
        {todayView && <Today day={todayView} minutes={minutes} kind={sel.kind} />}

        <div className={wide ? styles.panelFlat : styles.panel}>
          {!wide && subgroupPick}
          {mySubgroup !== undefined && hidden > 0 && (
            <p className={styles.subNote}>
              Показана только {mySubgroup}-я подгруппа: скрыто пар другой — {hidden}.{" "}
              <button type="button" className={styles.subAll} onClick={() => onSubgroup(undefined)}>
                Показать все
              </button>
            </p>
          )}
          {wide && tabs}
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
            weekView && (
              <>
                <CoverageNotice coverage={weekView.coverage} kind={sel.kind} />
                {covered &&
                  (view === "day" ? (
                    <DayPanel
                      id="day-panel"
                      day={weekView.days.find((d) => d.date === date) ?? { date, lessons: [] }}
                      minutes={date === today ? minutes : undefined}
                      coverage={weekView.coverage}
                      kind={sel.kind}
                      onSwipe={step}
                      onOpen={open}
                    />
                  ) : wide ? (
                    <WeekGrid
                      view={weekView}
                      today={today}
                      minutes={minutes}
                      kind={sel.kind}
                      onOpen={open}
                      onOpenDay={(d) => {
                        setDate(d);
                        setView("day");
                      }}
                    />
                  ) : (
                    <Agenda
                      view={weekView}
                      today={today}
                      minutes={minutes}
                      kind={sel.kind}
                      onOpen={open}
                    />
                  ))}
                {!wide && (
                  <p className={styles.changed}>
                    Изменено в источнике {formatMoment(weekView.changedAt, tz)}
                  </p>
                )}
              </>
            )
          )}
        </div>
      </div>

      {opened && weekView && (
        <Suspense fallback={null}>
          <Details
            slot={opened.slot}
            date={opened.date}
            state={opened.state}
            sel={sel}
            place={place}
            changed={`Изменено в источнике ${formatMoment(weekView.changedAt, tz)}`}
            onOpen={(e) => {
              setOpened(undefined);
              onOpen(e);
            }}
            onClose={() => setOpened(undefined)}
          />
        </Suspense>
      )}

      {!wide && (
        <div className={styles.dock}>
          {tabs}
          {toolbar}
        </div>
      )}
    </div>
  );
}

/**
 * "My subgroup" as one small choice. The lessons of the other subgroup
 * are hidden, never silently: the panel says how many, with a way back.
 */
function SubgroupPick({
  all,
  mine,
  onChange,
}: {
  all: number[];
  mine: number | undefined;
  onChange: (n: number | undefined) => void;
}) {
  return (
    <label className={mine === undefined ? styles.subPick : `${styles.subPick} ${styles.subOn}`}>
      <span className={styles.subLabel}>Подгруппа</span>
      <select
        className={styles.subSelect}
        value={mine ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
      >
        <option value="">все</option>
        {all.map((n) => (
          <option key={n} value={n}>
            {n}-я
          </option>
        ))}
      </select>
      <Icon name="chevron" className={styles.subChevron} />
    </label>
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

/**
 * The days of the week as tabs. On a phone they sit at the bottom, under
 * the thumb: switching days is the most frequent action. Dots show how
 * many lessons a day has, so a long day is seen before it is opened.
 */
function DayTabs({
  days,
  selected,
  today,
  onSelect,
  docked,
  panelId,
}: {
  days: DayView[];
  selected: string;
  today: string;
  onSelect: (date: string) => void;
  docked: boolean;
  panelId: string;
}) {
  const list = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    const i = days.findIndex((d) => d.date === selected);
    const to =
      e.key === "ArrowRight"
        ? i + 1
        : e.key === "ArrowLeft"
          ? i - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? days.length - 1
              : undefined;
    const target = to === undefined ? undefined : days[Math.max(0, Math.min(days.length - 1, to))];
    if (!target) return;
    e.preventDefault();
    onSelect(target.date);
    requestAnimationFrame(() =>
      list.current?.querySelector<HTMLElement>(`[data-date="${target.date}"]`)?.focus(),
    );
  };
  return (
    <div className={docked ? styles.dockTabs : styles.tabsWrap}>
      <div
        ref={list}
        role="tablist"
        aria-label="Дни недели"
        className={styles.tabs}
        onKeyDown={onKey}
      >
        {days.map((d) => {
          const isSelected = d.date === selected;
          return (
            <button
              key={d.date}
              type="button"
              role="tab"
              data-date={d.date}
              aria-selected={isSelected}
              aria-controls={panelId}
              tabIndex={isSelected ? 0 : -1}
              aria-label={`${formatDay(d.date)}: ${countLessons(d.lessons.length)}`}
              className={`${styles.tab} ${d.date === today ? styles.tabToday : ""}`}
              onClick={() => onSelect(d.date)}
            >
              <span className={styles.tabDay}>{formatWeekday(d.date)}</span>
              <span className={styles.tabDate}>{dayOfMonth(d.date)}</span>
              <span className={styles.dots} aria-hidden="true">
                {Array.from({ length: Math.min(d.lessons.length, 6) }, (_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: identical dots.
                  <span key={i} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** One day as a timeline: times on the left, free windows, "now". */
function DayPanel({
  id,
  day,
  minutes,
  coverage,
  kind,
  onSwipe,
  onOpen,
}: {
  id: string;
  day: DayView;
  /** Minutes since midnight when the day is today. */
  minutes: number | undefined;
  coverage: CoverageState;
  kind: Kind;
  onSwipe: (delta: 1 | -1) => void;
  onOpen: OpenSlot;
}) {
  const touch = useRef<{ x: number; y: number } | undefined>(undefined);
  const onTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    touch.current = t ? { x: t.clientX, y: t.clientY } : undefined;
  };
  const onTouchEnd = (e: TouchEvent) => {
    const t = e.changedTouches[0];
    const from = touch.current;
    touch.current = undefined;
    if (!t || !from) return;
    const dx = t.clientX - from.x;
    const dy = t.clientY - from.y;
    // A clear sideways move, not a scroll that drifted.
    if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) onSwipe(dx < 0 ? 1 : -1);
  };

  const [weekday, date] = formatDay(day.date).split(", ");
  const span = daySpan(day.lessons);
  return (
    <section
      id={id}
      role="tabpanel"
      aria-label={capitalize(formatDay(day.date))}
      className={styles.dayPanel}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <header className={styles.dayHead}>
        <div>
          <h3 className={styles.dayTitle}>{capitalize(weekday ?? "")}</h3>
          <p className={styles.dayDate}>
            {date}
            {minutes !== undefined && <span className={styles.badge}>сегодня</span>}
          </p>
        </div>
        {day.lessons.length > 0 && (
          <p className={styles.summary}>
            <Icon name="clock" />
            {countLessons(day.lessons.length)}
            {span && ` · ${span}`}
          </p>
        )}
      </header>

      {day.lessons.length === 0 ? (
        <Empty coverage={coverage} />
      ) : (
        <ol className={styles.timeline}>
          {timeline(day.lessons, minutes).map((item) =>
            item.kind === "gap" ? (
              <li key={item.key} className={styles.gap}>
                <span className={styles.gapText}>Окно · {formatMinutes(item.minutes)}</span>
              </li>
            ) : item.kind === "now" ? (
              <li key={item.key} className={styles.now}>
                <span className={styles.nowTime}>{clock(minutes ?? 0)}</span>
                <span className={styles.nowLine} />
                <span className={styles.hidden}>Сейчас перерыв</span>
              </li>
            ) : (
              <li key={item.slot.key} className={styles.item} data-state={item.state}>
                <SlotTime slot={item.slot} />
                <span className={styles.node} aria-hidden="true" />
                <div className={styles.itemBody}>
                  <SlotCard
                    slot={item.slot}
                    kind={kind}
                    state={item.state}
                    onOpen={() => onOpen(item.slot, day.date, item.state)}
                  />
                </div>
              </li>
            ),
          )}
        </ol>
      )}
    </section>
  );
}

function Empty({ coverage }: { coverage: CoverageState }) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon} aria-hidden="true">
        <Icon name="cup" />
      </span>
      <p>{coverage === "covered" ? "Пар нет" : "В опубликованных корпусах пар нет"}</p>
    </div>
  );
}

/** A week on a phone: the days one under another. */
function Agenda({
  view,
  today,
  minutes,
  kind,
  onOpen,
}: {
  view: WeekView;
  today: string;
  minutes: number;
  kind: Kind;
  onOpen: OpenSlot;
}) {
  return (
    <>
      {view.days.map((day) => {
        const isToday = day.date === today;
        const stateOf = stateIn(isToday ? timeline(day.lessons, minutes) : undefined);
        return (
          <section key={day.date} className={styles.agendaDay} aria-label={formatDay(day.date)}>
            <div className={styles.agendaHead}>
              <h3 className={styles.agendaTitle}>
                {capitalize(formatDay(day.date))}
                {isToday && (
                  <>
                    {" "}
                    <span className={styles.badge}>сегодня</span>
                  </>
                )}
              </h3>
              {day.lessons.length > 0 && (
                <span className={styles.agendaCount}>{countLessons(day.lessons.length)}</span>
              )}
            </div>
            {day.lessons.length === 0 ? (
              <p className={styles.agendaEmpty}>
                {view.coverage === "covered" ? "Пар нет" : "В опубликованных корпусах пар нет"}
              </p>
            ) : (
              <ol className={styles.agendaList}>
                {slots(day.lessons).map((slot) => (
                  <li key={slot.key}>
                    <SlotCard
                      slot={slot}
                      kind={kind}
                      state={stateOf(slot.key)}
                      time
                      onOpen={() => onOpen(slot, day.date, stateOf(slot.key))}
                    />
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}
    </>
  );
}

/**
 * A week on a wide screen: days as columns, periods as rows. Rows are
 * periods, not hours: the same period starts at different times on
 * different days and buildings, and some sources publish no end times,
 * so an hour grid would have to invent the length of a lesson.
 */
function WeekGrid({
  view,
  today,
  minutes,
  kind,
  onOpen,
  onOpenDay,
}: {
  view: WeekView;
  today: string;
  minutes: number;
  kind: Kind;
  onOpen: OpenSlot;
  onOpenDay: (date: string) => void;
}) {
  const range = periodRange(view.days);
  const periods = range
    ? Array.from({ length: range.last - range.first + 1 }, (_, i) => range.first + i)
    : [];
  const rows = Math.max(periods.length, 1);
  const rowOf = (p: number) => p - (range?.first ?? 0) + 2;
  const bells = view.days.some((d) => d.lessons.some((l) => l.timeFromBells));

  return (
    <>
      <div
        className={styles.grid}
        style={{ "--days": view.days.length, "--rows": rows } as CSSProperties}
      >
        {view.days.map((day, i) => {
          const col = i + 1;
          const isToday = day.date === today;
          const stateOf = stateIn(isToday ? timeline(day.lessons, minutes) : undefined);
          return (
            <section
              key={day.date}
              className={isToday ? `${styles.gridDay} ${styles.gridDayToday}` : styles.gridDay}
              style={{ gridColumn: col, gridRow: `1 / span ${rows + 1}` }}
              aria-label={formatDay(day.date)}
            >
              <h3 className={styles.gridHead}>
                <button
                  type="button"
                  className={`${styles.gridHeadButton} ${isToday ? styles.gridHeadToday : ""}`}
                  onClick={() => onOpenDay(day.date)}
                  title="Открыть день"
                >
                  <span className={styles.gridWeekday}>{formatWeekday(day.date)}</span>
                  <span className={styles.gridDate}>{dayOfMonth(day.date)}</span>
                  <span className={styles.gridMonth}>{monthOf(day.date)}</span>
                </button>
              </h3>
              {day.lessons.length === 0 ? (
                <div className={styles.gridEmpty} style={{ gridRow: `2 / span ${rows}` }}>
                  <span className={styles.emptyIcon} aria-hidden="true">
                    <Icon name="cup" />
                  </span>
                  <p>
                    {view.coverage === "covered" ? "Пар нет" : "В опубликованных корпусах пар нет"}
                  </p>
                </div>
              ) : range ? (
                periods.map((p) => {
                  const here = slots(day.lessons.filter((l) => l.period === p));
                  // A free period between lessons (a gap in the day): a quiet dashed
                  // slot, as in «Мой Сиелом». Before the first and after the last
                  // lesson nothing is drawn: that would be noise.
                  if (here.length === 0) {
                    const own = day.lessons.flatMap((l) =>
                      l.period === undefined ? [] : [l.period],
                    );
                    if (p < Math.min(...own) || p > Math.max(...own)) return null;
                    return (
                      <div key={p} className={styles.gridFree} style={{ gridRow: rowOf(p) }}>
                        <span className={styles.gridFreeNo}>{p}</span>
                        нет пары
                      </div>
                    );
                  }
                  return (
                    <div key={p} className={styles.gridCell} style={{ gridRow: rowOf(p) }}>
                      {here.map((slot) => (
                        <SlotCard
                          key={slot.key}
                          slot={slot}
                          kind={kind}
                          state={stateOf(slot.key)}
                          compact
                          onOpen={() => onOpen(slot, day.date, stateOf(slot.key))}
                        />
                      ))}
                    </div>
                  );
                })
              ) : (
                <div className={styles.gridCell} style={{ gridRow: 2 }}>
                  {slots(day.lessons).map((slot) => (
                    <SlotCard
                      key={slot.key}
                      slot={slot}
                      kind={kind}
                      state={stateOf(slot.key)}
                      compact
                      onOpen={() => onOpen(slot, day.date, stateOf(slot.key))}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
      {bells && (
        <p className={styles.legend}>
          <span className={styles.legendSample}>08:30</span> — время не указано у пары и взято из
          сетки звонков
        </p>
      )}
    </>
  );
}

/** The state of a slot by its key, from today's timeline. */
function stateIn(items: TimelineItem[] | undefined) {
  return (key: string): LessonState | undefined => {
    const it = items?.find((x) => x.kind === "slot" && x.slot.key === key);
    return it?.kind === "slot" ? it.state : undefined;
  };
}

/**
 * The time column of the timeline: start, end and the period number,
 * which students use as the name of a lesson ("на третьей").
 */
function SlotTime({ slot }: { slot: Slot }) {
  return (
    <div className={styles.itemTime}>
      {slot.start && <span className={styles.start}>{slot.start}</span>}
      {slot.end && <span className={styles.end}>{slot.end}</span>}
      {slot.period !== undefined && <span className={styles.periodNo}>{slot.period} пара</span>}
      {slot.timeFromBells && <Bells />}
    </div>
  );
}

function Freshness({
  status,
  fromCache,
  now,
  bar = false,
}: {
  status: Loaded<Status>;
  fromCache: boolean;
  now: Date;
  /** A line in the status bar of the main card instead of a block. */
  bar?: boolean;
}) {
  if (status.kind === "loading") return null;
  const checkedAt = status.kind === "ready" ? status.data.checkedAt : undefined;
  const age = checkedAt ? `проверено ${ago(checkedAt, now)}` : "когда проверено — неизвестно";
  if (bar) {
    const warn = fromCache || !checkedAt || isStale(checkedAt, now);
    return (
      <p className={warn ? `${styles.fresh} ${styles.freshWarn}` : styles.fresh} role="status">
        <span className={styles.dot} aria-hidden="true" />
        {fromCache
          ? `Нет связи — сохранённая копия, ${age}. Расписание могло измениться.`
          : warn
            ? `Расписание давно не обновлялось: ${age}. Оно могло измениться.`
            : `Расписание ${age}`}
      </p>
    );
  }
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

function clock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "ноября" of "9 ноября". */
function monthOf(date: string): string {
  return formatShortDate(date).replace(/^\d+\s*/, "");
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
