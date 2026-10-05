import type { FastifyInstance } from 'fastify';
import { MODULE_ID_PATTERN } from '@perepelkin-home/core';
import type { Core } from '../core.js';
import { requireAuth } from '../hooks.js';
import { badRequest } from '../errors.js';

const moduleIdSchema = { type: 'string', pattern: MODULE_ID_PATTERN.source };

const setHomeSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['order', 'hidden'],
  properties: {
    order: { type: 'array', maxItems: 200, items: moduleIdSchema },
    hidden: { type: 'array', maxItems: 200, items: moduleIdSchema },
  },
};

/** Убирает повторы, сохраняя первый порядок появления. */
function unique(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

/**
 * Личная настройка главной: порядок карточек и скрытые модули.
 * Настройка полная (заменяет предыдущую), поэтому клиент присылает весь список
 * сразу — так не бывает рассинхрона из-за частичных правок.
 */
export function registerHomeRoutes(app: FastifyInstance, core: Core): void {
  app.put(
    '/api/me/home',
    { preHandler: requireAuth, schema: { body: setHomeSchema } },
    async (req) => {
      const user = req.user!;
      const body = req.body as { order: string[]; hidden: string[] };

      const available = new Set(
        core.visibleModules(core.users.groupIds(user.id), user.is_admin === 1).map((m) => m.id),
      );
      const order = unique(body.order);
      const hidden = unique(body.hidden);

      // Модуль без доступа хранить бессмысленно: он и так не виден пользователю.
      for (const moduleId of [...order, ...hidden]) {
        if (!available.has(moduleId)) throw badRequest(`Модуль "${moduleId}" недоступен`);
      }
      // Скрытые модули остаются в общем порядке, чтобы «Вернуть» ставило карточку
      // на прежнее место, а не в конец.
      for (const moduleId of hidden) {
        if (!order.includes(moduleId)) order.push(moduleId);
      }

      const hiddenSet = new Set(hidden);
      core.home.set(
        user.id,
        order.map((moduleId) => ({ moduleId, hidden: hiddenSet.has(moduleId) })),
      );
      return { ok: true };
    },
  );
}
