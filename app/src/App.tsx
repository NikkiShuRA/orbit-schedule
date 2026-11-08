// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// The frame of the app, after «Мой Сиелом». On a wide screen: a card
// with the logo and a side panel to choose a schedule on the left, the
// schedule on the right; the panel folds away to give the week room.
// On a phone the same panel opens from a menu button. Why it is laid out
// this way: docs/app-design.md.

import { lazy, type ReactNode, Suspense, useEffect, useState } from "react";
import styles from "./App.module.css";
import type { Index } from "./api";
import logo from "./assets/orbit-logo-ru.svg";
import logoDark from "./assets/orbit-logo-ru-dark.svg";
import { Finder } from "./components/Finder";
import { Icon } from "./components/Icon";
import { failedText } from "./components/messages";
import { Schedule } from "./components/Schedule";
import { Notice, Sheet, Skeleton } from "./components/ui";
import { useJSON, useMedia, useStore } from "./hooks";
import { initials } from "./lib/calendar";
import {
  type Entry,
  type Profile,
  prefsStore,
  profileStore,
  same,
  type Theme,
  toggleStar,
  visit,
} from "./lib/profile";
import {
  askPersistentStorage,
  fromSearch,
  loadSaved,
  type Selection,
  save,
  toSearch,
} from "./lib/selection";
import { forgetAll } from "./lib/store";

// Profile and settings are opened rarely: they are loaded when opened.
const ProfileSheet = lazy(() =>
  import("./components/Me").then((m) => ({ default: m.ProfileSheet })),
);
const SettingsSheet = lazy(() =>
  import("./components/Me").then((m) => ({ default: m.SettingsSheet })),
);

const WIDE = "(min-width: 1024px)";

type Panel = "menu" | "profile" | "settings";

const plain = (s: Selection): Selection => ({ source: s.source, kind: s.kind, id: s.id });

/** A link opens what it points to; then what was open last time; then "mine". */
function initialSelection(): Selection | undefined {
  const mine = profileStore.get().mine;
  return fromSearch(globalThis.location.search) ?? loadSaved()[0] ?? (mine && plain(mine));
}

export function App() {
  const wide = useMedia(WIDE);
  const [profile, setProfile] = useStore(profileStore);
  const [prefs, setPrefs] = useStore(prefsStore);
  const [selection, setSelection] = useState(initialSelection);
  // The schedule on screen once its name is known.
  const [seen, setSeen] = useState<Entry>();
  const [panel, setPanel] = useState<Panel>();
  const index = useJSON<Index>("index.json");

  // A schedule opened from the saved choice gets its link in the address
  // too, so it can be shared or bookmarked as is.
  useEffect(() => {
    if (selection && !fromSearch(globalThis.location.search)) {
      globalThis.history.replaceState(null, "", toSearch(selection));
    }
  }, [selection]);

  useEffect(() => applyTheme(prefs.theme), [prefs.theme]);

  const choose = (sel: Selection | undefined) => {
    setPanel(undefined);
    setSelection(sel && plain(sel));
    globalThis.history.replaceState(null, "", toSearch(sel) || globalThis.location.pathname);
    if (sel) {
      save([plain(sel)]);
      askPersistentStorage();
    }
  };
  const onSeen = (e: Entry) => {
    setSeen(e);
    profileStore.set(visit(profileStore.get(), e));
  };
  const onStar = (e: Entry) => setProfile(toggleStar(profileStore.get(), e));
  const close = () => setPanel(undefined);
  const folded = wide && prefs.sideFolded && !!selection;
  const fold = (sideFolded: boolean) => setPrefs({ ...prefsStore.get(), sideFolded });

  const finder = (autoFocus: boolean) =>
    index.kind === "loading" ? (
      <Skeleton label="Загружаем…" rows={2} />
    ) : index.kind !== "ready" ? (
      <Notice tone="warn" role="alert">
        {failedText(index.kind === "failed" ? index.reason : "server", "список учебных заведений")}
      </Notice>
    ) : index.data.sources.length === 0 ? (
      <Notice>Пока ни одно расписание не опубликовано.</Notice>
    ) : (
      <Finder
        sources={index.data.sources}
        current={selection}
        profile={profile}
        onPick={choose}
        onStar={onStar}
        autoFocus={autoFocus}
      />
    );

  const logoImgs = (
    <>
      <img className="logo-light" src={logo} alt="Орбита" width="136" height="47" />
      <img className="logo-dark" src={logoDark} alt="Орбита" width="136" height="47" />
    </>
  );
  const profileButton = (
    <button
      type="button"
      className={`${styles.round} ${styles.me}`}
      aria-label="Профиль"
      onClick={() => setPanel("profile")}
    >
      <Avatar profile={profile} />
    </button>
  );
  const links = (
    <div className={styles.links}>
      <button type="button" className={styles.link} onClick={() => setPanel("settings")}>
        <Icon name="gear" />
        Настройки
      </button>
      <button type="button" className={styles.link} onClick={() => setPanel("profile")}>
        <Icon name="person" />
        Профиль
      </button>
      <a className={styles.link} href="https://github.com/NikkiShuRA/orbit-schedule">
        <Icon name="open" />
        Исходный код
      </a>
      <p className={styles.independent}>Независимый проект, не связан с учебными заведениями.</p>
    </div>
  );
  // The brand card: the way to fold the side panel and to bring it back.
  const brand = (
    <div className={styles.brand}>
      {wide && selection && (
        <button
          type="button"
          className={styles.round}
          aria-label={folded ? "Показать панель" : "Скрыть панель"}
          aria-expanded={!folded}
          onClick={() => fold(!folded)}
        >
          <Icon name="sidebar" />
        </button>
      )}
      <h1 className={styles.logo}>{logoImgs}</h1>
    </div>
  );

  const schedule = (lead: ReactNode) =>
    selection && (
      <Schedule
        key={toSearch(selection)}
        sel={selection}
        onChange={() => choose(undefined)}
        onSeen={onSeen}
        onOpen={choose}
        starred={profile.starred.some((s) => same(s, selection))}
        mine={same(profile.mine, selection)}
        onStar={onStar}
        prefs={prefs}
        onPrefs={setPrefs}
        lead={lead}
        tail={profileButton}
      />
    );

  const sheets = (
    <Suspense fallback={null}>
      {panel === "menu" && (
        <Sheet title="Расписания" onClose={close} side="left">
          <div className={styles.drawer}>
            {finder(false)}
            {links}
          </div>
        </Sheet>
      )}
      {panel === "profile" && (
        <ProfileSheet
          profile={profile}
          prefs={prefs}
          current={seen && selection && same(seen, selection) ? seen : undefined}
          onProfile={(p: Profile) => setProfile(p)}
          onOpen={choose}
          onForget={() => {
            forgetAll();
            setSeen(undefined);
            choose(undefined);
          }}
          onClose={close}
        />
      )}
      {panel === "settings" && <SettingsSheet prefs={prefs} onPrefs={setPrefs} onClose={close} />}
    </Suspense>
  );

  if (wide) {
    return (
      <div className={folded ? `${styles.shell} ${styles.folded}` : styles.shell}>
        {!folded && (
          <aside className={styles.side}>
            {brand}
            <nav className={styles.sidePanel} aria-label="Выбор расписания">
              <div className={styles.sideFind}>{finder(false)}</div>
              {links}
            </nav>
          </aside>
        )}
        <main className={styles.content}>
          {selection ? (
            schedule(folded ? brand : null)
          ) : (
            <div className={styles.welcome}>
              <div className={styles.welcomeTop}>{profileButton}</div>
              <div className={styles.welcomeBody}>
                <span className={styles.welcomeIcon} aria-hidden="true">
                  <Icon name="week" />
                </span>
                <h2 className={styles.welcomeTitle}>Чьё расписание открыть?</h2>
                <p className={styles.welcomeText}>
                  Выберите группу или преподавателя слева: по корпусу и курсу, по букве фамилии или
                  поиском. Выбор запомнится на этом устройстве.
                </p>
              </div>
            </div>
          )}
        </main>
        {sheets}
      </div>
    );
  }

  const menuButton = (
    <button
      type="button"
      className={styles.round}
      aria-label="Меню"
      onClick={() => setPanel("menu")}
    >
      <Icon name="sidebar" />
    </button>
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.bar}>
          {selection && menuButton}
          <h1 className={styles.logo}>{logoImgs}</h1>
          <span className={styles.spacer} />
          {selection ? null : (
            <button
              type="button"
              className={styles.round}
              aria-label="Настройки"
              onClick={() => setPanel("settings")}
            >
              <Icon name="gear" />
            </button>
          )}
          {profileButton}
        </div>
      </header>
      {selection ? (
        <main className={styles.main}>{schedule(null)}</main>
      ) : (
        <>
          <main className={styles.start}>
            <h2 className={styles.startTitle}>Чьё расписание открыть?</h2>
            <p className={styles.startText}>
              Найдите группу или преподавателя. Выбор запомнится на этом устройстве.
            </p>
            <div className={styles.startCard}>{finder(false)}</div>
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
        </>
      )}
      {sheets}
    </div>
  );
}

function Avatar({ profile }: { profile: Profile }) {
  const mine = profile.mine;
  if (!mine) return <Icon name="person" />;
  if (mine.kind === "group") return <Icon name="people" />;
  return <span className={styles.initials}>{initials(mine.name)}</span>;
}

// The page colors follow the chosen theme; "system" leaves it to the
// browser. The browser bar color follows too.
const BAR: Record<Exclude<Theme, "system">, string> = { light: "#f3f3f0", dark: "#0b0b0a" };

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    meta.dataset.color ??= meta.content;
    meta.content = theme === "system" ? meta.dataset.color : BAR[theme];
  }
}
