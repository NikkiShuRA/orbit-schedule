// SPDX-FileCopyrightText: 2026 Orbit contributors <https://github.com/NikkiShuRA/orbit-schedule>
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Why something did not load, said honestly: no network is not the
 * same as a broken server, and the advice differs.
 */
export function failedText(reason: "offline" | "server", what: string): string {
  return reason === "offline"
    ? `Не удалось загрузить ${what}: нет сети, а сохранённой копии на устройстве нет. Откройте Orbit один раз с интернетом.`
    : `Не удалось загрузить ${what}: сервер ответил ошибкой. Попробуйте обновить страницу позже.`;
}
