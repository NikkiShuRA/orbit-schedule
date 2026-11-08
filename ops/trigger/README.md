# Таймер публикации

Воркер Cloudflare, который по расписанию запускает workflow Publish ([ADR 0011](../../docs/decisions/0011-external-trigger.md)). Сам он ничего не скачивает и не публикует: только просит GitHub запустить `publish.yml` на `main`.

- `worker.js` — код воркера, `worker.test.js` — тесты (`npm test`, без сети и зависимостей);
- `wrangler.toml` — настройки и расписание (UTC; то же, что в [ADR 0004](../../docs/decisions/0004-scheduled-publishing.md)).

Выкладывает воркер владелец репозитория. Токен и аккаунт Cloudflare в репозиторий не попадают.

## Первая установка

### 1. Токен GitHub

GitHub → аватар → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**:

- **Token name:** `orbit-publish-trigger`;
- **Expiration:** 1 год (поставьте себе напоминание);
- **Repository access:** *Only select repositories* → `orbit-schedule`;
- **Permissions → Repository permissions → Actions:** *Read and write*. Больше ничего.

Нажмите **Generate token** и скопируйте его — второй раз GitHub его не покажет. Никуда его не записывайте, он нужен только на шаге 3.

### 2. Аккаунт Cloudflare

Зарегистрируйтесь на [dash.cloudflare.com](https://dash.cloudflare.com) (карта не нужна, хватит бесплатного тарифа) и включите двухфакторный вход: **My Profile → Authentication**.

### 3. Выкладка

Нужен Node.js 22+. Из этой папки:

```bash
npx --yes wrangler@4.155.0 login
```

Откроется браузер: разрешите доступ wrangler к аккаунту Cloudflare.

```bash
npx --yes wrangler@4.155.0 secret put GITHUB_TOKEN
```

Вставьте токен из шага 1, когда wrangler попросит. Если воркера ещё нет, wrangler предложит его создать — соглашайтесь.

```bash
npx --yes wrangler@4.155.0 deploy
```

В выводе должны быть оба расписания из `wrangler.toml` и не должно быть адреса `workers.dev`.

### 4. Проверка

В ближайшую минуту, оканчивающуюся на 3 (днём по Сургуту) или в :17 (ночью), в GitHub → **Actions → Publish** появится запуск «Manually run by NikkiShuRA» — так GitHub показывает запуск через API от владельца токена. В Cloudflare: **Workers & Pages → orbit-trigger → Logs** видно каждое срабатывание; ошибка там означает, что GitHub не принял запрос (текст ошибки скажет почему).

## Обслуживание

- **Токен истекает раз в год.** Создайте новый (шаг 1), положите его командой `secret put` (шаг 3), старый удалите на GitHub. Выкладывать воркер заново не нужно.
- **Изменили код или расписание** — после слияния PR выполните `deploy` из этой папки на свежем `main`. Частоту меняют только через ADR.
- **Остановить таймер:** Cloudflare → orbit-trigger → **Settings → Triggers** → удалить расписания, или отозвать токен на GitHub.
- **Если таймер не работает,** данные перестают обновляться, а через сутки падает проверка свежести (`.github/workflows/freshness.yml`) и GitHub присылает письмо. Опубликовать вручную можно всегда: **Actions → Publish → Run workflow**.
