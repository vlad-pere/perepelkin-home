import type Database from 'better-sqlite3';
import type { Action, CoreApi, Grant, Group, ModuleInfo, ScopedStore, User, UserWithGroups } from '@perepelkin-home/core';
import {
  can as coreCan,
  createScopedStore,
  isModuleRegistered as isModuleRegisteredPkg,
  listModules as listModulesPkg,
  registerModule as registerModulePkg,
} from '@perepelkin-home/core';
import { hashPassword } from './auth/passwords.js';
import { deleteSessionsForUser } from './db/sessions.js';

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  is_admin: number;
  created_at: string;
}

interface GroupRow {
  id: number;
  name: string;
  description: string;
  created_at: string;
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    isAdmin: row.is_admin === 1,
    createdAt: row.created_at,
  };
}

/**
 * Платформенная реализация {@link CoreApi} + внутренние операции с учётными
 * данными и админ-мутациями, которые не входят в контракт «модуль ↔ ядро».
 */
export interface Core extends CoreApi {
  users: CoreApi['users'] & {
    getByUsername(username: string): UserRow | undefined;
    create(input: { username: string; password: string; isAdmin?: boolean }): Promise<User>;
    setAdmin(id: number, isAdmin: boolean): void;
    resetPassword(id: number, password: string): Promise<void>;
    delete(id: number): void;
  };
  groups: CoreApi['groups'] & {
    create(input: { name: string; description?: string }): Group;
    update(id: number, patch: { name?: string; description?: string }): void;
    delete(id: number): void;
    addMember(groupId: number, userId: number): void;
    removeMember(groupId: number, userId: number): void;
  };
  grants: CoreApi['grants'] & {
    set(groupId: number, moduleId: string, grant: Grant): void;
    remove(groupId: number, moduleId: string): void;
  };
}

export function buildCore(db: Database.Database): Core {
  // users
  const usersAll = db.prepare('SELECT * FROM users ORDER BY id');
  const userById = db.prepare('SELECT * FROM users WHERE id = ?');
  const userByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
  const insertUser = db.prepare(
    'INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)',
  );
  const updateIsAdmin = db.prepare('UPDATE users SET is_admin = ? WHERE id = ?');
  const updatePasswordHash = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
  const deleteUser = db.prepare('DELETE FROM users WHERE id = ?');
  const groupIdsForUser = db.prepare('SELECT group_id FROM group_members WHERE user_id = ?');
  const groupsForUser = db.prepare(
    `SELECT g.* FROM groups g JOIN group_members gm ON gm.group_id = g.id
      WHERE gm.user_id = ? ORDER BY g.name`,
  );

  // groups
  const groupsList = db.prepare(
    `SELECT g.*, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count
       FROM groups g ORDER BY g.name`,
  );
  const groupById = db.prepare('SELECT * FROM groups WHERE id = ?');
  const insertGroup = db.prepare('INSERT INTO groups (name, description) VALUES (?, ?)');
  const updateGroup = db.prepare(
    'UPDATE groups SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ?',
  );
  const deleteGroup = db.prepare('DELETE FROM groups WHERE id = ?');
  const addMember = db.prepare(
    'INSERT INTO group_members (group_id, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
  );
  const removeMember = db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?');
  const memberCount = db.prepare('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?');

  // grants
  const grantGet = db.prepare(
    'SELECT can_read, can_write FROM module_grants WHERE group_id = ? AND module_id = ?',
  );
  const grantSet = db.prepare(
    `INSERT INTO module_grants (group_id, module_id, can_read, can_write) VALUES (?, ?, ?, ?)
       ON CONFLICT(group_id, module_id) DO UPDATE SET
         can_read = excluded.can_read, can_write = excluded.can_write`,
  );
  const grantRemove = db.prepare(
    'DELETE FROM module_grants WHERE group_id = ? AND module_id = ?',
  );
  const grantsByModule = db.prepare('SELECT * FROM module_grants WHERE module_id = ?');

  const canForGroups = (
    groupIds: readonly number[],
    isAdmin: boolean,
    moduleId: string,
    action: Action,
  ): boolean =>
    coreCan(
      {
        isAdmin,
        groupIds,
        isRegistered: isModuleRegisteredPkg,
        getGrant: (groupId, mid) => {
          const row = grantGet.get(groupId, mid) as
            | { can_read: number; can_write: number }
            | undefined;
          return row ? { canRead: row.can_read === 1, canWrite: row.can_write === 1 } : null;
        },
      },
      moduleId,
      action,
    );

  return {
    users: {
      list(): UserWithGroups[] {
        const users = usersAll.all() as UserRow[];
        return users.map((u) => ({
          ...toUser(u),
          groups: (groupsForUser.all(u.id) as GroupRow[]).map(toGroup),
        }));
      },
      getById(id: number): User | undefined {
        const row = userById.get(id) as UserRow | undefined;
        return row ? toUser(row) : undefined;
      },
      getByUsername(username: string): UserRow | undefined {
        return userByUsername.get(username) as UserRow | undefined;
      },
      async create(input: { username: string; password: string; isAdmin?: boolean }): Promise<User> {
        const passwordHash = await hashPassword(input.password);
        const result = insertUser.run(input.username.trim(), passwordHash, input.isAdmin ? 1 : 0);
        const row = userById.get(result.lastInsertRowid) as UserRow;
        return toUser(row);
      },
      setAdmin(id: number, isAdmin: boolean): void {
        updateIsAdmin.run(isAdmin ? 1 : 0, id);
        if (!isAdmin) deleteSessionsForUser(db, id);
      },
      async resetPassword(id: number, password: string): Promise<void> {
        updatePasswordHash.run(await hashPassword(password), id);
        deleteSessionsForUser(db, id);
      },
      delete(id: number): void {
        deleteUser.run(id);
      },
      groupIds(id: number): number[] {
        return (groupIdsForUser.all(id) as Array<{ group_id: number }>).map((r) => r.group_id);
      },
    },
    groups: {
      list(): Array<Group & { memberCount: number }> {
        const rows = groupsList.all() as Array<GroupRow & { member_count: number }>;
        return rows.map((r) => ({ ...toGroup(r), memberCount: r.member_count }));
      },
      getById(id: number): Group | undefined {
        const row = groupById.get(id) as GroupRow | undefined;
        return row ? toGroup(row) : undefined;
      },
      create(input: { name: string; description?: string }): Group {
        const result = insertGroup.run(input.name.trim(), input.description ?? '');
        const row = groupById.get(result.lastInsertRowid) as GroupRow;
        return toGroup(row);
      },
      update(id: number, patch: { name?: string; description?: string }): void {
        updateGroup.run(patch.name?.trim() ?? null, patch.description ?? null, id);
      },
      delete(id: number): void {
        deleteGroup.run(id);
      },
      addMember(groupId: number, userId: number): void {
        addMember.run(groupId, userId);
      },
      removeMember(groupId: number, userId: number): void {
        removeMember.run(groupId, userId);
      },
      listForUser(userId: number): Group[] {
        return (groupsForUser.all(userId) as GroupRow[]).map(toGroup);
      },
      memberCount(groupId: number): number {
        const row = memberCount.get(groupId) as { n: number };
        return row.n;
      },
    },
    grants: {
      get(groupId: number, moduleId: string): Grant | null {
        const row = grantGet.get(groupId, moduleId) as
          | { can_read: number; can_write: number }
          | undefined;
        return row ? { canRead: row.can_read === 1, canWrite: row.can_write === 1 } : null;
      },
      set(groupId: number, moduleId: string, grant: Grant): void {
        grantSet.run(groupId, moduleId, grant.canRead ? 1 : 0, grant.canWrite ? 1 : 0);
      },
      remove(groupId: number, moduleId: string): void {
        grantRemove.run(groupId, moduleId);
      },
      byModule(moduleId: string): Array<{ groupId: number; grant: Grant }> {
        const rows = grantsByModule.all(moduleId) as Array<{
          group_id: number;
          can_read: number;
          can_write: number;
        }>;
        return rows.map((r) => ({
          groupId: r.group_id,
          grant: { canRead: r.can_read === 1, canWrite: r.can_write === 1 },
        }));
      },
    },
    can: (user: { id: number; isAdmin: boolean }, moduleId: string, action: Action): boolean => {
      const groupIds = (groupIdsForUser.all(user.id) as Array<{ group_id: number }>).map(
        (r) => r.group_id,
      );
      return canForGroups(groupIds, user.isAdmin, moduleId, action);
    },
    canForGroups,
    store: (moduleId: string): ScopedStore => createScopedStore(db, moduleId),
    registerModule: registerModulePkg,
    listModules: listModulesPkg,
    isModuleRegistered: isModuleRegisteredPkg,
  };
}

function toGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
  };
}
