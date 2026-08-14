import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ModuleManifest } from '@perepelkin-home/core';
import { createTestWorld, Client, type TestWorld } from './helpers.js';
import { mountModule, syncModule, registerModulesFromDisk, type CodeModuleRegister } from '../src/modules/host.js';
import { tableName } from '../src/modules/crud.js';

const itemManifest: ModuleManifest = {
  id: 'demo',
  name: 'Демо-модуль',
  description: 'Проверка хоста модулей',
  kind: 'simple',
  entities: [
    {
      name: 'item',
      label: 'Вещь',
      fields: [
        { name: 'title', label: 'Название', type: 'text', required: true },
        { name: 'nextDue', label: 'Следующее обслуживание', type: 'date' },
        { name: 'interval', label: 'Интервал (мес)', type: 'number' },
        { name: 'done', label: 'Выполнено', type: 'boolean' },
        { name: 'notes', label: 'Заметки', type: 'textarea' },
      ],
      defaultSort: { field: 'nextDue', direction: 'asc' },
    },
  ],
};

let world: TestWorld;

beforeEach(async () => {
  world = await createTestWorld();
  await world.core.users.create({ username: 'member', password: 'secret123', authMode: 'password' });
});

afterEach(async () => {
  await world.close();
});

function grant(userId: number, canRead: boolean, canWrite: boolean): void {
  const group = world.core.groups.create({ name: `family-${userId}-${canRead}-${canWrite}` });
  world.core.groups.addMember(group.id, userId);
  world.core.grants.set(group.id, 'demo', { canRead, canWrite });
}

async function memberClient(username = 'member', password = 'secret123'): Promise<Client> {
  const client = new Client(world.app);
  await client.login(username, password);
  return client;
}

describe('module host', () => {
  it('rejects unauthenticated access to module routes', async () => {
    await mountModule(world.app, { db: world.db, core: world.core, manifest: itemManifest });
    const client = new Client(world.app);
    const res = await client.inject('GET', '/api/modules/demo/item');
    expect(res.statusCode).toBe(401);
  });

  it('rejects access without a grant (403)', async () => {
    await mountModule(world.app, { db: world.db, core: world.core, manifest: itemManifest });
    const client = await memberClient();
    const res = await client.inject('GET', '/api/modules/demo/item');
    expect(res.statusCode).toBe(403);
  });

  it('allows read and rejects write for a read-only grant', async () => {
    await mountModule(world.app, { db: world.db, core: world.core, manifest: itemManifest });
    const user = world.core.users.getByUsername('member')!;
    grant(user.id, true, false);
    const client = await memberClient();

    const read = await client.inject('GET', '/api/modules/demo/item');
    expect(read.statusCode).toBe(200);

    const write = await client.inject('POST', '/api/modules/demo/item', { title: 'Чайник' });
    expect(write.statusCode).toBe(403);
  });

  it('serves the manifest with read access', async () => {
    await mountModule(world.app, { db: world.db, core: world.core, manifest: itemManifest });
    const user = world.core.users.getByUsername('member')!;
    grant(user.id, true, false);
    const client = await memberClient();

    const res = await client.inject('GET', '/api/modules/demo/manifest');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ manifest: itemManifest });
  });

  it('creates the entity table on sync', async () => {
    syncModule(world.db, itemManifest);
    const tables = world.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
      .get(tableName('demo', 'item'));
    expect(tables).toBeTruthy();
  });

  it('upserts the module row and bumps version when the manifest changes', async () => {
    syncModule(world.db, itemManifest);
    const changed: ModuleManifest = {
      ...itemManifest,
      entities: [
        {
          ...itemManifest.entities[0]!,
          fields: [
            ...itemManifest.entities[0]!.fields,
            { name: 'cost', label: 'Стоимость', type: 'number' },
          ],
        },
      ],
    };
    syncModule(world.db, changed);
    const row = world.db.prepare('SELECT version, status, manifest_json FROM modules WHERE id = ?').get(
      'demo',
    ) as { version: number; status: string; manifest_json: string };
    expect(row.version).toBe(2);
    expect(row.status).toBe('active');
    expect(JSON.parse(row.manifest_json)).toEqual(changed);

    const migrations = world.db
      .prepare('SELECT version FROM module_migrations WHERE module_id = ? ORDER BY version')
      .all('demo') as Array<{ version: number }>;
    expect(migrations.map((m) => m.version)).toEqual([1, 2]);

    syncModule(world.db, changed);
    const after = world.db.prepare('SELECT version FROM modules WHERE id = ?').get('demo') as {
      version: number;
    };
    expect(after.version).toBe(2);
  });

  it('does full CRUD cycle with write grant', async () => {
    await mountModule(world.app, { db: world.db, core: world.core, manifest: itemManifest });
    const user = world.core.users.getByUsername('member')!;
    grant(user.id, true, true);
    const client = await memberClient();

    const created = await client.inject('POST', '/api/modules/demo/item', {
      title: 'Чайник',
      nextDue: '2026-09-01',
      interval: 3,
      done: false,
      notes: 'Заменить прокладку',
    });
    expect(created.statusCode).toBe(201);
    const createdBody = created.json() as { item: Record<string, unknown> };
    expect(createdBody.item).toMatchObject({
      title: 'Чайник',
      nextDue: '2026-09-01',
      interval: 3,
      done: false,
      notes: 'Заменить прокладку',
    });
    expect(createdBody.item.id).toBeTypeOf('number');
    expect(createdBody.item.created_by).toBe(user.id);
    const id = createdBody.item.id as number;

    const listed = await client.inject('GET', '/api/modules/demo/item');
    expect(listed.statusCode).toBe(200);
    const listBody = listed.json() as { items: Array<Record<string, unknown>> };
    expect(listBody.items).toHaveLength(1);
    expect(listBody.items[0]).toMatchObject({ title: 'Чайник', done: false });

    const patched = await client.inject('PATCH', `/api/modules/demo/item/${id}`, {
      done: true,
      notes: 'Сделано',
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toEqual({
      item: expect.objectContaining({ done: true, notes: 'Сделано' }),
    });

    const removed = await client.inject('DELETE', `/api/modules/demo/item/${id}`);
    expect(removed.statusCode).toBe(204);

    const after = await client.inject('GET', '/api/modules/demo/item');
    expect((after.json() as { items: unknown[] }).items).toHaveLength(0);
  });

  it('validates required fields on create', async () => {
    await mountModule(world.app, { db: world.db, core: world.core, manifest: itemManifest });
    const user = world.core.users.getByUsername('member')!;
    grant(user.id, true, true);
    const client = await memberClient();

    const res = await client.inject('POST', '/api/modules/demo/item', { nextDue: '2026-09-01' });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: string } }).error.code).toBe('BAD_REQUEST');
  });

  it.each([
    ['number as text', { title: 'X', interval: 'три' }],
    ['invalid date', { title: 'X', nextDue: 'завтра' }],
    ['boolean as string', { title: 'X', done: 'yes' }],
    ['unknown field', { title: 'X', bogus: 1 }],
  ])('rejects bad payload: %s', async (_name, payload) => {
    await mountModule(world.app, { db: world.db, core: world.core, manifest: itemManifest });
    const user = world.core.users.getByUsername('member')!;
    grant(user.id, true, true);
    const client = await memberClient();

    const res = await client.inject('POST', '/api/modules/demo/item', payload);
    expect(res.statusCode).toBe(400);
  });

  it('validates patch payloads', async () => {
    await mountModule(world.app, { db: world.db, core: world.core, manifest: itemManifest });
    const user = world.core.users.getByUsername('member')!;
    grant(user.id, true, true);
    const client = await memberClient();

    const created = await client.inject('POST', '/api/modules/demo/item', { title: 'Чайник' });
    const id = (created.json() as { item: { id: number } }).item.id;

    const bad = await client.inject('PATCH', `/api/modules/demo/item/${id}`, { nextDue: 'нет' });
    expect(bad.statusCode).toBe(400);

    const unknown = await client.inject('PATCH', `/api/modules/demo/item/${id}`, { nope: 1 });
    expect(unknown.statusCode).toBe(400);
  });

  it('sorts by defaultSort from the manifest', async () => {
    await mountModule(world.app, { db: world.db, core: world.core, manifest: itemManifest });
    const user = world.core.users.getByUsername('member')!;
    grant(user.id, true, true);
    const client = await memberClient();

    await client.inject('POST', '/api/modules/demo/item', { title: 'B', nextDue: '2026-10-01' });
    await client.inject('POST', '/api/modules/demo/item', { title: 'A', nextDue: '2026-05-01' });

    const res = await client.inject('GET', '/api/modules/demo/item');
    const items = (res.json() as { items: Array<{ title: string }> }).items;
    expect(items.map((i) => i.title)).toEqual(['A', 'B']);
  });

  it('exposes ctx.route for code modules with the same guard', async () => {
    await mountModule(world.app, {
      db: world.db,
      core: world.core,
      manifest: itemManifest,
      register: (app, ctx) => {
        ctx.route({ method: 'GET', path: '/stats', action: 'read' }, async (_req, reply) => {
          return reply.send({ count: 42 });
        });
      },
    });

    const noAccess = await memberClient();
    const denied = await noAccess.inject('GET', '/api/modules/demo/stats');
    expect(denied.statusCode).toBe(403);

    const user = world.core.users.getByUsername('member')!;
    grant(user.id, true, false);
    const allowed = await memberClient();
    const ok = await allowed.inject('GET', '/api/modules/demo/stats');
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ count: 42 });
  });

  it('registers modules from disk and isolates broken ones', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'domo-modules-'));
    try {
      mkdirSync(join(dir, 'demo'));
      writeFileSync(
        join(dir, 'demo', 'manifest.json'),
        JSON.stringify(itemManifest),
        'utf8',
      );

      mkdirSync(join(dir, 'broken-code'));
      const brokenManifest: ModuleManifest = {
        id: 'broken-code',
        name: 'Битый',
        description: '',
        kind: 'code',
        entities: [],
      };
      writeFileSync(join(dir, 'broken-code', 'manifest.json'), JSON.stringify(brokenManifest), 'utf8');

      mkdirSync(join(dir, 'bad-json'));
      writeFileSync(join(dir, 'bad-json', 'manifest.json'), '{ not json', 'utf8');

      const codeLoader = (id: string): CodeModuleRegister | undefined => {
        if (id === 'broken-code') {
          return () => {
            throw new Error('code module crashed');
          };
        }
        return undefined;
      };

      await registerModulesFromDisk(world.app, {
        db: world.db,
        core: world.core,
        modulesDir: dir,
        codeLoader,
      });

      const broken = world.db
        .prepare('SELECT status, error FROM modules WHERE id = ?')
        .get('broken-code') as { status: string; error: string };
      expect(broken.status).toBe('broken');
      expect(broken.error).toContain('code module crashed');

      const active = world.db
        .prepare('SELECT status FROM modules WHERE id = ?')
        .get('demo') as { status: string };
      expect(active.status).toBe('active');

      const user = world.core.users.getByUsername('member')!;
      grant(user.id, true, true);
      const client = await memberClient();
      const res = await client.inject('GET', '/api/modules/demo/manifest');
      expect(res.statusCode).toBe(200);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
