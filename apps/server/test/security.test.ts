import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestWorld, type TestWorld } from './helpers.js';

describe('security headers', () => {
  let world: TestWorld;

  beforeAll(async () => {
    world = await createTestWorld();
  });

  afterAll(async () => {
    await world.close();
  });

  it('применяет CSP без upgrade-insecure-requests', async () => {
    const res = await world.app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
    const csp = res.headers['content-security-policy'] as string;
    expect(csp).toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("img-src 'self'");
    // Директива из дефолта helmet ломает SPA на HTTP-стенде (скрипты поднимаются до https).
    expect(csp).not.toContain('upgrade-insecure-requests');
  });
});
