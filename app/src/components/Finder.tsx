// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// Choosing a schedule, as in «Мой Сиелом»: "Моё" holds my schedule,
// starred and recent ones; "Все расписания" goes step by step (building,
// course, group; or letter, teacher) or finds by typing.

import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";
import type { Catalog, Source } from "../api";
import { useJSON } from "../hooks";
import {
  badgeOf,
  type GroupPath,
  groupLevel,
  letters,
  pathSteps,
  pathTo,
  placeKind,
  placeName,
  teachersBy,
} from "../lib/browse";
import { initials } from "../lib/calendar";
import { type Entry, type Profile, same } from "../lib/profile";
import { type Found, normalize, search } from "../lib/search";
import type { Kind, Selection } from "../lib/selection";
import styles from "./Finder.module.css";
import { Icon } from "./Icon";
import { failedText } from "./messages";
import { Notice, Skeleton } from "./ui";

type Tab = "mine" | "all";

interface Nav {
  source: string;
  kind: Kind;
  path: GroupPath;
  letter: string | undefined;
}

export function Finder({
  sources,
  current,
  profile,
  onPick,
  onStar,
  autoFocus = false,
}: {
  sources: Source[];
  current?: Selection | undefined;
  profile: Profile;
  onPick: (entry: Entry) => void;
  onStar: (entry: Entry) => void;
  autoFocus?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [source, setSource] = useState(
    () => sources.find((s) => s.id === current?.source)?.id ?? sources[0]?.id,
  );
  const [query, setQuery] = useState("");
  const [navState, setNav] = useState<Nav>();
  const catalog = useJSON<Catalog>(source ? `${source}/catalog.json` : null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const cat = catalog.kind === "ready" ? catalog.data : undefined;
  const here = current?.source === source ? current : undefined;
  // Opens where the current schedule is, until the person moves.
  const nav: Nav =
    navState && navState.source === source
      ? navState
      : {
          source: source ?? "",
          kind: here?.kind ?? "group",
          path: cat ? pathTo(cat, here) : {},
          letter:
            cat && here?.kind === "teacher"
              ? cat.teachers
                  ?.find((t) => t.id === here.id)
                  ?.name.charAt(0)
                  .toUpperCase()
              : undefined,
        };
  const go = (next: Partial<Nav>) => setNav({ ...nav, ...next });

  const place = (id: string) => {
    const s = sources.find((x) => x.id === id);
    return s?.shortName ?? s?.name ?? id;
  };
  const toEntry = (f: Found): Entry => ({
    source: source ?? "",
    kind: f.kind,
    id: f.id,
    name: f.kind === "group" ? `Группа ${f.title}` : f.title,
    place: place(source ?? ""),
  });
  const row = (f: Found, q?: string) => {
    const e = toEntry(f);
    return (
      <Row
        key={`${f.kind}-${f.id}`}
        entry={e}
        details={f.details}
        {...(q ? { query: q } : {})}
        current={same(current, e)}
        starred={profile.starred.some((s) => same(s, e))}
        onPick={onPick}
        onStar={onStar}
      />
    );
  };

  // Arrows move between the results, as in any list; Enter opens one.
  const focusAt = (from: Element | null, delta: 1 | -1) => {
    const items = [...(list.current?.querySelectorAll<HTMLElement>("[data-pick]") ?? [])];
    const i = from ? items.indexOf(from as HTMLElement) : -1;
    const next = items[i + delta];
    if (next) next.focus();
    else if (delta === -1) input.current?.focus();
  };
  const onListKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      focusAt(document.activeElement, e.key === "ArrowDown" ? 1 : -1);
    }
  };

  const q = query.trim();
  const found = cat && q ? search(cat, q) : [];

  return (
    <div className={styles.finder}>
      <div className={styles.controls}>
        <fieldset className={styles.tabs}>
          <legend className={styles.hidden}>Какие расписания показать</legend>
          <button type="button" aria-pressed={tab === "mine"} onClick={() => setTab("mine")}>
            Моё
          </button>
          <button type="button" aria-pressed={tab === "all"} onClick={() => setTab("all")}>
            Все расписания
          </button>
        </fieldset>

        {tab === "all" && (
          <>
            {sources.length > 1 && (
              <fieldset className={styles.sources}>
                <legend className={styles.hidden}>Учебное заведение</legend>
                {sources.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={source === s.id}
                    title={s.name}
                    className={styles.sourceChip}
                    onClick={() => setSource(s.id)}
                  >
                    <Icon name="building" />
                    {s.shortName ?? s.name}
                  </button>
                ))}
              </fieldset>
            )}
            <div className={styles.field}>
              <Icon name="search" className={styles.fieldIcon} />
              <input
                ref={input}
                className={styles.input}
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                // biome-ignore lint/a11y/noAutofocus: only inside a panel opened to search.
                autoFocus={autoFocus}
                aria-label="Группа или преподаватель"
                placeholder="Группа или преподаватель"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    focusAt(null, 1);
                  } else if (e.key === "Enter" && found[0]) {
                    onPick(toEntry(found[0]));
                  }
                }}
              />
            </div>
            {!q && (
              <fieldset className={styles.kinds}>
                <legend className={styles.hidden}>Что выбрать</legend>
                <button
                  type="button"
                  aria-pressed={nav.kind === "group"}
                  onClick={() => go({ kind: "group" })}
                >
                  Группы
                </button>
                <button
                  type="button"
                  aria-pressed={nav.kind === "teacher"}
                  onClick={() => go({ kind: "teacher" })}
                >
                  Преподаватели
                </button>
              </fieldset>
            )}
          </>
        )}
      </div>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: arrow keys move between the buttons inside. */}
      <div ref={list} className={styles.list} onKeyDown={onListKey}>
        {tab === "mine" ? (
          <Saved
            profile={profile}
            current={current}
            onPick={onPick}
            onStar={onStar}
            onAll={() => setTab("all")}
          />
        ) : catalog.kind === "loading" && source ? (
          <Skeleton label="Загружаем список групп и преподавателей…" rows={3} />
        ) : catalog.kind === "missing" || catalog.kind === "failed" ? (
          <Notice tone="warn" role="alert">
            {failedText(
              catalog.kind === "failed" ? catalog.reason : "server",
              "список групп и преподавателей",
            )}
          </Notice>
        ) : !cat ? null : q ? (
          found.length === 0 ? (
            <p className={styles.hint} aria-live="polite">
              Ничего не нашлось. Проверьте, как написано, или сотрите запрос и выберите из списка.
            </p>
          ) : (
            <Section title={`Найдено: ${found.length}`}>{found.map((f) => row(f, q))}</Section>
          )
        ) : nav.kind === "group" ? (
          <Groups catalog={cat} path={nav.path} onPath={(path) => go({ path })} row={row} />
        ) : (
          <Teachers
            catalog={cat}
            letter={nav.letter}
            onLetter={(letter) => go({ letter })}
            row={row}
          />
        )}
      </div>
    </div>
  );
}

function Groups({
  catalog,
  path,
  onPath,
  row,
}: {
  catalog: Catalog;
  path: GroupPath;
  onPath: (p: GroupPath) => void;
  row: (f: Found) => ReactNode;
}) {
  const level = groupLevel(catalog, path);
  const steps = pathSteps(catalog, path);
  const root =
    steps[0] === "place"
      ? placeKind(catalog) === "department"
        ? "Отделения"
        : "Корпуса"
      : "Курсы";
  const placeOnly: GroupPath = path.place !== undefined ? { place: path.place } : {};
  const crumbs: { label: string; to: GroupPath }[] = [];
  if (path.place !== undefined) {
    crumbs.push({ label: placeName(catalog, path.place), to: placeOnly });
  }
  if (path.course !== undefined) {
    crumbs.push({ label: path.course === null ? "Без курса" : `${path.course} курс`, to: path });
  }
  const up = crumbs.length > 1 ? (crumbs[crumbs.length - 2]?.to ?? {}) : {};

  return (
    <>
      {crumbs.length > 0 && (
        <nav className={styles.crumbs} aria-label="Где вы в списке">
          <button
            type="button"
            className={styles.back}
            aria-label="Назад"
            onClick={() => onPath(up)}
          >
            <Icon name="chevronLeft" />
          </button>
          <button type="button" className={styles.crumb} onClick={() => onPath({})}>
            {root}
          </button>
          {crumbs.map((c, i) => (
            <span key={c.label} className={styles.crumbPart}>
              <span aria-hidden="true">/</span>
              {i === crumbs.length - 1 ? (
                <span className={styles.crumbHere} aria-current="location">
                  {c.label}
                </span>
              ) : (
                <button type="button" className={styles.crumb} onClick={() => onPath(c.to)}>
                  {c.label}
                </button>
              )}
            </span>
          ))}
        </nav>
      )}
      <ul className={styles.rows}>
        {level.kind === "places"
          ? level.places.map((p) => (
              <Step
                key={p.id || "none"}
                name={p.name}
                count={p.count}
                onOpen={() => onPath({ place: p.id })}
              />
            ))
          : level.kind === "courses"
            ? level.courses.map((c) => (
                <Step
                  key={c.course ?? "none"}
                  name={c.course === null ? "Без курса" : `${c.course} курс`}
                  count={c.count}
                  onOpen={() => onPath({ ...placeOnly, course: c.course })}
                />
              ))
            : level.groups.map((g) => row({ kind: "group", id: g.id, title: g.name }))}
      </ul>
    </>
  );
}

function Teachers({
  catalog,
  letter,
  onLetter,
  row,
}: {
  catalog: Catalog;
  letter: string | undefined;
  onLetter: (l: string | undefined) => void;
  row: (f: Found) => ReactNode;
}) {
  if (!letter) {
    return (
      <ul className={styles.letters} aria-label="Первая буква фамилии">
        {letters(catalog).map((l) => (
          <li key={l.letter}>
            <button
              type="button"
              data-pick=""
              className={styles.letter}
              aria-label={`${l.letter}: ${l.count}`}
              onClick={() => onLetter(l.letter)}
            >
              {l.letter}
              <span className={styles.letterCount} aria-hidden="true">
                {l.count}
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <>
      <nav className={styles.crumbs} aria-label="Где вы в списке">
        <button
          type="button"
          className={styles.back}
          aria-label="Назад"
          onClick={() => onLetter(undefined)}
        >
          <Icon name="chevronLeft" />
        </button>
        <button type="button" className={styles.crumb} onClick={() => onLetter(undefined)}>
          Преподаватели
        </button>
        <span className={styles.crumbPart}>
          <span aria-hidden="true">/</span>
          <span className={styles.crumbHere} aria-current="location">
            {letter}
          </span>
        </span>
      </nav>
      <ul className={styles.rows}>
        {teachersBy(catalog, letter).map((t) => row({ kind: "teacher", id: t.id, title: t.name }))}
      </ul>
    </>
  );
}

/** A step down the list: a building, a department or a course. */
function Step({ name, count, onOpen }: { name: string; count: number; onOpen: () => void }) {
  const { badge, rest } = badgeOf(name);
  return (
    <li className={styles.rowItem}>
      <button
        type="button"
        data-pick=""
        className={`${styles.row} ${styles.step}`}
        onClick={onOpen}
      >
        <span className={styles.badge}>{badge ?? <Icon name="building" />}</span>
        <span className={styles.text}>
          <span className={styles.title}>{rest}</span>
        </span>
        <span className={styles.count}>{count}</span>
        <Icon name="chevron" className={styles.chevron} />
      </button>
    </li>
  );
}

/** Mine, starred and recent: across all institutions, no typing. */
function Saved({
  profile,
  current,
  onPick,
  onStar,
  onAll,
}: {
  profile: Profile;
  current: Selection | undefined;
  onPick: (entry: Entry) => void;
  onStar: (entry: Entry) => void;
  onAll: () => void;
}) {
  const mine = profile.mine ? [profile.mine] : [];
  const starred = profile.starred.filter((e) => !same(e, profile.mine));
  const recent = profile.recent.filter(
    (e) => !same(e, profile.mine) && !profile.starred.some((s) => same(s, e)),
  );
  const row = (e: Entry) => (
    <Row
      key={`${e.source}-${e.kind}-${e.id}`}
      entry={e}
      details={e.place}
      current={same(current, e)}
      starred={profile.starred.some((s) => same(s, e))}
      onPick={onPick}
      onStar={onStar}
    />
  );
  if (mine.length + starred.length + recent.length === 0) {
    return (
      <div className={styles.empty}>
        <p>Здесь будут ваше расписание, избранное и недавние.</p>
        <button type="button" className={styles.emptyButton} onClick={onAll}>
          Найти расписание
        </button>
      </div>
    );
  }
  return (
    <>
      {mine.length > 0 && <Section title="Моё расписание">{mine.map(row)}</Section>}
      {starred.length > 0 && <Section title="Избранное">{starred.map(row)}</Section>}
      {recent.length > 0 && <Section title="Недавние">{recent.map(row)}</Section>}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <ul className={styles.rows}>{children}</ul>
    </section>
  );
}

function Row({
  entry,
  details,
  query,
  current,
  starred,
  onPick,
  onStar,
}: {
  entry: Entry;
  details?: string | undefined;
  query?: string;
  current: boolean;
  starred: boolean;
  onPick: (entry: Entry) => void;
  onStar: (entry: Entry) => void;
}) {
  const title = entry.kind === "group" ? entry.name.replace(/^Группа /, "") : entry.name;
  const split = entry.kind === "group" ? badgeOf(title) : undefined;
  const shown = split?.badge ? split.rest : title;
  return (
    <li className={styles.rowItem}>
      <button
        type="button"
        data-pick=""
        className={styles.row}
        aria-current={current ? "page" : undefined}
        onClick={() => onPick(entry)}
      >
        {split?.badge ? (
          <span className={styles.badge}>{split.badge}</span>
        ) : (
          <span className={styles.badge} aria-hidden="true">
            {entry.kind === "group" ? (
              <Icon name="people" />
            ) : (
              <span className={styles.initials}>{initials(entry.name)}</span>
            )}
          </span>
        )}
        <span className={styles.text}>
          <span className={styles.title}>
            {query ? <Marked text={shown} query={query} /> : shown}
          </span>
          {details && <span className={styles.details}>{details}</span>}
        </span>
      </button>
      <button
        type="button"
        className={styles.star}
        aria-pressed={starred}
        aria-label={`${entry.name}: в избранное`}
        title={starred ? "Убрать из избранного" : "В избранное"}
        onClick={() => onStar(entry)}
      >
        <Icon name="star" filled={starred} />
      </button>
    </li>
  );
}

/** The part of a name that matched the query, highlighted. */
function Marked({ text, query }: { text: string; query: string }) {
  const at = normalize(text).indexOf(normalize(query));
  if (at < 0) return <>{text}</>;
  const end = at + normalize(query).length;
  return (
    <>
      {text.slice(0, at)}
      <mark className={styles.mark}>{text.slice(at, end)}</mark>
      {text.slice(end)}
    </>
  );
}
