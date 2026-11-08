// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// Choosing a schedule: by typing or by browsing. Saved and recent
// schedules are at hand without typing; groups are listed by course,
// teachers by letter, for those who do not remember the exact name.

import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from "react";
import type { Catalog, Source } from "../api";
import { useJSON } from "../hooks";
import { initials } from "../lib/calendar";
import { type Entry, type Profile, same } from "../lib/profile";
import { browse, type Found, normalize, search } from "../lib/search";
import type { Kind, Selection } from "../lib/selection";
import styles from "./Finder.module.css";
import { Icon } from "./Icon";
import { failedText } from "./messages";
import { Notice, Skeleton } from "./ui";

type Filter = "all" | Kind;

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
  const [source, setSource] = useState(
    () => sources.find((s) => s.id === current?.source)?.id ?? sources[0]?.id,
  );
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const catalog = useJSON<Catalog>(source ? `${source}/catalog.json` : null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
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
  const starred = (e: Selection) => profile.starred.some((s) => same(s, e));

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
  const found =
    catalog.kind === "ready" && q
      ? search(catalog.data, q).filter((f) => filter === "all" || f.kind === filter)
      : [];

  return (
    <div className={styles.finder}>
      <div className={styles.controls}>
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
                onClick={() => {
                  setSource(s.id);
                  input.current?.focus();
                }}
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
            id={inputId}
            className={styles.input}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            // biome-ignore lint/a11y/noAutofocus: only inside a sheet opened to search.
            autoFocus={autoFocus}
            aria-label="Группа или преподаватель"
            placeholder="Группа или фамилия"
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

        <fieldset className={styles.filters}>
          <legend className={styles.hidden}>Что искать</legend>
          {(
            [
              ["all", "Все"],
              ["group", "Группы"],
              ["teacher", "Преподаватели"],
            ] as const
          ).map(([f, label]) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              className={styles.filter}
              onClick={() => setFilter(f)}
            >
              {label}
            </button>
          ))}
        </fieldset>
      </div>

      {/* biome-ignore lint/a11y/noStaticElementInteractions: arrow keys move between the buttons inside. */}
      <div ref={list} className={styles.list} onKeyDown={onListKey}>
        {catalog.kind === "loading" && source ? (
          <Skeleton label="Загружаем список групп и преподавателей…" rows={3} />
        ) : catalog.kind === "missing" || catalog.kind === "failed" ? (
          <Notice tone="warn" role="alert">
            {failedText(
              catalog.kind === "failed" ? catalog.reason : "server",
              "список групп и преподавателей",
            )}
          </Notice>
        ) : catalog.kind !== "ready" ? null : q ? (
          found.length === 0 ? (
            <p className={styles.hint} aria-live="polite">
              Ничего не нашлось. Проверьте, как написано, или выберите из списка ниже, стерев
              запрос.
            </p>
          ) : (
            <Section title={`Найдено: ${found.length}`}>
              {found.map((f) => (
                <Row
                  key={`${f.kind}-${f.id}`}
                  entry={toEntry(f)}
                  details={f.details}
                  query={q}
                  current={same(current, toEntry(f))}
                  starred={starred(toEntry(f))}
                  onPick={onPick}
                  onStar={onStar}
                />
              ))}
            </Section>
          )
        ) : (
          <>
            <Saved
              profile={profile}
              filter={filter}
              current={current}
              onPick={onPick}
              onStar={onStar}
            />
            {browse(catalog.data, filter).map((part) => (
              <Section key={part.title} title={part.title} count={part.items.length}>
                {part.items.map((f) => (
                  <Row
                    key={`${f.kind}-${f.id}`}
                    entry={toEntry(f)}
                    details={f.details}
                    current={same(current, toEntry(f))}
                    starred={starred(toEntry(f))}
                    onPick={onPick}
                    onStar={onStar}
                  />
                ))}
              </Section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/** Mine, starred and recent: across all institutions, no typing. */
function Saved({
  profile,
  filter,
  current,
  onPick,
  onStar,
}: {
  profile: Profile;
  filter: Filter;
  current: Selection | undefined;
  onPick: (entry: Entry) => void;
  onStar: (entry: Entry) => void;
}) {
  const fits = (e: Entry) => filter === "all" || e.kind === filter;
  const mine = profile.mine && fits(profile.mine) ? [profile.mine] : [];
  const starred = profile.starred.filter((e) => fits(e) && !same(e, profile.mine));
  const recent = profile.recent.filter(
    (e) => fits(e) && !same(e, profile.mine) && !profile.starred.some((s) => same(s, e)),
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
  return (
    <>
      {mine.length > 0 && <Section title="Моё расписание">{mine.map(row)}</Section>}
      {starred.length > 0 && <Section title="Избранное">{starred.map(row)}</Section>}
      {recent.length > 0 && <Section title="Недавние">{recent.map(row)}</Section>}
    </>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>
        {title}
        {count !== undefined && <span className={styles.count}>{count}</span>}
      </h3>
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
  return (
    <li className={styles.rowItem}>
      <button
        type="button"
        data-pick=""
        className={styles.row}
        aria-current={current ? "page" : undefined}
        onClick={() => onPick(entry)}
      >
        <span className={styles.avatar} aria-hidden="true">
          {entry.kind === "group" ? <Icon name="people" /> : initials(entry.name)}
        </span>
        <span className={styles.text}>
          <span className={styles.title}>
            {query ? <Marked text={title} query={query} /> : title}
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
