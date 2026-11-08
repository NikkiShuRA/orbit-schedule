// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useId, useState } from "react";
import type { Catalog, Source } from "../api";
import { type Loaded, useJSON } from "../hooks";
import { search } from "../lib/search";
import type { Selection } from "../lib/selection";
import { failedText } from "./messages";
import styles from "./Picker.module.css";

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
  const sourceLegend = useId();
  const inputId = useId();

  return (
    <section className={styles.picker} aria-labelledby={sourceLegend}>
      <h2 id={sourceLegend} className={styles.heading}>
        Чьё расписание показать?
      </h2>

      {sources.length > 1 && (
        <fieldset className={styles.sources}>
          <legend className={styles.label}>Учебное заведение</legend>
          {sources.map((s) => (
            <label key={s.id} className={styles.source}>
              <input
                type="radio"
                name="source"
                value={s.id}
                checked={source === s.id}
                onChange={() => {
                  setSource(s.id);
                  setQuery("");
                }}
              />
              <span>
                {s.shortName ?? s.name}
                {s.shortName && <span className={styles.muted}> — {s.name}</span>}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {source && (
        <>
          <label htmlFor={inputId} className={styles.label}>
            Группа или преподаватель
          </label>
          <input
            id={inputId}
            className={styles.input}
            type="search"
            inputMode="search"
            autoComplete="off"
            placeholder="Например, 301 или Иванова"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Results
            catalog={catalog}
            query={query}
            onPick={(found) => onPick({ source, kind: found.kind, id: found.id })}
          />
        </>
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
  onPick: (found: { kind: Selection["kind"]; id: string }) => void;
}) {
  switch (catalog.kind) {
    case "loading":
      return <p aria-live="polite">Загружаем список групп и преподавателей…</p>;
    case "missing":
    case "failed":
      return (
        <p role="alert">
          {failedText(
            catalog.kind === "failed" ? catalog.reason : "server",
            "список групп и преподавателей",
          )}
        </p>
      );
    case "ready": {
      if (!query.trim()) {
        return <p className={styles.muted}>Начните вводить название группы или фамилию.</p>;
      }
      const found = search(catalog.data, query);
      if (found.length === 0) {
        return <p aria-live="polite">Ничего не нашлось. Проверьте, как написано название.</p>;
      }
      return (
        <ul className={styles.results} aria-label="Найдено">
          {found.map((f) => (
            <li key={`${f.kind}-${f.id}`}>
              <button type="button" className={styles.result} onClick={() => onPick(f)}>
                <span className={styles.title}>{f.title}</span>
                {f.details && <span className={styles.muted}>{f.details}</span>}
              </button>
            </li>
          ))}
        </ul>
      );
    }
  }
}
