import type Database from 'better-sqlite3';
import { DEFAULT_APPEARANCE, parseAppearance, validateAppearance } from '@perepelkin-home/core';
import type { FastifyInstance } from 'fastify';
import { getSetting, setSetting } from '../db/settings.js';
import { badRequest } from '../errors.js';
import { requireAdmin } from '../hooks.js';

const SETTINGS_KEY = 'appearance';

interface AppearanceRow {
  appearance: ReturnType<typeof validateAppearance>;
  /** False — сохранённая тема совпадает со стандартной (сброс или ещё не настраивали). */
  customized: boolean;
}

function readAppearance(db: Database.Database): AppearanceRow {
  const stored = parseAppearance(getSetting(db, SETTINGS_KEY));
  if (stored === null) return { appearance: DEFAULT_APPEARANCE, customized: false };
  return { appearance: stored, customized: !isDefaultAppearance(stored) };
}

function isDefaultAppearance(value: ReturnType<typeof validateAppearance>): boolean {
  const def: ReturnType<typeof validateAppearance> = DEFAULT_APPEARANCE;
  return (
    JSON.stringify(value.colors) === JSON.stringify(def.colors) &&
    value.fonts.display === def.fonts.display &&
    value.fonts.body === def.fonts.body &&
    value.radius === def.radius &&
    value.motion === def.motion
  );
}

/**
 * Оформление — одна тема на всю установку.
 * `GET /api/appearance` публичный: тема применяется ещё до входа (сплэш-экран, логин).
 */
export function registerAppearanceRoutes(
  app: FastifyInstance,
  deps: { db: Database.Database },
): void {
  const read = (): AppearanceRow => readAppearance(deps.db);

  app.get('/api/appearance', async () => {
    const { appearance, customized } = read();
    return { appearance, customized };
  });

  const admin = {
    preHandler: requireAdmin,
    config: { rateLimit: { max: 60, timeWindow: '15 minutes' } },
  };

  app.get('/api/admin/appearance', admin, async () => {
    const { appearance, customized } = read();
    return { appearance, customized };
  });

  app.put('/api/admin/appearance', admin, async (req) => {
    // Fastify-схема тела не годится: нужны точные тексты по каждому токену,
    // поэтому валидируем контрактом из ядра и бросаем 400 с конкретным текстом.
    let appearance: ReturnType<typeof validateAppearance>;
    try {
      appearance = validateAppearance(req.body);
    } catch (err) {
      throw badRequest(err instanceof Error ? err.message : 'Некорректные данные оформления');
    }
    setSetting(deps.db, SETTINGS_KEY, JSON.stringify(appearance));
    return { appearance, customized: !isDefaultAppearance(appearance) };
  });
}
