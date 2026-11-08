import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_APPEARANCE } from '@perepelkin-home/core';
import { createAdmin, createTestWorld, Client, type TestWorld } from './helpers.js';

let world: TestWorld;

beforeEach(async () => {
  world = await createTestWorld();
  await createAdmin(world);
});

afterEach(async () => {
  await world.close();
});

async function adminClient(): Promise<Client> {
  const client = new Client(world.app);
  await client.login('admin', 'secret123');
  return client;
}

const customAppearance = {
  ...DEFAULT_APPEARANCE,
  colors: { ...DEFAULT_APPEARANCE.colors, accent: '#a46331' },
};

describe('оформление', () => {
  it('GET /api/appearance публичный и до сохранения отдаёт значения по умолчанию', async () => {
    const anon = new Client(world.app);
    const res = await anon.inject('GET', '/api/appearance');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ appearance: DEFAULT_APPEARANCE, customized: false });
  });

  it('PUT требует администратора', async () => {
    const anon = new Client(world.app);
    const unauth = await anon.inject('PUT', '/api/admin/appearance', customAppearance);
    expect(unauth.statusCode).toBe(401);

    const admin = await adminClient();
    const created = await admin.inject('POST', '/api/admin/users', {
      username: 'petr',
      password: 'secret123',
    });
    expect(created.statusCode).toBe(201);
    const memberClient = new Client(world.app);
    await memberClient.login('petr', 'secret123');
    const forbidden = await memberClient.inject('PUT', '/api/admin/appearance', customAppearance);
    expect(forbidden.statusCode).toBe(403);
  });

  it('отклоняет некорректные цвета и ничего не сохраняет', async () => {
    const client = await adminClient();
    const bad = await client.inject('PUT', '/api/admin/appearance', {
      ...DEFAULT_APPEARANCE,
      colors: { ...DEFAULT_APPEARANCE.colors, accent: 'зелёный' },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.message).toContain('accent');

    const unknown = await client.inject('PUT', '/api/admin/appearance', {
      ...DEFAULT_APPEARANCE,
      fonts: { ...DEFAULT_APPEARANCE.fonts, display: 'comic-sans' },
    });
    expect(unknown.statusCode).toBe(400);

    // Неизвестные поля — ошибка клиента, а не данные «на выброс» (removeAdditional: false).
    const stale = await client.inject('PUT', '/api/admin/appearance', {
      ...DEFAULT_APPEARANCE,
      colors: { ...DEFAULT_APPEARANCE.colors, accentt: '#123456' },
    });
    expect(stale.statusCode).toBe(400);
    expect(stale.json().error.message).toContain('accentt');

    const res = await (new Client(world.app)).inject('GET', '/api/appearance');
    expect(res.json().customized).toBe(false);
  });

  it('сохраняет тему, читается публично и затем как настроенная', async () => {
    const client = await adminClient();
    const put = await client.inject('PUT', '/api/admin/appearance', customAppearance);
    expect(put.statusCode).toBe(200);
    expect(put.json().customized).toBe(true);
    expect(put.json().appearance.colors.accent).toBe('#a46331');

    const anon = new Client(world.app);
    const res = await anon.inject('GET', '/api/appearance');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ appearance: customAppearance, customized: true });
  });

  it('сохранение стандартной темы не считается «настроенной»', async () => {
    const client = await adminClient();
    await client.inject('PUT', '/api/admin/appearance', customAppearance);
    const reset = await client.inject('PUT', '/api/admin/appearance', DEFAULT_APPEARANCE);
    expect(reset.json().customized).toBe(false);
    const res = await new Client(world.app).inject('GET', '/api/appearance');
    expect(res.json().customized).toBe(false);
    expect(res.json().appearance).toEqual(DEFAULT_APPEARANCE);
  });

  it('перезапись возвращает находящееся в базе (не локальной памятью)', async () => {
    const client = await adminClient();
    await client.inject('PUT', '/api/admin/appearance', customAppearance);
    const second = { ...customAppearance, motion: 'minimal' } as const;
    const put = await client.inject('PUT', '/api/admin/appearance', second);
    expect(put.json().appearance.motion).toBe('minimal');
    expect(world.db.prepare('SELECT value FROM app_settings WHERE key = ?').get('appearance') !==
      undefined).toBe(true);
  });
});
