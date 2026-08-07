import type { FastifyInstance } from 'fastify';
import type { InjectOptions, Response as InjectResponse } from 'light-my-request';
import { openDb } from '../src/db/db.js';
import { createApp } from '../src/app.js';
import type { Config } from '../src/config.js';
import { buildCore, type Core } from '../src/core.js';
import type Database from 'better-sqlite3';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export interface TestWorld {
  app: FastifyInstance;
  core: Core;
  db: Database.Database;
  close(): Promise<void>;
}

export async function createTestWorld(opts?: { sessionTtlMs?: number }): Promise<TestWorld> {
  const db = openDb(':memory:');
  const core = buildCore(db);
  const config: Config = {
    port: 0,
    host: '127.0.0.1',
    dbPath: ':memory:',
    sessionTtlMs: opts?.sessionTtlMs ?? 3_600_000,
    cookieSecure: false,
    trustProxy: false,
    webDist: null,
    modulesDir: null,
  };
  const app = await createApp({ db, config });
  return {
    app,
    core,
    db,
    close: async () => {
      await app.close();
      db.close();
    },
  };
}

export async function createAdmin(
  world: TestWorld,
  username = 'admin',
  password = 'secret123',
): Promise<void> {
  await world.core.users.create({ username, password, isAdmin: true });
}

/** Клиент, который хранит сессию/CSRF-токен и шлёт их в следующих запросах. */
export class Client {
  private session = '';
  private csrf = '';

  constructor(private readonly app: FastifyInstance) {}

  get hasSession(): boolean {
    return this.session !== '';
  }

  get csrfToken(): string {
    return this.csrf;
  }

  resetAuth(): void {
    this.session = '';
    this.csrf = '';
  }

  async inject(
    method: HttpMethod,
    url: string,
    payload?: unknown,
    opts: { csrf?: string | null; headers?: Record<string, string> } = {},
  ): Promise<InjectResponse> {
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const csrfToken = opts.csrf === null ? undefined : opts.csrf ?? this.csrf;
    const headers: Record<string, string> = {
      ...(this.session ? { cookie: `domo.session=${this.session}` } : {}),
      ...(isMutation && csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      ...opts.headers,
    };
    const injectOpts: InjectOptions = { method, url, headers };
    if (payload !== undefined) injectOpts.payload = payload as InjectOptions['payload'];
    const res = await this.app.inject(injectOpts);
    for (const c of res.cookies) {
      if (c.name === 'domo.session' && c.value) this.session = c.value;
    }
    return res;
  }

  async login(username: string, password: string) {
    const res = await this.inject('POST', '/api/auth/login', { username, password });
    if (res.statusCode === 200) {
      const body = res.json() as { csrfToken?: string };
      if (body.csrfToken) this.csrf = body.csrfToken;
    }
    return res;
  }
}
