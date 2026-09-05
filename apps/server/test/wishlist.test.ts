import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { validateManifest } from '@perepelkin-home/core';
import { createTestWorld, Client, type TestWorld } from './helpers.js';
import { mountModule } from '../src/modules/host.js';
import wishlistModule from '@perepelkin-home/module-wishlist';

const manifest = validateManifest(
  JSON.parse(
    readFileSync(fileURLToPath(new URL('../../../modules/wishlist/manifest.json', import.meta.url)), 'utf8'),
  ),
);

let world: TestWorld;
let guest: number;
let other: number;
let client: Client;

async function createGift(payload: Record<string, unknown>): Promise<number> {
  const res = await client.inject('POST', '/api/modules/wishlist/gift', payload);
  expect(res.statusCode).toBe(201);
  return (res.json() as { item: { id: number } }).item.id;
}

function grantFor(userId: number, canWrite = true): void {
  const group = world.core.groups.create({ name: `wish-grant-${userId}-${canWrite ? 'w' : 'r'}` });
  world.core.groups.addMember(group.id, userId);
  world.core.grants.set(group.id, 'wishlist', { canRead: true, canWrite });
}

beforeEach(async () => {
  world = await createTestWorld();
  await world.core.users.create({ username: 'member', password: 'secret123' });
  await world.core.users.create({ username: 'guest', pin: '135790' });
  await world.core.users.create({ username: 'other', pin: '246801' });
  guest = world.core.users.getByUsername('guest')!.id;
  other = world.core.users.getByUsername('other')!.id;
  grantFor(world.core.users.getByUsername('member')!.id, true);

  await mountModule(world.app, {
    db: world.db,
    core: world.core,
    manifest,
    register: (moduleApp, ctx) => wishlistModule(moduleApp, ctx, world.db),
  });

  client = new Client(world.app);
  await client.login('member', 'secret123');
});

afterEach(async () => {
  await world.close();
});

describe('wishlist module', () => {
  it('is public-read: anonymous users can list gifts without a session', async () => {
    const id = await createGift({ name: 'Настольная игра' });
    const anonymous = new Client(world.app);
    const res = await anonymous.inject('GET', '/api/modules/wishlist/gift');
    expect(res.statusCode).toBe(200);
    const items = (res.json() as { items: Array<{ id: number; reserved_by_name: string | null }> }).items;
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe(id);
    expect(items[0]!.reserved_by_name).toBeNull();
  });

  it('blocks writes without write rights', async () => {
    await world.core.users.create({ username: 'reader', password: 'secret123' });
    const readerId = world.core.users.getByUsername('reader')!.id;
    const group = world.core.groups.create({ name: 'wish-grant-reader-r' });
    world.core.groups.addMember(group.id, readerId);
    world.core.grants.set(group.id, 'wishlist', { canRead: true, canWrite: false });
    const reader = new Client(world.app);
    await reader.login('reader', 'secret123');
    const res = await reader.inject('POST', '/api/modules/wishlist/gift', { name: 'x' });
    expect(res.statusCode).toBe(403);
  });

  it('rejects booking without credentials', async () => {
    const id = await createGift({ name: 'Кружка' });
    const res = await new Client(world.app).inject('POST', `/api/modules/wishlist/gift/${id}/book`, {});
    expect(res.statusCode).toBe(400);
  });

  it('rejects booking with a wrong pin', async () => {
    const id = await createGift({ name: 'Кружка' });
    const res = await new Client(world.app).inject('POST', `/api/modules/wishlist/gift/${id}/book`, {
      username: 'guest',
      pin: '000000',
    });
    expect(res.statusCode).toBe(401);
    expect((res.json() as { error: { code: string } }).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects booking with a wrong username', async () => {
    const id = await createGift({ name: 'Кружка' });
    const res = await new Client(world.app).inject('POST', `/api/modules/wishlist/gift/${id}/book`, {
      username: 'nobody',
      pin: '135790',
    });
    expect(res.statusCode).toBe(401);
  });

  it('books a gift with a valid login and pin, visible on public listing', async () => {
    const id = await createGift({ name: 'Кружка' });
    const res = await new Client(world.app).inject('POST', `/api/modules/wishlist/gift/${id}/book`, {
      username: 'guest',
      pin: '135790',
    });
    expect(res.statusCode).toBe(200);
    const item = (res.json() as { item: { reserved_by_name: string | null; assigned: boolean } }).item;
    expect(item.reserved_by_name).toBe('guest');
    expect(item.assigned).toBe(false);

    const listed = await new Client(world.app).inject('GET', '/api/modules/wishlist/gift');
    const items = (listed.json() as { items: Array<{ id: number; reserved_by_name: string | null }> }).items;
    expect(items.find((g) => g.id === id)?.reserved_by_name).toBe('guest');
  });

  it('keeps internal platform ids and family logins out of the public list', async () => {
    const id = await createGift({ name: 'Кружка' });
    const anonymous = new Client(world.app);
    await anonymous.inject('POST', `/api/modules/wishlist/gift/${id}/book`, { username: 'guest', pin: '135790' });
    const res = await anonymous.inject('GET', '/api/modules/wishlist/gift');
    const items = (res.json() as { items: Array<Record<string, unknown>> }).items;
    const item = items[0]!;
    expect(item.id).toBe(id);
    expect(item.reserved_by_name).toBe('guest');
    expect(item.assigned).toBe(false);
    expect(item).not.toHaveProperty('created_by');
    expect(item).not.toHaveProperty('created_by_username');
    expect(item).not.toHaveProperty('reserved_by');
    expect(item).not.toHaveProperty('reserved_at');
  });

  it('rejects a second booking of the same gift', async () => {
    const id = await createGift({ name: 'Кружка' });
    const anonymous = new Client(world.app);
    await anonymous.inject('POST', `/api/modules/wishlist/gift/${id}/book`, { username: 'guest', pin: '135790' });
    const res = await anonymous.inject('POST', `/api/modules/wishlist/gift/${id}/book`, {
      username: 'other',
      pin: '246801',
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: { code: string } }).error.code).toBe('ALREADY_BOOKED');
  });

  it('allows only the booker to unbook', async () => {
    const id = await createGift({ name: 'Кружка' });
    const anonymous = new Client(world.app);
    await anonymous.inject('POST', `/api/modules/wishlist/gift/${id}/book`, { username: 'guest', pin: '135790' });

    const byOther = await anonymous.inject('POST', `/api/modules/wishlist/gift/${id}/unbook`, {
      username: 'other',
      pin: '246801',
    });
    expect(byOther.statusCode).toBe(403);
    expect((byOther.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');

    const byOwner = await anonymous.inject('POST', `/api/modules/wishlist/gift/${id}/unbook`, {
      username: 'guest',
      pin: '135790',
    });
    expect(byOwner.statusCode).toBe(200);
    const item = (byOwner.json() as { item: { reserved_by_name: string | null } }).item;
    expect(item.reserved_by_name).toBeNull();
  });

  it('rejects unbooking a gift that is not booked', async () => {
    const id = await createGift({ name: 'Кружка' });
    const res = await new Client(world.app).inject('POST', `/api/modules/wishlist/gift/${id}/unbook`, {
      username: 'guest',
      pin: '135790',
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: { code: string } }).error.code).toBe('NOT_BOOKED');
  });

  it('rejects booking and unbooking of a nonexistent gift', async () => {
    const anonymous = new Client(world.app);
    const booked = await anonymous.inject('POST', '/api/modules/wishlist/gift/999/book', {
      username: 'guest',
      pin: '135790',
    });
    expect(booked.statusCode).toBe(404);
    const unbooked = await anonymous.inject('POST', '/api/modules/wishlist/gift/999/unbook', {
      username: 'guest',
      pin: '135790',
    });
    expect(unbooked.statusCode).toBe(404);
  });

  it('shares one rate-limit budget between book and unbook', async () => {
    const id = await createGift({ name: 'Кружка' });
    const anonymous = new Client(world.app);
    let status = 0;
    for (let i = 0; i < 15; i += 1) {
      status = (
        await anonymous.inject('POST', `/api/modules/wishlist/gift/${id}/unbook`, {
          username: 'guest',
          pin: '135790',
        })
      ).statusCode;
    }
    for (let i = 0; i < 16; i += 1) {
      status = (
        await anonymous.inject('POST', `/api/modules/wishlist/gift/${id}/book`, {
          username: 'guest',
          pin: '135790',
        })
      ).statusCode;
    }
    expect(status).toBe(429);
  });

  it('drops reservations when the booking user is deleted', async () => {
    const id = await createGift({ name: 'Кружка' });
    const anonymous = new Client(world.app);
    const booked = await anonymous.inject('POST', `/api/modules/wishlist/gift/${id}/book`, {
      username: 'guest',
      pin: '135790',
    });
    expect(booked.statusCode).toBe(200);

    world.core.users.delete(guest);

    const listed = await anonymous.inject('GET', '/api/modules/wishlist/gift');
    const items = (listed.json() as { items: Array<{ reserved_by_name: string | null }> }).items;
    expect(items[0]!.reserved_by_name).toBeNull();

    const rebook = await anonymous.inject('POST', `/api/modules/wishlist/gift/${id}/book`, {
      username: 'other',
      pin: '246801',
    });
    expect(rebook.statusCode).toBe(200);
  });

  it('keeps admin-assigned bookings when the assigning admin is deleted', async () => {
    const id = await createGift({ name: 'Кружка' });
    await client.inject('POST', `/api/modules/wishlist/gift/${id}/assign`, { name: 'Тётя Галя' });
    const memberId = world.core.users.getByUsername('member')!.id;
    world.core.users.delete(memberId);

    const listed = await new Client(world.app).inject('GET', '/api/modules/wishlist/gift');
    const items = (listed.json() as { items: Array<{ reserved_by_name: string | null }> }).items;
    expect(items[0]!.reserved_by_name).toBe('Тётя Галя');
  });

  it('deleting a gift removes its reservation', async () => {
    const id = await createGift({ name: 'Кружка' });
    const anonymous = new Client(world.app);
    await anonymous.inject('POST', `/api/modules/wishlist/gift/${id}/book`, { username: 'guest', pin: '135790' });

    const del = await client.inject('DELETE', `/api/modules/wishlist/gift/${id}`);
    expect(del.statusCode).toBe(204);

    const again = await anonymous.inject('POST', '/api/modules/wishlist/gift/999/book', {
      username: 'guest',
      pin: '135790',
    });
    expect(again.statusCode).toBe(404);
  });

  it('assigns a guest name to a free gift as the logged-in admin', async () => {
    const id = await createGift({ name: 'Кружка' });
    const memberId = world.core.users.getByUsername('member')!.id;
    const res = await client.inject('POST', `/api/modules/wishlist/gift/${id}/assign`, { name: 'Тётя Галя' });
    expect(res.statusCode).toBe(200);
    const item = (res.json() as { item: { reserved_by: number | null; reserved_by_name: string | null; assigned: boolean } }).item;
    expect(item.reserved_by).toBe(memberId);
    expect(item.reserved_by_name).toBe('Тётя Галя');
    expect(item.assigned).toBe(true);

    const listed = await client.inject('GET', '/api/modules/wishlist/gift');
    const items = (listed.json() as { items: Array<{ id: number; reserved_by_name: string | null }> }).items;
    expect(items.find((g) => g.id === id)?.reserved_by_name).toBe('Тётя Галя');
  });

  it('rejects a blank, oversized or extra-field guest name', async () => {
    const id = await createGift({ name: 'Кружка' });
    for (const payload of [
      { name: '' },
      { name: '   ' },
      { name: 'x'.repeat(65) },
      { name: 'Тётя', extra: 1 },
    ]) {
      const res = await client.inject('POST', `/api/modules/wishlist/gift/${id}/assign`, payload);
      expect(res.statusCode).toBe(400);
    }
  });

  it('rejects assigning an already claimed gift', async () => {
    const id = await createGift({ name: 'Кружка' });
    const anonymous = new Client(world.app);
    await anonymous.inject('POST', `/api/modules/wishlist/gift/${id}/book`, { username: 'guest', pin: '135790' });
    const res = await client.inject('POST', `/api/modules/wishlist/gift/${id}/assign`, { name: 'Тётя Галя' });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: { code: string } }).error.code).toBe('ALREADY_BOOKED');
  });

  it('rejects assigning a nonexistent gift', async () => {
    const res = await client.inject('POST', '/api/modules/wishlist/gift/999/assign', { name: 'Тётя Галя' });
    expect(res.statusCode).toBe(404);
  });

  it('blocks assigning for a read-only user', async () => {
    const id = await createGift({ name: 'Кружка' });
    await world.core.users.create({ username: 'reader', password: 'secret123' });
    const readerId = world.core.users.getByUsername('reader')!.id;
    const group = world.core.groups.create({ name: 'wish-grant-reader-ro' });
    world.core.groups.addMember(group.id, readerId);
    world.core.grants.set(group.id, 'wishlist', { canRead: true, canWrite: false });
    const reader = new Client(world.app);
    await reader.login('reader', 'secret123');
    const res = await reader.inject('POST', `/api/modules/wishlist/gift/${id}/assign`, { name: 'Тётя Галя' });
    expect(res.statusCode).toBe(403);
  });

  it('releases a booking placed by the admin', async () => {
    const id = await createGift({ name: 'Кружка' });
    await client.inject('POST', `/api/modules/wishlist/gift/${id}/assign`, { name: 'Тётя Галя' });
    const res = await client.inject('POST', `/api/modules/wishlist/gift/${id}/release`);
    expect(res.statusCode).toBe(200);
    const item = (res.json() as { item: { reserved_by: number | null; reserved_by_name: string | null; assigned: boolean } }).item;
    expect(item.reserved_by).toBeNull();
    expect(item.reserved_by_name).toBeNull();
    expect(item.assigned).toBe(false);
  });

  it('releases a booking placed by a login user', async () => {
    const id = await createGift({ name: 'Кружка' });
    const anonymous = new Client(world.app);
    await anonymous.inject('POST', `/api/modules/wishlist/gift/${id}/book`, { username: 'guest', pin: '135790' });
    const res = await client.inject('POST', `/api/modules/wishlist/gift/${id}/release`);
    expect(res.statusCode).toBe(200);
  });

  it('rejects releasing a gift that nobody claimed', async () => {
    const id = await createGift({ name: 'Кружка' });
    const res = await client.inject('POST', `/api/modules/wishlist/gift/${id}/release`);
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: { code: string } }).error.code).toBe('NOT_BOOKED');
  });

  it('keeps admin-assigned bookings from being unbooked by login users', async () => {
    const id = await createGift({ name: 'Кружка' });
    await client.inject('POST', `/api/modules/wishlist/gift/${id}/assign`, { name: 'Тётя Галя' });
    const res = await new Client(world.app).inject('POST', `/api/modules/wishlist/gift/${id}/unbook`, {
      username: 'guest',
      pin: '135790',
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');
  });

  it('reports a useful summary and exposes reserved_by for managed view', async () => {
    await createGift({ name: 'Кружка' });
    const res = await client.inject('GET', '/api/modules/wishlist/summary');
    expect(res.statusCode).toBe(200);
    const body = res.json() as { count: number; status: string };
    expect(body.count).toBe(1);
    expect(body.status).toContain('1 идея');
  });
});