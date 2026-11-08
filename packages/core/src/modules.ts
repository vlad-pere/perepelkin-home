import type { Action } from './types.js';
import type { CoreApi } from './api.js';
import type { SqlPrepared } from './store.js';

/** HTTP-метод роута код-модуля. */
export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/**
 * JSON-схема роута в формате JSON Schema. Ядро не знает о конкретном
 * фреймворке: хост сам решает, чем её валидировать. Алиасы сохранены для
 * привычности Fastify/AJV.
 */
export interface RouteSchema {
  body?: unknown;
  query?: unknown;
  querystring?: unknown;
  params?: unknown;
  headers?: unknown;
  response?: unknown;
}

/** Роут код-модуля: метод, путь относительно префикса модуля и требуемое право. */
export interface RouteSpec {
  method: HttpMethod;
  path: string;
  action: Action;
  /**
   * Публичный роут без входа и без CSRF: модуль сам аутентифицирует запрос
   * (например, логин+пинкод). Применяется для мутаций «гостевого» характера.
   */
  public?: boolean;
  /** JSON-схема валидации. Ошибка схемы — 400; проверка прав выполняется раньше. */
  schema?: RouteSchema;
  /** Доп. опции хоста (например, per-route rate limit). */
  config?: Record<string, unknown>;
}

/**
 * База данных модуля: структурный подмножественный интерфейс better-sqlite3.
 * Хост передаёт модулю одну и ту же `db`, что и остальной платформе.
 */
export interface ModuleDb {
  prepare(sql: string): SqlPrepared;
  exec(sql: string): unknown;
  /** Выполняет fn в транзакции и возвращает обёртку, которую нужно вызвать. */
  transaction(fn: (...args: never[]) => unknown): (...args: never[]) => unknown;
}

/**
 * Контекст код-модуля, который хост передаёт в {@link CodeModuleRegister}.
 * Типы запроса/ответа остаются на стороне хоста: ядро не знает о фреймворке.
 */
export interface ModuleContext<TReq = unknown, TRes = unknown> {
  /** Регистрирует роут код-модуля под защитой гарда на `action`. */
  route(spec: RouteSpec, handler: (req: TReq, reply: TRes) => unknown | Promise<unknown>): void;
  /** Ядро платформы (контракт `CoreApi`). */
  core: CoreApi;
  /** Хранилище модуля: одна и та же SQLite-база, что у платформы. */
  db: ModuleDb;
}

/**
 * Точка входа код-модуля: хост зовёт её при монтировании модуля.
 * Обработчик получает типизированный контекст {@link ModuleContext}.
 */
export type CodeModuleRegister<TReq = unknown, TRes = unknown> = (
  app: unknown,
  ctx: ModuleContext<TReq, TRes>,
) => void | Promise<void>;
