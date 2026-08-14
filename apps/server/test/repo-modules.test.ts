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
  await world.core.users.create({ username: 'member', password: 'secret123', authMode: 'password' });
});

afterEach(async () => {
  await world.close();
});

function grant(userId: number, canRead: boolean, canWrite: boolean): void {
  const group = world.core.groups.create({ name: `repo-${userId}-${canRead}-${canWrite}` });
  world.core.groups.addMember(group.id, userId);
  world.core.grants.set(group.id, REFERENCE_ID, { canRead, canWrite });
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
    grant(user.id, true, true);
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
});
