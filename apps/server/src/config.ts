import { dirname, join } from 'node:path';
import { parseS3Endpoint } from './modules/storage.js';

export interface S3Config {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  useSsl: boolean;
  region: string;
}

export interface Config {
  port: number;
  host: string;
  dbPath: string;
  sessionTtlMs: number;
  cookieSecure: boolean;
  trustProxy: boolean;
  webDist: string | null;
  modulesDir: string | null;
  /** Каталог файлов модулей (по умолчанию — подкаталог `files` рядом с БД). */
  filesDir: string;
  /** Максимальный размер загружаемого файла в байтах. */
  maxFileSize: number;
  /** S3-хранилище файлов; null — файлы на локальном диске. */
  s3: S3Config | null;
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

function parseFileSizeMb(raw: string | undefined): number {
  const mb = Number.parseFloat(raw ?? '256');
  if (!Number.isFinite(mb) || mb <= 0 || mb > 256) {
    throw new Error(`Invalid MAX_FILE_SIZE_MB "${raw}"`);
  }
  return Math.round(mb * 1024 * 1024);
}

function parseS3Config(env: NodeJS.ProcessEnv): S3Config | null {
  const endpoint = env.S3_ENDPOINT?.trim();
  if (!endpoint) return null;
  const accessKey = env.S3_ACCESS_KEY?.trim();
  const secretKey = env.S3_SECRET_KEY?.trim();
  const bucket = env.S3_BUCKET?.trim();
  if (!accessKey || !secretKey || !bucket) {
    throw new Error('При S3_ENDPOINT обязательны S3_ACCESS_KEY, S3_SECRET_KEY и S3_BUCKET');
  }
  const { useSSL: scheme } = parseS3Endpoint(endpoint);
  const rawSsl = env.S3_USE_SSL?.trim();
  const useSsl = rawSsl === undefined || rawSsl === '' ? scheme : parseBool(rawSsl, scheme);
  return {
    endpoint,
    accessKey,
    secretKey,
    bucket,
    useSsl,
    region: env.S3_REGION?.trim() || 'us-east-1',
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dbPath = env.DB_PATH ?? './data/perepelkin-home.db';
  return {
    port: parsePort(env.PORT),
    host: env.HOST ?? '0.0.0.0',
    dbPath,
    sessionTtlMs: parseSessionTtl(env.SESSION_TTL_HOURS),
    cookieSecure: parseBool(env.COOKIE_SECURE, false),
    trustProxy: parseBool(env.TRUST_PROXY, false),
    webDist: env.WEB_DIST && env.WEB_DIST.trim() !== '' ? env.WEB_DIST : null,
    modulesDir: env.MODULES_DIR && env.MODULES_DIR.trim() !== '' ? env.MODULES_DIR : null,
    filesDir: env.FILES_DIR && env.FILES_DIR.trim() !== '' ? env.FILES_DIR : join(dirname(dbPath), 'files'),
    maxFileSize: parseFileSizeMb(env.MAX_FILE_SIZE_MB),
    s3: parseS3Config(env),
  };
}
