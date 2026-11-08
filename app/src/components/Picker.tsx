// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useId, useRef, useState } from "react";
import type { Catalog, Source } from "../api";
import { type Loaded, useJSON } from "../hooks";
import { type Found, search } from "../lib/search";
import type { Selection } from "../lib/selection";
import { Icon } from "./Icon";
import { failedText } from "./messages";
import styles from "./Picker.module.css";
import { Notice, Skeleton } from "./ui";

/** Choose an institution, then a group or a teacher by name. */
export function Picker({
  sources,
  onPick,
}: {
  sources: Source[];
  onPick: (sel: Selection) => void;
}) {
  const [source, setSource] = useState(sources.length === 1 ? sources[0]?.id : undefined);
  const [query, setQuery] = useState("");
  const catalog = useJSON<Catalog>(source ? `${source}/catalog.json` : null);
  const headingId = useId();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);

  return (
    <section className={styles.picker} aria-labelledby={headingId}>
      <div className={styles.hero}>
        <h2 id={headingId} className={styles.heading}>
          Чьё расписание показать?
        </h2>
        <p className={styles.lead}>
          Расписание колледжей и вузов в одном месте. Выберите группу или преподавателя: Orbit
          запомнит выбор и в следующий раз откроет его сразу, даже без сети.
        </p>
      </div>

      {sources.length > 1 && (
        <fieldset className={styles.sources}>
          <legend className={styles.label}>Учебное заведение</legend>
          {sources.map((s) => (
            <label key={s.id} className={styles.source}>
              <input
                type="radio"
                name="source"
                className={styles.radio}
                value={s.id}
                checked={source === s.id}
                onChange={() => {
                  setSource(s.id);
                  setQuery("");
                  // The next step is typing: save a tap. Not on first load,
                  // where a keyboard popping up by itself would be rude.
                  requestAnimationFrame(() => input.current?.focus());
                }}
              />
              <span className={styles.mark} aria-hidden="true">
                <Icon name="building" />
              </span>
              <span className={styles.sourceText}>
                <span className={styles.sourceName}>{s.shortName ?? s.name}</span>
                {s.shortName && <span className={styles.muted}>{s.name}</span>}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {source && (
        <div>
          <label htmlFor={inputId} className={styles.label}>
            Группа или преподаватель
          </label>
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
              placeholder="Например, 301 или Иванова"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={(e) => {
                // On a phone the keyboard takes half the screen: lift the
                // field to the top so the results stay visible.
                if (globalThis.matchMedia?.("(max-width: 640px)").matches) {
                  e.currentTarget.scrollIntoView({ block: "start", behavior: "smooth" });
                }
              }}
            />
          </div>
          <Results
            catalog={catalog}
            query={query}
            onPick={(found) => onPick({ source, kind: found.kind, id: found.id })}
          />
        </div>
      )}
    </section>
  );
}

function Results({
  catalog,
  query,
  onPick,
}: {
  catalog: Loaded<Catalog>;
  query: string;
  onPick: (found: Found) => void;
}) {
  switch (catalog.kind) {
    case "loading":
      return <Skeleton label="Загружаем список групп и преподавателей…" rows={3} />;
    case "missing":
    case "failed":
      return (
        <Notice tone="warn" role="alert">
          {failedText(
            catalog.kind === "failed" ? catalog.reason : "server",
            "список групп и преподавателей",
          )}
        </Notice>
      );
    case "ready": {
      if (!query.trim()) {
        const groups = catalog.data.groups?.length ?? 0;
        const teachers = catalog.data.teachers?.length ?? 0;
        return (
          <p className={styles.hint}>
            Начните вводить название группы или фамилию.
            {groups + teachers > 0 && (
              <span className={styles.count}>
                В расписании {groups} {plural(groups, "группа", "группы", "групп")} и {teachers}{" "}
                {plural(teachers, "преподаватель", "преподавателя", "преподавателей")}.
              </span>
            )}
          </p>
        );
      }
      const found = search(catalog.data, query);
      if (found.length === 0) {
        return (
          <p className={styles.hint} aria-live="polite">
            Ничего не нашлось. Проверьте, как написано название.
          </p>
        );
      }
      return (
        <ul className={styles.results} aria-label="Найдено">
          {found.map((f) => (
            <li key={`${f.kind}-${f.id}`}>
              <button type="button" className={styles.result} onClick={() => onPick(f)}>
                <span className={styles.avatar} aria-hidden="true">
                  {f.kind === "group" ? <Icon name="people" /> : initials(f.title)}
                </span>
                <span className={styles.resultText}>
                  <span className={styles.title}>{f.title}</span>
                  {f.details && <span className={styles.muted}>{f.details}</span>}
                </span>
                <Icon name="chevron" className={styles.chevron} />
              </button>
            </li>
          ))}
        </ul>
      );
    }
  }
}

/** "ИИ" for «Иванов Иван Иванович»: two letters are enough for a face. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

/** The Russian plural form for a count: 1 группа, 2 группы, 5 групп. */
function plural(n: number, one: string, few: string, many: string): string {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
}
