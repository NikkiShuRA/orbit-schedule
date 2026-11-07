# Журнал изменений

Здесь записано всё заметное, что появляется и меняется в Orbit. Свежие изменения — сверху.

Формат — [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/), номера версий — [семантическое версионирование](https://semver.org/lang/ru/). У стандарта данных своя версия (поле `standardVersion` в документе), у каждого коннектора — своя (`provenance.connector.version`).

## [Не выпущено]

### Добавлено

- Стандарт 0.2: охват можно сочетать (например, «все пары преподавателя в корпусах 1–4»), появился охват по преподавателям `teacherIds`. Документы 0.1 остаются правильными. Валидаторы предупреждают о паре, которая не попадает в охват ([ADR 0006](docs/decisions/0006-coverage-and-slices.md)). ([#21](https://github.com/NikkiShuRA/orbit-schedule/pull/21))
- Расписание обновляется само: раз в час GitHub Actions забирает текущую и следующую недели СИЭУиП, сохраняет изменения в ветку `data` и выкладывает данные на [GitHub Pages](https://nikkishura.github.io/orbit-schedule/data/). В истории ветки — только настоящие изменения расписания. ([#19](https://github.com/NikkiShuRA/orbit-schedule/pull/19))
- `orbit fetch --weeks N` скачивает несколько недель подряд; файл перезаписывается, только если расписание изменилось; `status.json` показывает, когда источник проверяли в последний раз. ([#19](https://github.com/NikkiShuRA/orbit-schedule/pull/19))
- Коннектор СИЭУиП: забирает неделю расписания из API института и переводит её в стандарт. Корпус, который ещё не выложил неделю, помечается как «не опубликовано», а не «пар нет». Данные с временного резервного зеркала подписаны как полученные с зеркала. ([#5](https://github.com/NikkiShuRA/orbit-schedule/pull/5))
- Программа командной строки `orbit`: `orbit fetch sieup` скачивает расписание, `orbit validate` проверяет документы. Адрес API можно задать флагом `--base`. ([#5](https://github.com/NikkiShuRA/orbit-schedule/pull/5))
- Проверка документов стандарта на Go — даёт те же результаты, что и проверка на Node.js. ([#5](https://github.com/NikkiShuRA/orbit-schedule/pull/5))
- Заголовки лицензии SPDX в файлах с кодом. ([#5](https://github.com/NikkiShuRA/orbit-schedule/pull/5), [#7](https://github.com/NikkiShuRA/orbit-schedule/pull/7))
- Dependabot следит за зависимостями Go, npm и GitHub Actions; `SECURITY.md` объясняет, как приватно сообщить об уязвимости. ([#6](https://github.com/NikkiShuRA/orbit-schedule/pull/6))
- Шаблоны для issues и PR, этот журнал изменений. ([#7](https://github.com/NikkiShuRA/orbit-schedule/pull/7))
- Решение о стеке и размещении: коннекторы на Go, приложение на TypeScript, публикация через GitHub Actions и GitHub Pages ([ADR 0003](docs/decisions/0003-stack-and-hosting.md)). ([#4](https://github.com/NikkiShuRA/orbit-schedule/pull/4))
- Стандарт данных расписания, черновик 0.1: схема JSON Schema, примеры правильных и неправильных документов, проверка на Node.js. Решения о формате и модели документа — [ADR 0001](docs/decisions/0001-schema-format.md) и [ADR 0002](docs/decisions/0002-publication-document-model.md). ([#3](https://github.com/NikkiShuRA/orbit-schedule/pull/3))
- Требования к стандарту, собранные по реальным источникам СИЭУиП и СПК. ([#2](https://github.com/NikkiShuRA/orbit-schedule/pull/2))
- Инструкции для ИИ-агентов (`AGENTS.md`) и общие настройки репозитория. ([#1](https://github.com/NikkiShuRA/orbit-schedule/pull/1))

### Безопасность

- Ветка `main` защищена: изменения только через PR с зелёными проверками, force push и удаление запрещены. Проверки CI запускаются на каждом PR. ([#6](https://github.com/NikkiShuRA/orbit-schedule/pull/6))
