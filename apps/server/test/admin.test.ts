import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client, createAdmin, createTestWorld, type TestWorld } from './helpers.js';

let world: TestWorld;

beforeEach(async () => {
  world = await createTestWorld();
  await createAdmin(world);
  world.core.registerModule({ id: 'notes', name: 'Заметки', description: 'Общие заметки' });
  world.core.registerModule({ id: 'games', name: 'Игры', description: 'Игры для гостей' });
});

afterEach(async () => {
  await world.close();
});

async function adminClient(): Promise<Client> {
  const client = new Client(world.app);
  await client.login('admin', 'secret123');
  return client;
}

async function createMemberClient(username: string, password = 'secret123'): Promise<{ client: Client; userId: number }> {
  const admin = await adminClient();
  const res = await admin.inject('POST', '/api/admin/users', { username, password });
  expect(res.statusCode).toBe(201);
  const userId = res.json().user.id;
  admin.resetAuth();

  const client = new Client(world.app);
  await client.login(username, password);
  return { client, userId };
}

describe('пользователи', () => {
  it('список пользователей не содержит хеши паролей', async () => {
    const client = await adminClient();
    const res = await client.inject('GET', '/api/admin/users');
    expect(res.statusCode).toBe(200);
    const users = res.json().users;
    expect(users.length).toBe(1);
    expect(users[0].username).toBe('admin');
    expect(users[0].hasPassword).toBe(true);
    expect(users[0].hasPin).toBe(false);
    expect(users[0]).not.toHaveProperty('password_hash');
    expect(users[0]).not.toHaveProperty('pin_hash');
    expect(Array.isArray(users[0].groups)).toBe(true);
  });

  it('создаёт пользователя и отклоняет дубликат без учёта регистра', async () => {
    const client = await adminClient();
    const created = await client.inject('POST', '/api/admin/users', {
      username: 'sveta',
      password: 'secret123',
    });
    expect(created.statusCode).toBe(201);

    const dup = await client.inject('POST', '/api/admin/users', {
      username: 'Sveta',
      password: 'secret123',
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('CONFLICT');
  });

  it('отклоняет слабый пароль', async () => {
    const client = await adminClient();
    const res = await client.inject('POST', '/api/admin/users', { username: 'sveta', password: 'short' });
    expect(res.statusCode).toBe(400);
  });

  it('создаёт пользователя только с пинкодом', async () => {
    const admin = await adminClient();
    const created = await admin.inject('POST', '/api/admin/users', { username: 'sveta', pin: '123456' });
    expect(created.statusCode).toBe(201);
    expect(created.json().user.hasPin).toBe(true);
    expect(created.json().user.hasPassword).toBe(false);

    const client = new Client(world.app);
    expect((await client.login('sveta', '123456')).statusCode).toBe(200);
  });

  it('создаёт пользователя только с паролем', async () => {
    const admin = await adminClient();
    const created = await admin.inject('POST', '/api/admin/users', {
      username: 'petr',
      password: 'secret123',
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().user.hasPin).toBe(false);
    expect(created.json().user.hasPassword).toBe(true);

    const client = new Client(world.app);
    expect((await client.login('petr', 'secret123')).statusCode).toBe(200);
  });

  it('создаёт пользователя с обоими способами входа', async () => {
    const admin = await adminClient();
    const created = await admin.inject('POST', '/api/admin/users', {
      username: 'sveta',
      pin: '123456',
      password: 'secret123',
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().user.hasPin).toBe(true);
    expect(created.json().user.hasPassword).toBe(true);

    const byPin = new Client(world.app);
    expect((await byPin.login('sveta', '123456')).statusCode).toBe(200);
    const byPassword = new Client(world.app);
    expect((await byPassword.login('sveta', 'secret123')).statusCode).toBe(200);
  });

  it('отклоняет создание без пинкода и пароля', async () => {
    const admin = await adminClient();
    const res = await admin.inject('POST', '/api/admin/users', { username: 'sveta' });
    expect(res.statusCode).toBe(400);
  });

  it('отклоняет пинкод не из 6 цифр', async () => {
    const admin = await adminClient();
    const letters = await admin.inject('POST', '/api/admin/users', {
      username: 'sveta',
      pin: '12ab56',
    });
    expect(letters.statusCode).toBe(400);
    const short = await admin.inject('POST', '/api/admin/users', {
      username: 'sveta',
      pin: '12345',
    });
    expect(short.statusCode).toBe(400);
  });

  it('отклоняет короткий пароль', async () => {
    const admin = await adminClient();
    const res = await admin.inject('POST', '/api/admin/users', {
      username: 'petr',
      password: 'secret',
    });
    expect(res.statusCode).toBe(400);
  });

  it('смена без полей для изменения отклоняется', async () => {
    const { userId } = await createMemberClient('sveta');
    const admin = await adminClient();
    const empty = await admin.inject('PATCH', `/api/admin/users/${userId}`, {});
    expect(empty.statusCode).toBe(400);
  });

  it('добавление пинкода инвалидирует сессии и открывает вход по пинкоду', async () => {
    const { client, userId } = await createMemberClient('sveta');
    const admin = await adminClient();
    const reset = await admin.inject('PATCH', `/api/admin/users/${userId}`, { pin: '654321' });
    expect(reset.statusCode).toBe(200);

    const me = await client.inject('GET', '/api/auth/me');
    expect(me.statusCode).toBe(401);

    const fresh = new Client(world.app);
    expect((await fresh.login('sveta', '654321')).statusCode).toBe(200);

    const wrongPin = new Client(world.app);
    expect((await wrongPin.login('sveta', '123456')).statusCode).toBe(401);
  });

  it('смена пароля не затрагивает пинкод', async () => {
    const { userId } = await createMemberClient('sveta');
    const admin = await adminClient();
    await admin.inject('PATCH', `/api/admin/users/${userId}`, { pin: '123456' });

    const reset = await admin.inject('PATCH', `/api/admin/users/${userId}`, { password: 'newpass123' });
    expect(reset.statusCode).toBe(200);

    const byPin = new Client(world.app);
    expect((await byPin.login('sveta', '123456')).statusCode).toBe(200);
    const byPassword = new Client(world.app);
    expect((await byPassword.login('sveta', 'newpass123')).statusCode).toBe(200);
  });

  it('не даёт сменить собственные учётные данные через админ-API', async () => {
    const admin = await adminClient();
    const adminId = world.core.users.getByUsername('admin')!.id;
    const res = await admin.inject('PATCH', `/api/admin/users/${adminId}`, { password: 'newpass123' });
    expect(res.statusCode).toBe(400);
  });

  it('не даёт удалить собственный аккаунт', async () => {
    const client = await adminClient();
    const adminId = world.core.users.getByUsername('admin')!.id;
    const res = await client.inject('DELETE', `/api/admin/users/${adminId}`);
    expect(res.statusCode).toBe(400);
  });

  it('не даёт снять с себя права администратора', async () => {
    const client = await adminClient();
    const adminId = world.core.users.getByUsername('admin')!.id;
    const res = await client.inject('PATCH', `/api/admin/users/${adminId}`, { isAdmin: false });
    expect(res.statusCode).toBe(400);
  });

  it('удаляет пользователя вместе с сессиями', async () => {
    const { client, userId } = await createMemberClient('sveta');
    const admin = await adminClient();
    const del = await admin.inject('DELETE', `/api/admin/users/${userId}`);
    expect(del.statusCode).toBe(204);

    const me = await client.inject('GET', '/api/auth/me');
    expect(me.statusCode).toBe(401);
  });
});

describe('инвалидация сессий при изменении учётных данных', () => {
  it('сброс пароля инвалидирует все сессии пользователя и пускает только с новым паролем', async () => {
    const { client, userId } = await createMemberClient('sveta');
    const second = new Client(world.app);
    await second.login('sveta', 'secret123');

    const admin = await adminClient();
    const reset = await admin.inject('PATCH', `/api/admin/users/${userId}`, {
      password: 'newpass123',
    });
    expect(reset.statusCode).toBe(200);

    const me1 = await client.inject('GET', '/api/auth/me');
    expect(me1.statusCode).toBe(401);
    const me2 = await second.inject('GET', '/api/auth/me');
    expect(me2.statusCode).toBe(401);

    const oldLogin = await client.login('sveta', 'secret123');
    expect(oldLogin.statusCode).toBe(401);

    const fresh = new Client(world.app);
    const login = await fresh.login('sveta', 'newpass123');
    expect(login.statusCode).toBe(200);
    const me = await fresh.inject('GET', '/api/auth/me');
    expect(me.statusCode).toBe(200);
  });

  it('снятие прав администратора инвалидирует сессии пользователя', async () => {
    const boss = await world.core.users.create({
      username: 'boss',
      password: 'secret123',
      isAdmin: true,
    });
    const client = new Client(world.app);
    await client.login('boss', 'secret123');
    expect((await client.inject('GET', '/api/admin/users')).statusCode).toBe(200);

    const admin = await adminClient();
    const demote = await admin.inject('PATCH', `/api/admin/users/${boss.id}`, { isAdmin: false });
    expect(demote.statusCode).toBe(200);

    expect((await client.inject('GET', '/api/auth/me')).statusCode).toBe(401);
    expect((await client.inject('GET', '/api/admin/users')).statusCode).toBe(401);
  });

  it('сброс пароля одного пользователя не затрагивает сессии других', async () => {
    await createMemberClient('sveta');
    const { client: petr } = await createMemberClient('petr');
    const svetaId = world.core.users.getByUsername('sveta')!.id;

    const admin = await adminClient();
    const reset = await admin.inject('PATCH', `/api/admin/users/${svetaId}`, {
      password: 'newpass123',
    });
    expect(reset.statusCode).toBe(200);

    const me = await petr.inject('GET', '/api/auth/me');
    expect(me.statusCode).toBe(200);
  });
});

describe('группы и доступ к модулям', () => {
  it('создаёт группу, добавляет участника и показывает её в /me', async () => {
    const { userId } = await createMemberClient('sveta');
    const admin = await adminClient();

    const groupRes = await admin.inject('POST', '/api/admin/groups', { name: 'Семья' });
    expect(groupRes.statusCode).toBe(201);
    const groupId = groupRes.json().group.id;

    const add = await admin.inject('POST', `/api/admin/groups/${groupId}/members`, { user_id: userId });
    expect(add.statusCode).toBe(204);

    const member = new Client(world.app);
    await member.login('sveta', 'secret123');
    const me = await member.inject('GET', '/api/auth/me');
    expect(me.statusCode).toBe(200);
    expect(me.json().groups.map((g: { name: string }) => g.name)).toContain('Семья');
  });

  it('выдаёт права на модуль группе — пользователь видит модуль с корректными правами', async () => {
    const { userId } = await createMemberClient('sveta');
    const admin = await adminClient();

    const groupRes = await admin.inject('POST', '/api/admin/groups', { name: 'Семья' });
    const groupId = groupRes.json().group.id;
    await admin.inject('POST', `/api/admin/groups/${groupId}/members`, { user_id: userId });

    const grant = await admin.inject('PUT', '/api/admin/modules/notes/grants', {
      group_id: groupId,
      can_read: true,
      can_write: false,
    });
    expect(grant.statusCode).toBe(204);

    const member = new Client(world.app);
    await member.login('sveta', 'secret123');
    const me = await member.inject('GET', '/api/auth/me');
    expect(me.statusCode).toBe(200);
    const body = me.json();
    const notes = body.modules.find((m: { id: string }) => m.id === 'notes');
    expect(notes).toBeDefined();
    expect(notes.canRead).toBe(true);
    expect(notes.canWrite).toBe(false);
    expect(body.modules.find((m: { id: string }) => m.id === 'games')).toBeUndefined();
  });

  it('не показывает модуль пользователю без выданного доступа', async () => {
    await createMemberClient('sveta');
    const member = new Client(world.app);
    await member.login('sveta', 'secret123');
    const me = await member.inject('GET', '/api/auth/me');
    expect(me.json().modules).toEqual([]);
  });

  it('админ видит все модули с полными правами', async () => {
    const admin = await adminClient();
    const me = await admin.inject('GET', '/api/auth/me');
    const modules = me.json().modules;
    expect(modules.map((m: { id: string }) => m.id).sort()).toEqual(['admin', 'games', 'notes']);
    for (const m of modules) {
      expect(m.canRead).toBe(true);
      expect(m.canWrite).toBe(true);
    }
  });

  it('отклоняет грант для неизвестного модуля и неизвестной группы', async () => {
    const admin = await adminClient();
    const groupRes = await admin.inject('POST', '/api/admin/groups', { name: 'Семья' });
    const groupId = groupRes.json().group.id;

    const badModule = await admin.inject('PUT', '/api/admin/modules/ghost/grants', {
      group_id: groupId,
      can_read: true,
      can_write: false,
    });
    expect(badModule.statusCode).toBe(404);

    const badGroup = await admin.inject('PUT', '/api/admin/modules/notes/grants', {
      group_id: 9999,
      can_read: true,
      can_write: false,
    });
    expect(badGroup.statusCode).toBe(404);
  });

  it('отзывает грант — модуль исчезает из /me', async () => {
    const { userId } = await createMemberClient('sveta');
    const admin = await adminClient();
    const groupRes = await admin.inject('POST', '/api/admin/groups', { name: 'Семья' });
    const groupId = groupRes.json().group.id;
    await admin.inject('POST', `/api/admin/groups/${groupId}/members`, { user_id: userId });
    await admin.inject('PUT', '/api/admin/modules/notes/grants', { group_id: groupId, can_read: true, can_write: false });

    const remove = await admin.inject('DELETE', `/api/admin/modules/notes/grants/${groupId}`);
    expect(remove.statusCode).toBe(204);

    const member = new Client(world.app);
    await member.login('sveta', 'secret123');
    const me = await member.inject('GET', '/api/auth/me');
    expect(me.json().modules).toEqual([]);
  });

  it('список модулей администратора показывает выдачу по группам', async () => {
    const admin = await adminClient();
    const groupRes = await admin.inject('POST', '/api/admin/groups', { name: 'Семья' });
    const groupId = groupRes.json().group.id;
    await admin.inject('PUT', '/api/admin/modules/notes/grants', { group_id: groupId, can_read: true, can_write: true });

    const res = await admin.inject('GET', '/api/admin/modules');
    expect(res.statusCode).toBe(200);
    const notes = res.json().modules.find((m: { id: string }) => m.id === 'notes');
    expect(notes.grants).toEqual([{ groupId, canRead: true, canWrite: true }]);
  });

  it('удаление группы снимает её членство и права', async () => {
    const { userId } = await createMemberClient('sveta');
    const admin = await adminClient();
    const groupRes = await admin.inject('POST', '/api/admin/groups', { name: 'Семья' });
    const groupId = groupRes.json().group.id;
    await admin.inject('POST', `/api/admin/groups/${groupId}/members`, { user_id: userId });
    await admin.inject('PUT', '/api/admin/modules/notes/grants', { group_id: groupId, can_read: true, can_write: false });

    const del = await admin.inject('DELETE', `/api/admin/groups/${groupId}`);
    expect(del.statusCode).toBe(204);

    const member = new Client(world.app);
    await member.login('sveta', 'secret123');
    const me = await member.inject('GET', '/api/auth/me');
    expect(me.json().groups).toEqual([]);
    expect(me.json().modules).toEqual([]);
  });
});

describe('core.store', () => {
  it('изолирует данные модуля по ключам', () => {
    const notesStore = world.core.store('notes');
    const gamesStore = world.core.store('games');
    notesStore.set('title', 'Дом');
    expect(notesStore.get('title')).toBe('Дом');
    expect(gamesStore.get('title')).toBeUndefined();
    expect(() => world.core.store('ghost')).toThrow(/unknown module/i);
  });
});
