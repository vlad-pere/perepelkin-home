import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import { createTestWorld, Client, type TestWorld } from './helpers.js';
import { loadManifests } from '../src/modules/loader.js';
import { mountModule } from '../src/modules/host.js';

const MODULES_DIR = fileURLToPath(new URL('../../../modules/', import.meta.url));
const REFERENCE_ID = 'todo';

let world: TestWorld;

beforeEach(async () => {
  world = await createTestWorld();
  await world.core.users.create({ username: 'member', password: 'secret123' });
});

afterEach(async () => {
  await world.close();
});

function grant(world: TestWorld, userId: number, canRead: boolean, canWrite: boolean, moduleId = REFERENCE_ID): void {
  const group = world.core.groups.create({ name: `repo-${userId}-${canRead}-${canWrite}-${moduleId}` });
  world.core.groups.addMember(group.id, userId);
  world.core.grants.set(group.id, moduleId, { canRead, canWrite });
}

describe('repo modules', () => {
  it('loads every manifest from modules/ without errors and includes the reference todo module', () => {
    const { modules, errors } = loadManifests(MODULES_DIR);
    expect(errors).toEqual([]);
    const todo = modules.find((m) => m.id === REFERENCE_ID);
    expect(todo).toBeDefined();
    expect(todo!.kind).toBe('simple');
    expect(todo!.entities.map((e) => e.name)).toEqual(['task']);
  });

  it('mounts the reference todo module from modules/ and runs CRUD', async () => {
    const { modules, errors } = loadManifests(MODULES_DIR);
    expect(errors).toEqual([]);
    const manifest = modules.find((m) => m.id === REFERENCE_ID);
    expect(manifest).toBeDefined();
    expect(manifest!.kind).toBe('simple');

    await mountModule(world.app, { db: world.db, core: world.core, manifest: manifest! });
    const user = world.core.users.getByUsername('member')!;
    grant(world, user.id, true, true);
    const client = new Client(world.app);
    await client.login('member', 'secret123');

    const created = await client.inject('POST', '/api/modules/todo/task', {
      title: 'Собрать коробки',
      done: false,
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { item: { id: number } }).item.id;

    const toggled = await client.inject('PATCH', `/api/modules/todo/task/${id}`, { done: true });
    expect(toggled.statusCode).toBe(200);
    expect((toggled.json() as { item: { done: boolean } }).item.done).toBe(true);

    const listed = await client.inject('GET', '/api/modules/todo/task');
    expect(listed.statusCode).toBe(200);
    expect((listed.json() as { items: unknown[] }).items).toHaveLength(1);

    const deleted = await client.inject('DELETE', `/api/modules/todo/task/${id}`);
    expect(deleted.statusCode).toBe(204);
  });

  it('wishlist module is public-read and write-guarded', async () => {
    const { modules, errors } = loadManifests(MODULES_DIR);
    expect(errors).toEqual([]);
    const manifest = modules.find((m) => m.id === 'wishlist');
    expect(manifest).toBeDefined();
    expect(manifest!.kind).toBe('code');
    expect(manifest!.publicRead).toBe(true);

    const { default: wishlistModule } = await import('@perepelkin-home/module-wishlist');
    await mountModule(world.app, {
      db: world.db,
      core: world.core,
      manifest: manifest!,
      register: (moduleApp, ctx) => wishlistModule(moduleApp, ctx, world.db),
    });

    const anonymous = new Client(world.app);
    const listed = await anonymous.inject('GET', '/api/modules/wishlist/gift');
    expect(listed.statusCode).toBe(200);

    const user = world.core.users.getByUsername('member')!;
    grant(world, user.id, true, true, 'wishlist');
    const client = new Client(world.app);
    await client.login('member', 'secret123');
    const created = await client.inject('POST', '/api/modules/wishlist/gift', {
      name: 'Чайник',
      description: 'Для новоселья',
      link: 'https://example.com/teapot',
      category: 'Новоселье',
    });
    expect(created.statusCode).toBe(201);
  });

  it('diary module mounts and supports CRUD plus file upload/serve/delete', async () => {
    const { modules, errors } = loadManifests(MODULES_DIR);
    expect(errors).toEqual([]);
    const manifest = modules.find((m) => m.id === 'diary');
    expect(manifest).toBeDefined();
    expect(manifest!.kind).toBe('simple');
    expect(manifest!.entities.map((e) => e.name)).toEqual(['entry']);

    await mountModule(world.app, {
      db: world.db,
      core: world.core,
      manifest: manifest!,
      files: world.files,
    });
    const user = world.core.users.getByUsername('member')!;
    grant(world, user.id, true, true, 'diary');
    const client = new Client(world.app);
    await client.login('member', 'secret123');

    const uploaded = await client.inject(
      'POST',
      '/api/modules/diary/files?name=apple-tree.jpg',
      Buffer.from('яблоня', 'utf8'),
      { headers: { 'content-type': 'image/jpeg' } },
    );
    expect(uploaded.statusCode).toBe(201);
    const fileId = (uploaded.json() as { file: { id: string } }).file.id;

    const created = await client.inject('POST', '/api/modules/diary/entry', {
      date: '2026-08-16',
      title: 'Посадили яблоню',
      text: 'Купили саженец и посадили у забора.',
      mood: '😊',
      category: 'Сад и двор',
      photos: JSON.stringify([fileId]),
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { item: { id: number } }).item.id;

    const served = await client.inject('GET', `/api/modules/diary/files/${fileId}`);
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toBe('image/jpeg');
    expect(served.rawPayload.toString('utf8')).toBe('яблоня');

    const listed = await client.inject('GET', '/api/modules/diary/entry');
    expect(listed.statusCode).toBe(200);
    expect((listed.json() as { items: unknown[] }).items).toHaveLength(1);

    const patched = await client.inject('PATCH', `/api/modules/diary/entry/${id}`, {
      text: 'Посадили две яблони.',
      photos: JSON.stringify([]),
    });
    expect(patched.statusCode).toBe(200);

    const removed = await client.inject('DELETE', `/api/modules/diary/files/${fileId}`);
    expect(removed.statusCode).toBe(204);

    const gone = await client.inject('GET', `/api/modules/diary/files/${fileId}`);
    expect(gone.statusCode).toBe(404);
  });

  it('shopping module mounts and allows unrated backlog ideas', async () => {
    const { modules, errors } = loadManifests(MODULES_DIR);
    expect(errors).toEqual([]);
    const manifest = modules.find((m) => m.id === 'shopping');
    expect(manifest).toBeDefined();
    expect(manifest!.kind).toBe('simple');
    expect(manifest!.entities.map((e) => e.name)).toEqual(['item']);

    await mountModule(world.app, { db: world.db, core: world.core, manifest: manifest! });
    const user = world.core.users.getByUsername('member')!;
    grant(world, user.id, true, true, 'shopping');
    const client = new Client(world.app);
    await client.login('member', 'secret123');

    const created = await client.inject('POST', '/api/modules/shopping/item', {
      title: 'Стиральная машина',
      status: 1,
      reach: 5,
      impact: 5,
      confidence: 5,
      complexity: 3,
      price: 45000,
      link: 'https://example.com/washer',
      comment: 'С сушкой не обязательно',
    });
    expect(created.statusCode).toBe(201);
    const id = (created.json() as { item: { id: number } }).item.id;

    const backlogIdea = await client.inject('POST', '/api/modules/shopping/item', {
      title: 'Ковер',
      status: 1,
    });
    expect(backlogIdea.statusCode).toBe(201);
    const backlogId = (backlogIdea.json() as { item: { id: number } }).item.id;
    expect(backlogId).not.toBe(id);

    const planned = await client.inject('PATCH', `/api/modules/shopping/item/${id}`, {
      status: 2,
    });
    expect(planned.statusCode).toBe(200);
    expect((planned.json() as { item: { status: number } }).item.status).toBe(2);

    const listed = await client.inject('GET', '/api/modules/shopping/item');
    expect(listed.statusCode).toBe(200);
    expect((listed.json() as { items: unknown[] }).items).toHaveLength(2);

    const removedIdea = await client.inject('DELETE', `/api/modules/shopping/item/${backlogId}`);
    expect(removedIdea.statusCode).toBe(204);

    const deleted = await client.inject('DELETE', `/api/modules/shopping/item/${id}`);
    expect(deleted.statusCode).toBe(204);
  });

  it('shopping module rebuilds a legacy NOT NULL table to match the manifest', async () => {
    const { modules, errors } = loadManifests(MODULES_DIR);
    expect(errors).toEqual([]);
    const manifest = modules.find((m) => m.id === 'shopping')!;

    world.db.exec(`CREATE TABLE module_shopping_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      status REAL NOT NULL,
      reach REAL NOT NULL,
      impact REAL NOT NULL,
      confidence REAL NOT NULL,
      cost REAL NOT NULL,
      complexity REAL NOT NULL,
      price REAL,
      link TEXT,
      comment TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`);
    world.db
      .prepare(
        `INSERT INTO module_shopping_item (title, status, reach, impact, confidence, cost, complexity, price)
         VALUES ('Старая покупка', 1, 4, 4, 4, 2, 2, 1000)`,
      )
      .run();

    await mountModule(world.app, { db: world.db, core: world.core, manifest });
    const user = world.core.users.getByUsername('member')!;
    grant(world, user.id, true, true, 'shopping');
    const client = new Client(world.app);
    await client.login('member', 'secret123');

    const idea = await client.inject('POST', '/api/modules/shopping/item', {
      title: 'Свежая идея',
      status: 1,
    });
    expect(idea.statusCode).toBe(201);

    const listed = await client.inject('GET', '/api/modules/shopping/item');
    expect(listed.statusCode).toBe(200);
    const items = (listed.json() as { items: Array<Record<string, unknown>> }).items;
    expect(items).toHaveLength(2);
    const legacy = items.find((i) => i.title === 'Старая покупка');
    expect(legacy).toMatchObject({ reach: 4, impact: 4, confidence: 4, complexity: 2, price: 1000 });
    expect(legacy).not.toHaveProperty('cost');
    const fresh = items.find((i) => i.title === 'Свежая идея');
    expect(fresh?.reach ?? null).toBeFalsy();
  });

  it('logs who creates records in simple modules', async () => {
    const captured: Array<Record<string, unknown>> = [];
    const stream = {
      write(chunk: string): void {
        try {
          captured.push(JSON.parse(chunk) as Record<string, unknown>);
        } catch {
          /* служебные строки pino пропускаем */
        }
      },
    };
    const logWorld = await createTestWorld({ logger: { level: 'info', stream } });
    try {
      const { modules, errors } = loadManifests(MODULES_DIR);
      expect(errors).toEqual([]);
      const manifest = modules.find((m) => m.id === REFERENCE_ID);
      expect(manifest).toBeDefined();

      await mountModule(logWorld.app, { db: logWorld.db, core: logWorld.core, manifest: manifest! });
      await logWorld.core.users.create({ username: 'member', password: 'secret123' });
      const user = logWorld.core.users.getByUsername('member')!;
      grant(logWorld, user.id, true, true);
      const client = new Client(logWorld.app);
      await client.login('member', 'secret123');

      const created = await client.inject('POST', '/api/modules/todo/task', {
        title: 'Купить корм',
        done: false,
      });
      expect(created.statusCode).toBe(201);
      const createdItem = (created.json() as { item: { id: number; created_by_username: string | null } }).item;
      expect(createdItem.created_by_username).toBe('member');
      const recordId = createdItem.id;

      const listed = await client.inject('GET', '/api/modules/todo/task');
      const listedItem = (listed.json() as { items: Array<{ id: number; created_by_username: string | null }> })
        .items.find((r) => r.id === recordId);
      expect(listedItem?.created_by_username).toBe('member');

      const log = captured.find((l) => l.msg === 'record created');
      expect(log).toBeDefined();
      expect(log?.module).toBe('todo');
      expect(log?.entity).toBe('task');
      expect(log?.recordId).toBe(recordId);
      expect(log?.username).toBe('member');
      expect(log?.userId).toBe(user.id);
    } finally {
      await logWorld.close();
    }
  });
});
