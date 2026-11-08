/**
 * Общие браузерные хелперы для UI модулей.
 * Без React и без серверных зависимостей — используются и фронтендом, и модулями.
 */

/** Клиент API, который передаётся в UI модуля. */
export interface ModuleApiClient {
  <T>(path: string, init?: { method?: string; body?: unknown }): Promise<T>;
}

export interface FormatDateOptions {
  /** Показывать год. По умолчанию — да. */
  year?: boolean;
  /** Добавить день недели. */
  weekday?: boolean;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Форматирует дату в русской локали.
 * Значение вида `YYYY-MM-DD` трактуется как локальная дата (без сдвига по UTC),
 * полный ISO-таймстамп — как момент времени.
 */
export function formatDate(
  value: string | number | null | undefined,
  options: FormatDateOptions = {},
): string {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  if (raw === '') return '';

  const parsed = new Date(DATE_ONLY.test(raw) ? `${raw}T00:00:00` : raw);
  if (Number.isNaN(parsed.getTime())) return raw;

  return parsed.toLocaleDateString('ru-RU', {
    ...(options.weekday === true ? { weekday: 'long' as const } : {}),
    day: 'numeric',
    month: 'long',
    ...(options.year === false ? {} : { year: 'numeric' as const }),
  });
}

/** Возвращает ссылку, если это http(s)-URL, иначе `null`. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString();
  } catch {
    /* не ссылка */
  }
  return null;
}

/** Текущая локальная дата в формате `YYYY-MM-DD`. */
export function todayISODate(): string {
  return toISODate(new Date());
}

/** Локальная дата в формате `YYYY-MM-DD`. */
export function toISODate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
