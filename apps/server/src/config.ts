export interface Config {
  port: number;
  host: string;
  dbPath: string;
  sessionTtlMs: number;
  cookieSecure: boolean;
  trustProxy: boolean;
  webDist: string | null;
  modulesDir: string | null;
}

function parsePort(raw: string | undefined): number {
  const port = Number.parseInt(raw ?? '3000', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT "${raw}"`);
  }
  return port;
}

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === '') return fallback;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new Error(`Invalid boolean value "${raw}"`);
}

function parseSessionTtl(raw: string | undefined): number {
  const hours = Number.parseFloat(raw ?? '168');
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 365) {
    throw new Error(`Invalid SESSION_TTL_HOURS "${raw}"`);
  }
  return Math.round(hours * 3600_000);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: parsePort(env.PORT),
    host: env.HOST ?? '0.0.0.0',
    dbPath: env.DB_PATH ?? './data/perepelkin-home.db',
    sessionTtlMs: parseSessionTtl(env.SESSION_TTL_HOURS),
    cookieSecure: parseBool(env.COOKIE_SECURE, false),
    trustProxy: parseBool(env.TRUST_PROXY, false),
    webDist: env.WEB_DIST && env.WEB_DIST.trim() !== '' ? env.WEB_DIST : null,
    modulesDir: env.MODULES_DIR && env.MODULES_DIR.trim() !== '' ? env.MODULES_DIR : null,
  };
}
