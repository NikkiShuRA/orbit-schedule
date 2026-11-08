// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from "react";
import styles from "./App.module.css";
import type { Index } from "./api";
import logo from "./assets/orbit-logo-ru.svg";
import logoDark from "./assets/orbit-logo-ru-dark.svg";
import { failedText } from "./components/messages";
import { Picker } from "./components/Picker";
import { Schedule } from "./components/Schedule";
import { Notice, Skeleton } from "./components/ui";
import { useJSON } from "./hooks";
import {
  askPersistentStorage,
  fromSearch,
  loadSaved,
  type Selection,
  save,
  toSearch,
} from "./lib/selection";

/** A link opens what it points to; otherwise what was chosen last time. */
function initialSelection(): Selection | undefined {
  return fromSearch(globalThis.location.search) ?? loadSaved()[0];
}

export function App() {
  const [selection, setSelection] = useState(initialSelection);
  const index = useJSON<Index>(selection ? null : "index.json");

  // A schedule opened from the saved choice gets its link in the address
  // too, so it can be shared or bookmarked as is.
  useEffect(() => {
    if (selection && !fromSearch(globalThis.location.search)) {
      globalThis.history.replaceState(null, "", toSearch(selection));
    }
  }, [selection]);

  const choose = (sel: Selection | undefined) => {
    setSelection(sel);
    globalThis.history.replaceState(null, "", toSearch(sel) || globalThis.location.pathname);
    if (sel) {
      save([sel]);
      askPersistentStorage();
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.bar}>
          <h1 className={styles.title}>
            <picture>
              <source srcSet={logoDark} media="(prefers-color-scheme: dark)" />
              <img src={logo} alt="Орбита" width="136" height="47" />
            </picture>
          </h1>
        </div>
      </header>
      <main className={selection ? styles.main : `${styles.main} ${styles.narrow}`}>
        {selection ? (
          <Schedule key={toSearch(selection)} sel={selection} onChange={() => choose(undefined)} />
        ) : index.kind === "loading" ? (
          <Skeleton label="Загружаем…" rows={2} />
        ) : index.kind !== "ready" ? (
          <Notice tone="warn" role="alert">
            {failedText(
              index.kind === "failed" ? index.reason : "server",
              "список учебных заведений",
            )}
          </Notice>
        ) : index.data.sources.length === 0 ? (
          <Notice>Пока ни одно расписание не опубликовано.</Notice>
        ) : (
          <Picker sources={index.data.sources} onPick={choose} />
        )}
      </main>
      <footer className={styles.footer}>
        <p>
          Orbit — независимый некоммерческий проект и не связан ни с одним учебным заведением.
          Расписание — ровно то, что опубликовало учебное заведение.
        </p>
        <p>
          <a href="https://github.com/NikkiShuRA/orbit-schedule">Исходный код</a> ·{" "}
          <a href="https://github.com/NikkiShuRA/orbit-schedule/blob/main/docs/api.md">
            Открытые данные
          </a>
        </p>
      </footer>
    </div>
  );
}
