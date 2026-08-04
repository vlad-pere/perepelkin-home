import type { Action, Grant } from './types.js';

export interface CanOptions {
  isAdmin: boolean;
  groupIds: readonly number[];
  /** Вернуть права группы на модуль; `null`, если доступ группы не выдавался. */
  getGrant(groupId: number, moduleId: string): Grant | null;
  isRegistered(moduleId: string): boolean;
}

/**
 * Единая точка принятия решения о доступе к модулю.
 * Админ видит все зарегистрированные модули; остальные — только то,
 * что выдали хотя бы одной из их групп.
 */
export function can(opts: CanOptions, moduleId: string, action: Action): boolean {
  if (action !== 'read' && action !== 'write') return false;
  if (!opts.isRegistered(moduleId)) return false;
  if (opts.isAdmin) return true;

  const required = action === 'read' ? 'canRead' : 'canWrite';
  for (const groupId of opts.groupIds) {
    const grant = opts.getGrant(groupId, moduleId);
    if (grant && grant[required]) return true;
  }
  return false;
}
