import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateManifest } from '@perepelkin-home/core';
import { createTestWorld, Client, type TestWorld } from './helpers.js';
import { mountModule } from '../src/modules/host.js';
import homeassistantModule from '@perepelkin-home/module-homeassistant';

const manifest = validateManifest(
  JSON.parse(
    readFileSync(fileURLToPath(new URL('../../../modules/homeassistant/manifest.json', import.meta.url)), 'utf8'),
  ),
);

interface CapturedRequest {
  method: string;
  url: string;
  auth?: string;
  body?: string;
}

/** Фейковый Home Assistant: записывает входящие запросы, отвечает на них скриптом. */
async function createFakeHa(states: unknown[]): Promise<{ server: Server; requests: CapturedRequest[]; url: string }> {
  const requests: CapturedRequest[] = [];
  const server = createServer((req: IncomingMessage, res) => {
    let raw = '';
    req.on('data', (chunk) => raw += chunk);
    req.on('end', () => {
      requests.push({
        method: req.method ?? '',
        url: req.url ?? '',
        auth: req.headers.authorization,
        body: raw || undefined,
      });
      if (req.url === '/api/states' && req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(states));
        return;
      }
      if (req.url?.startsWith('/api/services/') && req.method === 'POST') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('[]');
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  return { server, requests, url: `http://127.0.0.1:${address.port}` };
}

const HA_STATES: unknown[] = [
  { entity_id: 'light.living', state: 'on', attributes: { friendly_name: 'Свет в гостиной' } },
  { entity_id: 'switch.garage', state: 'off', attributes: { friendly_name: 'Розетка гаража' } },
  { entity_id: 'climate.bedroom', state: 'heat', attributes: { hvac_mode: 'heat', temperature: 22 } },
  { entity_id: 'sensor.temp', state: '21.5', attributes: { unit_of_measurement: '°C' } },
];

let world: TestWorld;
let fake: Awaited<ReturnType<typeof createFakeHa>>;
let client: Client;

async function mountHa(): Promise<void> {
  await mountModule(world.app, {
    db: world.db,
    core: world.core,
    manifest,
    register: (moduleApp, ctx) => homeassistantModule(moduleApp, ctx),
  });
}

beforeEach(async () => {
  world = await createTestWorld();
  await world.core.users.create({ username: 'member', password: 'secret123' });
  const user = world.core.users.getByUsername('member')!;
  const group = world.core.groups.create({ name: 'family' });
  world.core.groups.addMember(group.id, user.id);
  world.core.grants.set(group.id, 'homeassistant', { canRead: true, canWrite: true });

  fake = await createFakeHa(HA_STATES);
  process.env.HA_URL = fake.url;
  process.env.HA_TOKEN = 'llat-test-secret-token';
  await mountHa();

  client = new Client(world.app);
  await client.login('member', 'secret123');
});

afterEach(async () => {
  await world.close();
  await new Promise<void>((resolve) => fake.server.close(() => resolve()));
  delete process.env.HA_URL;
  delete process.env.HA_TOKEN;
});

describe('homeassistant module', () => {
  it('lists HA states and does not leak the token to the client', async () => {
    const res = await client.inject('GET', '/api/modules/homeassistant/states');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.connected).toBe(true);
    const text = JSON.stringify(body);
    expect(text).not.toContain('llat-test-secret-token');
    expect(text).not.toContain('Authorization');
    const ids = (body.states as Array<{ entity_id: string }>).map((s) => s.entity_id);
    expect(ids).toContain('light.living');
    expect(ids).toContain('climate.bedroom');
  });

  it('forwards an allowlisted control to HA with the correct entity and Bearer', async () => {
    const res = await client.inject('POST', '/api/modules/homeassistant/call', {
      entity_id: 'light.living',
      service: 'light.toggle',
    });
    expect(res.statusCode).toBe(200);
    const sent = fake.requests.find((r) => r.url === '/api/services/light/toggle');
    expect(sent).toBeDefined();
    expect(sent!.method).toBe('POST');
    expect(sent!.auth).toBe('Bearer llat-test-secret-token');
    expect(JSON.parse(sent!.body!)).toEqual({ entity_id: 'light.living' });
  });

  it('sanitizes control data to the allowlisted keys only', async () => {
    await client.inject('POST', '/api/modules/homeassistant/call', {
      entity_id: 'light.living',
      service: 'light.turn_on',
      data: { brightness_pct: 50, malicious: 'x', __proto__: { polluted: true } as unknown },
    });
    const sent = fake.requests.find((r) => r.url === '/api/services/light/turn_on');
    expect(JSON.parse(sent!.body!)).toEqual({ entity_id: 'light.living', brightness_pct: 50 });
  });

  it('rejects a service outside the allowlist', async () => {
    const before = fake.requests.length;
    const res = await client.inject('POST', '/api/modules/homeassistant/call', {
      entity_id: 'light.living',
      service: 'homeassistant.reload',
    });
    expect(res.statusCode).toBe(400);
    expect(fake.requests.length).toBe(before);
  });

  it('rejects service/domain mismatch', async () => {
    const before = fake.requests.length;
    const res = await client.inject('POST', '/api/modules/homeassistant/call', {
      entity_id: 'light.living',
      service: 'switch.toggle',
    });
    expect(res.statusCode).toBe(400);
    expect(fake.requests.length).toBe(before);
  });

  it('rejects a malicious entity_id (path traversal / SSRF)', async () => {
    const before = fake.requests.length;
    const res = await client.inject('POST', '/api/modules/homeassistant/call', {
      entity_id: '../../etc/passwd',
      service: 'switch.toggle',
    });
    expect(res.statusCode).toBe(400);
    expect(fake.requests.length).toBe(before);
  });

  it('blocks writes without write rights', async () => {
    const entry = world.core.grants.byModule('homeassistant')[0]!;
    world.core.grants.set(entry.groupId, 'homeassistant', { canRead: true, canWrite: false });
    const res = await client.inject('POST', '/api/modules/homeassistant/call', {
      entity_id: 'light.living',
      service: 'light.toggle',
    });
    expect(res.statusCode).toBe(403);
  });

  it('reports a useful summary for the dashboard', async () => {
    const res = await client.inject('GET', '/api/modules/homeassistant/summary');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.status).toBe('string');
  });

  it('returns disconnected state when HA is not configured', async () => {
    delete process.env.HA_URL;
    delete process.env.HA_TOKEN;
    const res = await client.inject('GET', '/api/modules/homeassistant/states');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.connected).toBe(false);
  });
});
