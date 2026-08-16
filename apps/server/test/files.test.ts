import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createTestWorld, Client, type TestWorld } from './helpers.js';
import { mountModule } from '../src/modules/host.js';
import type { ModuleManifest } from '@perepelkin-home/core';

const photoManifest: ModuleManifest = {
  id: 'photos',
  name: 'Фото',
  description: 'Проверка файлов',
  kind: 'simple',
  entities: [
    {
      name: 'item',
      label: 'Вещь',
      fields: [{ name: 'title', label: 'Название', type: 'text', required: true }],
    },
  ],
};

const otherManifest: ModuleManifest = {
  id: 'other',
  name: 'Другое',
  description: 'Изоляция файлов',
  kind: 'simple',
  entities: [
    {
      name: 'item',
      label: 'Вещь',
      fields: [{ name: 'title', label: 'Название', type: 'text', required: true }],
    },
  ],
};

let world: TestWorld;

beforeEach(async () => {
  world = await createTestWorld();
  await world.core.users.create({ username: 'member', password: 'secret123' });
  await world.core.users.create({ username: 'reader', password: 'secret123' });
});

afterEach(async () => {
  await world.close();
});

function grant(
  userId: number,
  canRead: boolean,
  canWrite: boolean,
  moduleId = 'photos',
): void {
  const group = world.core.groups.create({ name: `files-${userId}-${canRead}-${canWrite}-${moduleId}` });
  world.core.groups.addMember(group.id, userId);
  world.core.grants.set(group.id, moduleId, { canRead, canWrite });
}

async function mount(): Promise<void> {
  await mountModule(world.app, {
    db: world.db,
    core: world.core,
    manifest: photoManifest,
    files: world.files,
  });
}

async function writerClient(): Promise<Client> {
  const client = new Client(world.app);
  await client.login('member', 'secret123');
  return client;
}

async function readerClient(): Promise<Client> {
  const client = new Client(world.app);
  await client.login('reader', 'secret123');
  return client;
}

function upload(
  client: Client,
  url = '/api/modules/photos/files?name=house.jpg',
  data: Buffer = Buffer.from('фото-байты', 'utf8'),
  headers: Record<string, string> = { 'content-type': 'image/jpeg' },
) {
  return client.inject('POST', url, data, { headers });
}

describe('module files', () => {
  it('rejects anonymous upload', async () => {
    await mount();
    const res = await upload(new Client(world.app));
    expect(res.statusCode).toBe(401);
  });

  it('rejects upload without a write grant', async () => {
    await mount();
    const user = world.core.users.getByUsername('reader')!;
    grant(user.id, true, false);
    const res = await upload(await readerClient());
    expect(res.statusCode).toBe(403);
  });

  it('uploads and serves a file with the original mime and name', async () => {
    await mount();
    const user = world.core.users.getByUsername('member')!;
    grant(user.id, true, true);
    const client = await writerClient();

    const created = await upload(client, '/api/modules/photos/files?name=Летний%20двор.jpg');
    expect(created.statusCode).toBe(201);
    const body = created.json() as {
      file: { id: string; mime: string; name: string; size: number; moduleId: string };
    };
    expect(body.file.mime).toBe('image/jpeg');
    expect(body.file.name).toBe('Летний двор.jpg');
    expect(body.file.moduleId).toBe('photos');
    expect(body.file.size).toBe(Buffer.byteLength('фото-байты', 'utf8'));

    const served = await client.inject('GET', `/api/modules/photos/files/${body.file.id}`);
    expect(served.statusCode).toBe(200);
    expect(served.headers['content-type']).toBe('image/jpeg');
    expect(served.headers['cache-control']).toContain('immutable');
    expect(served.rawPayload.toString('utf8')).toBe('фото-байты');
  });

  it('rejects a disallowed mime type', async () => {
    await mount();
    const user = world.core.users.getByUsername('member')!;
    grant(user.id, true, true);
    const res = await upload(
      await writerClient(),
      '/api/modules/photos/files?name=x.svg',
      Buffer.from('<svg></svg>', 'utf8'),
      { 'content-type': 'image/svg+xml' },
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects a text/plain upload', async () => {
    await mount();
    const user = world.core.users.getByUsername('member')!;
    grant(user.id, true, true);
    const res = await upload(
      await writerClient(),
      '/api/modules/photos/files?name=x.txt',
      Buffer.from('hello', 'utf8'),
      { 'content-type': 'text/plain' },
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects an empty body', async () => {
    await mount();
    const user = world.core.users.getByUsername('member')!;
    grant(user.id, true, true);
    const res = await upload(await writerClient(), '/api/modules/photos/files', Buffer.alloc(0));
    expect(res.statusCode).toBe(400);
  });

  it('rejects a file larger than the configured limit', async () => {
    await mount();
    const user = world.core.users.getByUsername('member')!;
    grant(user.id, true, true);
    const res = await upload(
      await writerClient(),
      '/api/modules/photos/files?name=big.jpg',
      Buffer.alloc(world.files.maxFileSize + 1),
    );
    expect(res.statusCode).toBe(413);
  });

  it('requires a read grant to serve a file', async () => {
    await mount();
    const user = world.core.users.getByUsername('member')!;
    grant(user.id, true, true);
    const client = await writerClient();
    const created = await upload(client);
    const id = (created.json() as { file: { id: string } }).file.id;

    const stranger = await readerClient();
    const denied = await stranger.inject('GET', `/api/modules/photos/files/${id}`);
    expect(denied.statusCode).toBe(403);

    grant(user.id, true, false);
    grant(world.core.users.getByUsername('reader')!.id, true, false);
    const allowed = await readerClient();
    const ok = await allowed.inject('GET', `/api/modules/photos/files/${id}`);
    expect(ok.statusCode).toBe(200);
  });

  it('returns 404 for a missing or unknown file id', async () => {
    await mount();
    const user = world.core.users.getByUsername('member')!;
    grant(user.id, true, true);
    const client = await writerClient();

    const missing = await client.inject('GET', '/api/modules/photos/files/00000000-0000-4000-8000-000000000000');
    expect(missing.statusCode).toBe(404);

    const bogus = await client.inject('GET', '/api/modules/photos/files/../../etc/passwd');
    expect(bogus.statusCode).toBe(404);
  });

  it('isolates files between modules', async () => {
    await mount();
    await mountModule(world.app, {
      db: world.db,
      core: world.core,
      manifest: otherManifest,
      files: world.files,
    });
    const user = world.core.users.getByUsername('member')!;
    grant(user.id, true, true);
    grant(user.id, true, true, 'other');
    const client = await writerClient();

    const created = await upload(client);
    const id = (created.json() as { file: { id: string } }).file.id;

    const foreign = await client.inject('GET', `/api/modules/other/files/${id}`);
    expect(foreign.statusCode).toBe(404);

    const own = await client.inject('GET', `/api/modules/photos/files/${id}`);
    expect(own.statusCode).toBe(200);
  });

  it('deletes a file; follow-up reads and deletes return 404', async () => {
    await mount();
    const user = world.core.users.getByUsername('member')!;
    grant(user.id, true, true);
    const client = await writerClient();

    const created = await upload(client);
    const id = (created.json() as { file: { id: string } }).file.id;

    const removed = await client.inject('DELETE', `/api/modules/photos/files/${id}`);
    expect(removed.statusCode).toBe(204);

    const gone = await client.inject('GET', `/api/modules/photos/files/${id}`);
    expect(gone.statusCode).toBe(404);

    const again = await client.inject('DELETE', `/api/modules/photos/files/${id}`);
    expect(again.statusCode).toBe(404);
  });

  it('read-only user cannot delete files', async () => {
    await mount();
    const user = world.core.users.getByUsername('member')!;
    grant(user.id, true, true);
    const client = await writerClient();
    const created = await upload(client);
    const id = (created.json() as { file: { id: string } }).file.id;

    grant(world.core.users.getByUsername('reader')!.id, true, false);
    const reader = await readerClient();
    const denied = await reader.inject('DELETE', `/api/modules/photos/files/${id}`);
    expect(denied.statusCode).toBe(403);
  });
});
