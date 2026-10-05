import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ModuleManifest } from '@perepelkin-home/core';
import { Client, createTestWorld, type TestWorld } from './helpers.js';
import { mountModule } from '../src/modules/host.js';

function simpleManifest(id: string, name: string): ModuleManifest {
  return {
    id,
    name,
    description: `Тестовый модуль ${id}`,
    kind: 'simple',
    entities: [
      {
        name: 'item',
        label: 'Вещь',
        fields: [{ name: 'title', label: 'Название', type: 'text', required: true }],
      },
    ],
  };
}

const MANIFESTS: ModuleManifest[] = [
  simpleManifest('alpha', 'Альфа'),
  simpleManifest('beta', 'Бета'),
  simpleManifest('gamma', 'Гамма'),
];
/** Модуль, который монтируется, но доступа к нему ни у кого нет. */
const CLOSED = simpleManifest('closed', 'Закрытый');

let world: TestWorld;

beforeEach(async () => {
  world = await createTestWorld();
  for (const manifest of [...MANIFESTS, CLOSED]) {
    await mountModule(world.app, { db: world.db, core: world.core, manifest });
  }
  await world.core.users.create({ username: 'member', password: 'secret123' });
});

afterEach(async () => {
  await world.close();
});

function grant(userId: number, moduleId: string, canRead = true, canWrite = true): void {
  const name = `${moduleId}-${userId}`;
  const group =
    world.core.groups.list().find((g) => g.name === name) ??
    world.core.groups.create({ name });
  world.core.groups.addMember(group.id, userId);
  world.core.grants.set(group.id, moduleId, { canRead, canWrite });
}

async function memberClient(username = 'member'): Promise<Client> {
  const user = world.core.users.getByUsername(username)!;
  for (const manifest of MANIFESTS) grant(user.id, manifest.id);
  const client = new Client(world.app);
  const res = await client.login(username, 'secret123');
  expect(res.statusCode).toBe(200);
  return client;
}

async function meCards(client: Client): Promise<Array<{ id: string; hidden: boolean }>> {
  const res = await client.inject('GET', '/api/auth/me');
  expect(res.statusCode).toBe(200);
  return (res.json() as { modules: Array<{ id: string; hidden: boolean }> }).modules.map((m) => ({
    id: m.id,
    hidden: m.hidden,
  }));
}

function setHome(
  client: Client,
  body: { order: string[]; hidden: string[] },
  opts: { csrf?: string | null } = {},
) {
  return client.inject('PUT', '/api/me/home', body, opts);
}

describe('PUT /api/me/home: доступ', () => {
  it('требует вход', async () => {
    const anonymous = new Client(world.app);
    const res = await setHome(anonymous, { order: ['alpha'], hidden: [] });
    expect(res.statusCode).toBe(401);
  });

  it('требует CSRF-токен', async () => {
    const client = await memberClient();
    const res = await setHome(client, { order: ['alpha', 'beta', 'gamma'], hidden: [] }, { csrf: null });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: { code: string } }).error.code).toBe('CSRF_FAILED');
  });

  it('отклоняет модуль без доступа и мусор в теле', async () => {
    const client = await memberClient();

    const closed = await setHome(client, { order: ['closed'], hidden: [] });
    expect(closed.statusCode).toBe(400);

    const unknown = await setHome(client, { order: ['nope'], hidden: [] });
    expect(unknown.statusCode).toBe(400);

    const extra = await client.inject('PUT', '/api/me/home', { order: [], hidden: [], extra: 1 });
    expect(extra.statusCode).toBe(400);

    const missing = await client.inject('PUT', '/api/me/home', { order: [] });
    expect(missing.statusCode).toBe(400);
  });
});

describe('настройка главной', () => {
  it('сохраняет порядок и скрытые модули', async () => {
    const client = await memberClient();
    expect((await meCards(client)).map((m) => m.id)).toEqual(['alpha', 'beta', 'gamma']);

    const saved = await setHome(client, { order: ['gamma', 'alpha', 'beta'], hidden: ['beta'] });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ ok: true });

    expect(await meCards(client)).toEqual([
      { id: 'gamma', hidden: false },
      { id: 'alpha', hidden: false },
      { id: 'beta', hidden: true },
    ]);
  });

  it('скрытый модуль остаётся в реестре и открывается по прямой ссылке', async () => {
    const client = await memberClient();
    await setHome(client, { order: ['alpha', 'beta', 'gamma'], hidden: ['beta'] });

    expect((await meCards(client)).map((m) => m.id)).toContain('beta');

    const item = await client.inject('GET', '/api/modules/beta/item');
    expect(item.statusCode).toBe(200);
  });

  it('не смешивает настройки разных пользователей', async () => {
    const client = await memberClient();
    await setHome(client, { order: ['gamma', 'beta', 'alpha'], hidden: ['gamma'] });

    await world.core.users.create({ username: 'other', password: 'secret123' });
    const other = await memberClient('other');

    expect(await meCards(other)).toEqual([
      { id: 'alpha', hidden: false },
      { id: 'beta', hidden: false },
      { id: 'gamma', hidden: false },
    ]);
    expect(await meCards(client)).toEqual([
      { id: 'gamma', hidden: true },
      { id: 'beta', hidden: false },
      { id: 'alpha', hidden: false },
    ]);
  });

  it('скрытый модуль без места в порядке не теряется', async () => {
    const client = await memberClient();
    const res = await setHome(client, { order: ['gamma'], hidden: ['beta'] });
    expect(res.statusCode).toBe(200);

    const cards = await meCards(client);
    expect(cards[0]).toEqual({ id: 'gamma', hidden: false });
    expect(cards).toContainEqual({ id: 'beta', hidden: true });
  });

  it('новый модуль появляется в конце, не ломая расстановку', async () => {
    const client = await memberClient();
    await setHome(client, { order: ['beta', 'alpha', 'gamma'], hidden: [] });

    const fresh = simpleManifest('fresh', 'Новый');
    await mountModule(world.app, { db: world.db, core: world.core, manifest: fresh });
    grant(world.core.users.getByUsername('member')!.id, 'fresh');

    expect((await meCards(client)).map((m) => m.id)).toEqual(['beta', 'alpha', 'gamma', 'fresh']);
  });

  it('повторная отправка одной и той же настройки ничего не меняет', async () => {
    const client = await memberClient();
    const body = { order: ['beta', 'gamma', 'alpha'], hidden: ['alpha'] };
    await setHome(client, body);
    const first = await meCards(client);
    await setHome(client, body);
    expect(await meCards(client)).toEqual(first);
  });

  it('дубли в теле не создают дублей карточек', async () => {
    const client = await memberClient();
    const res = await setHome(client, { order: ['beta', 'beta', 'alpha'], hidden: ['alpha', 'alpha'] });
    expect(res.statusCode).toBe(200);
    // gamma в теле не упомянута — остаётся нерасставленной и идёт в конец
    expect(await meCards(client)).toEqual([
      { id: 'beta', hidden: false },
      { id: 'alpha', hidden: true },
      { id: 'gamma', hidden: false },
    ]);
  });
});
