// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useState } from "react";
import styles from "./App.module.css";
import { getJSON, type Index } from "./api";
import logo from "./assets/orbit-logo-ru.svg";
import logoDark from "./assets/orbit-logo-ru-dark.svg";

type State = { kind: "loading" } | { kind: "ready"; index: Index } | { kind: "failed" };

export function App() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    const ctrl = new AbortController();
    getJSON<Index>("index.json", ctrl.signal)
      .then((index) => setState({ kind: "ready", index }))
      .catch(() => {
        if (!ctrl.signal.aborted) setState({ kind: "failed" });
      });
    return () => ctrl.abort();
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          <picture>
            <source srcSet={logoDark} media="(prefers-color-scheme: dark)" />
            <img src={logo} alt="Орбита" width="136" height="47" />
          </picture>
        </h1>
        <p className={styles.tagline}>Расписание колледжей и вузов в одном месте</p>
      </header>
      <main className={styles.main}>
        <p>Приложение в разработке. Скоро здесь можно будет выбрать группу или преподавателя.</p>
        <h2 className={styles.heading}>Учебные заведения</h2>
        <Sources state={state} />
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

function Sources({ state }: { state: State }) {
  switch (state.kind) {
    case "loading":
      return <p aria-live="polite">Загружаем…</p>;
    case "failed":
      return (
        <p role="alert">
          Не удалось загрузить список. Нет сети, а сохранённой копии на устройстве ещё нет: откройте
          Orbit один раз с интернетом.
        </p>
      );
    case "ready":
      if (state.index.sources.length === 0) {
        return <p>Пока ни одно расписание не опубликовано.</p>;
      }
      return (
        <ul className={styles.list}>
          {state.index.sources.map((s) => (
            <li key={s.id}>
              {s.name}
              {s.shortName ? ` (${s.shortName})` : ""}
            </li>
          ))}
        </ul>
      );
  }
}
