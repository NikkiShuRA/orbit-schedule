// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

// Profile and settings. There is no account: everything is kept on this
// device only and never sent anywhere (ADR 0005), and the screens say so.
// Loaded only when opened (ADR 0010 budget).

import { type ReactNode, useState } from "react";
import { initials } from "../lib/calendar";
import {
  type Entry,
  forgetRecent,
  type Prefs,
  type Profile,
  type StartView,
  same,
  setMine,
  type Theme,
  toggleStar,
} from "../lib/profile";
import { Icon } from "./Icon";
import styles from "./Me.module.css";
import { Sheet } from "./ui";

export function ProfileSheet({
  profile,
  prefs,
  current,
  onProfile,
  onOpen,
  onForget,
  onClose,
}: {
  profile: Profile;
  prefs: Prefs;
  /** The schedule on screen, when its name is known. */
  current: Entry | undefined;
  onProfile: (p: Profile) => void;
  onOpen: (e: Entry) => void;
  onForget: () => void;
  onClose: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const mine = profile.mine;
  const subgroup = mine ? prefs.subgroups[`${mine.source}/${mine.kind}/${mine.id}`] : undefined;

  return (
    <Sheet title="Профиль" onClose={onClose}>
      <div className={styles.me}>
        <span className={styles.bigAvatar} aria-hidden="true">
          {mine ? (
            mine.kind === "group" ? (
              <Icon name="people" />
            ) : (
              initials(mine.name)
            )
          ) : (
            <Icon name="person" />
          )}
        </span>
        <div>
          <p className={styles.meName}>{mine ? mine.name : "Без расписания"}</p>
          <p className={styles.muted}>
            {mine
              ? `${mine.place}${mine.kind === "teacher" ? " · преподаватель" : ""}${subgroup ? ` · ${subgroup} подгруппа` : ""}`
              : "Выберите своё расписание, и оно будет открываться первым"}
          </p>
        </div>
      </div>
      <p className={styles.note}>
        Без регистрации: профиль хранится только на этом устройстве и никуда не отправляется.
      </p>

      <Group title="Моё расписание">
        {mine ? (
          <List>
            <EntryRow entry={mine} onOpen={onOpen}>
              <button
                type="button"
                className={styles.small}
                onClick={() => onProfile(setMine(profile, undefined))}
              >
                Убрать
              </button>
            </EntryRow>
          </List>
        ) : null}
        {current && !same(current, mine) && (
          <button
            type="button"
            className={styles.wide}
            onClick={() => onProfile(setMine(profile, current))}
          >
            <Icon name="home" />
            Сделать моим: {current.name}
          </button>
        )}
        {mine?.kind === "group" && (
          <p className={styles.muted}>
            Подгруппу можно выбрать над расписанием, если у группы есть подгруппы на этой неделе.
          </p>
        )}
      </Group>

      <Group title="Избранное">
        {profile.starred.length === 0 ? (
          <p className={styles.muted}>
            Отметьте звёздочкой группу друга или преподавателя в поиске, чтобы открывать их в одно
            касание.
          </p>
        ) : (
          <List>
            {profile.starred.map((e) => (
              <EntryRow key={`${e.source}/${e.kind}/${e.id}`} entry={e} onOpen={onOpen}>
                <button
                  type="button"
                  className={styles.icon}
                  aria-label={`Убрать из избранного: ${e.name}`}
                  onClick={() => onProfile(toggleStar(profile, e))}
                >
                  <Icon name="star" filled />
                </button>
              </EntryRow>
            ))}
          </List>
        )}
      </Group>

      {profile.recent.length > 0 && (
        <Group
          title="Недавние"
          action={
            <button
              type="button"
              className={styles.small}
              onClick={() => onProfile(forgetRecent(profile))}
            >
              Очистить
            </button>
          }
        >
          <List>
            {profile.recent.map((e) => (
              <EntryRow key={`${e.source}/${e.kind}/${e.id}`} entry={e} onOpen={onOpen} />
            ))}
          </List>
        </Group>
      )}

      <Group title="Данные на устройстве">
        <p className={styles.muted}>
          Здесь хранятся профиль, настройки и сохранённая копия расписания для работы без сети.
        </p>
        {confirm ? (
          <div className={styles.confirm}>
            <p>Стереть профиль и настройки? Отменить это нельзя.</p>
            <div className={styles.buttons}>
              <button type="button" className={styles.danger} onClick={onForget}>
                Стереть
              </button>
              <button type="button" className={styles.small} onClick={() => setConfirm(false)}>
                Отмена
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className={styles.wide} onClick={() => setConfirm(true)}>
            Стереть всё с этого устройства
          </button>
        )}
      </Group>
    </Sheet>
  );
}

export function SettingsSheet({
  prefs,
  onPrefs,
  onClose,
}: {
  prefs: Prefs;
  onPrefs: (p: Prefs) => void;
  onClose: () => void;
}) {
  return (
    <Sheet title="Настройки" onClose={onClose} side="left">
      <Group title="Оформление">
        <Choice<Theme>
          label="Тема"
          value={prefs.theme}
          options={[
            ["system", "Как в системе"],
            ["light", "Светлая"],
            ["dark", "Тёмная"],
          ]}
          onChange={(theme) => onPrefs({ ...prefs, theme })}
        />
      </Group>

      <Group title="Расписание">
        <Choice<StartView>
          label="Вид при открытии"
          value={prefs.startView}
          options={[
            ["last", "Как было"],
            ["day", "День"],
            ["week", "Неделя"],
          ]}
          onChange={(startView) => onPrefs({ ...prefs, startView })}
        />
        <p className={styles.muted}>
          Без сети открывается сохранённая копия расписания с пометкой, когда оно проверялось.
        </p>
      </Group>

      <Group title="О проекте">
        <p className={styles.text}>
          Orbit — независимый некоммерческий проект и не связан ни с одним учебным заведением.
          Расписание — ровно то, что опубликовало учебное заведение: без догадок и исправлений.
        </p>
        <ul className={styles.links}>
          <li>
            <a href="https://github.com/NikkiShuRA/orbit-schedule">Исходный код</a>
            <span className={styles.muted}> · AGPL-3.0</span>
          </li>
          <li>
            <a href="https://github.com/NikkiShuRA/orbit-schedule/blob/main/docs/api.md">
              Открытые данные
            </a>
          </li>
          <li className={styles.muted}>Шрифты Wix Madefor Display и Inter · SIL OFL 1.1</li>
        </ul>
      </Group>
    </Sheet>
  );
}

function Group({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.group}>
      <div className={styles.groupHead}>
        <h3 className={styles.groupTitle}>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function List({ children }: { children: ReactNode }) {
  return <ul className={styles.list}>{children}</ul>;
}

function EntryRow({
  entry,
  onOpen,
  children,
}: {
  entry: Entry;
  onOpen: (e: Entry) => void;
  children?: ReactNode;
}) {
  return (
    <li className={styles.entry}>
      <button type="button" className={styles.entryOpen} onClick={() => onOpen(entry)}>
        <span className={styles.avatar} aria-hidden="true">
          {entry.kind === "group" ? <Icon name="people" /> : initials(entry.name)}
        </span>
        <span className={styles.entryText}>
          <span className={styles.entryName}>{entry.name}</span>
          <span className={styles.muted}>{entry.place}</span>
        </span>
      </button>
      {children}
    </li>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className={styles.choice}>
      <legend className={styles.choiceLabel}>{label}</legend>
      <div className={styles.segments}>
        {options.map(([v, text]) => (
          <label key={v} className={styles.segment}>
            <input
              type="radio"
              name={label}
              value={v}
              checked={value === v}
              onChange={() => onChange(v)}
            />
            <span>{text}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
