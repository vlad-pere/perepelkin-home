import type { Action, Grant, Group, ModuleInfo, User, UserWithGroups } from './types.js';
import type { ScopedStore } from './store.js';

export interface GroupListEntry extends Group {
  memberCount: number;
}

/**
 * Контракт «модуль ↔ ядро»: типизированная поверхность, которую хост модулей
 * предоставляет модулям. Секреты (хеши паролей) и платформенные админ-операции
 * в контракт не входят — они остаются на сервере.
 */
export interface CoreApi {
  users: {
    list(): UserWithGroups[];
    getById(id: number): User | undefined;
    groupIds(id: number): number[];
    /** Проверяет 6-значный пинкод пользователя по логину. Возвращает id при успехе, иначе `null`. */
    verifyPin(username: string, pin: string): Promise<number | null>;
  };
  groups: {
    list(): GroupListEntry[];
    getById(id: number): Group | undefined;
    listForUser(userId: number): Group[];
    memberCount(groupId: number): number;
  };
  grants: {
    get(groupId: number, moduleId: string): Grant | null;
    byModule(moduleId: string): Array<{ groupId: number; grant: Grant }>;
  };
  can(user: { id: number; isAdmin: boolean }, moduleId: string, action: Action): boolean;
  canForGroups(groupIds: readonly number[], isAdmin: boolean, moduleId: string, action: Action): boolean;
  store(moduleId: string): ScopedStore;
  registerModule(info: ModuleInfo): void;
  listModules(): ModuleInfo[];
  isModuleRegistered(moduleId: string): boolean;
  /** Подписка на удаление пользователя: модуль чистит свои данные под этим id. */
  onUserDelete(handler: (userId: number) => void): void;
}
