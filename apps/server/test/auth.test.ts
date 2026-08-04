import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client, createAdmin, createTestWorld, type TestWorld } from './helpers.js';
import { SESSION_COOKIE } from '../src/constants.js';

let world: TestWorld;

beforeEach(async () => {
  world = await createTestWorld();
  await createAdmin(world);
});

afterEach(async () => {
  await world.close();
});

describe('GET /api/auth/me', () => {
  it('возвращает 401 без сессии', async () => {
    const res = await world.app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('возвращает данные пользователя после входа', async () => {
    const client = new Client(world.app);
    const login = await client.login('admin', 'secret123');
    expect(login.statusCode).toBe(200);

    const me = await client.inject('GET', '/api/auth/me');
    expect(me.statusCode).toBe(200);
    const body = me.json();
    expect(body.user.username).toBe('admin');
    expect(body.user.isAdmin).toBe(true);
    expect(body.user).not.toHaveProperty('password_hash');
    expect(typeof body.csrfToken).toBe('string');
    expect(Array.isArray(body.modules)).toBe(true);
    expect(Array.isArray(body.groups)).toBe(true);
  });
});

describe('POST /api/auth/login', () => {
  it('отклоняет неизвестного пользователя тем же сообщением, что и неверный пароль', async () => {
    const client = new Client(world.app);
    const unknown = await client.login('nobody', 'wrongpass1');
    expect(unknown.statusCode).toBe(401);
    expect(unknown.json().error.code).toBe('INVALID_CREDENTIALS');
    expect(client.hasSession).toBe(false);
  });

  it('отклоняет неверный пароль', async () => {
    const client = new Client(world.app);
    const res = await client.login('admin', 'wrongpass1');
    expect(res.statusCode).toBe(401);
    expect(res.json().error.message).toMatch(/Неверное имя пользователя или пароль/);
  });

  it('устанавливает httpOnly-куку сессии и выдаёт CSRF-токен', async () => {
    const client = new Client(world.app);
    const res = await client.login('admin', 'secret123');
    expect(res.statusCode).toBe(200);
    const cookie = res.cookies.find((c) => c.name === SESSION_COOKIE);
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite?.toLowerCase()).toBe('lax');
    const body = res.json();
    expect(typeof body.csrfToken).toBe('string');
    expect(client.csrfToken).toBe(body.csrfToken);
  });

  it('валидирует тело запроса', async () => {
    const client = new Client(world.app);
    const res = await client.inject('POST', '/api/auth/login', { username: 'admin', password: 'short' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('ограничивает число попыток входа (rate limit)', async () => {
    const client = new Client(world.app);
    let last = null;
    for (let i = 0; i < 11; i++) {
      last = await client.login('admin', 'wrongpass1');
    }
    expect(last?.statusCode).toBe(429);
  });
});

describe('CSRF', () => {
  it('блокирует мутацию без CSRF-токена', async () => {
    const client = new Client(world.app);
    await client.login('admin', 'secret123');

    const res = await client.inject('POST', '/api/auth/logout', {}, { csrf: null });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('CSRF_FAILED');

    const me = await client.inject('GET', '/api/auth/me');
    expect(me.statusCode).toBe(200);
  });

  it('блокирует мутацию с неверным CSRF-токеном', async () => {
    const client = new Client(world.app);
    await client.login('admin', 'secret123');

    const res = await client.inject('POST', '/api/auth/logout', {}, { csrf: 'wrong' });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /api/auth/logout', () => {
  it('завершает сессию', async () => {
    const client = new Client(world.app);
    await client.login('admin', 'secret123');

    const res = await client.inject('POST', '/api/auth/logout');
    expect(res.statusCode).toBe(200);
    client.resetAuth();

    const me = await client.inject('GET', '/api/auth/me');
    expect(me.statusCode).toBe(401);
  });
});

describe('сессия', () => {
  it('истекает по истечении срока жизни', async () => {
    const expired = await createTestWorld({ sessionTtlMs: 0 });
    try {
      await createAdmin(expired);
      const client = new Client(expired.app);
      const login = await client.login('admin', 'secret123');
      expect(login.statusCode).toBe(200);

      const me = await client.inject('GET', '/api/auth/me');
      expect(me.statusCode).toBe(401);
    } finally {
      await expired.close();
    }
  });
});

describe('админ-доступ', () => {
  it('запрещает обычному пользователю админ-эндпоинты', async () => {
    await world.core.users.create({ username: 'member', password: 'secret123' });
    const client = new Client(world.app);
    await client.login('member', 'secret123');

    const res = await client.inject('GET', '/api/admin/users');
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });
});
