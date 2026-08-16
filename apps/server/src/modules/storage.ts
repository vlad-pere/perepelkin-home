import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { Client as MinioClient } from 'minio';
import type { S3Config } from '../config.js';

/**
 * Хранилище байтов файлов модулей. Ключ объекта — id файла (UUID),
 * метаданные всегда живут в таблице `files` в БД.
 */
export interface ByteStorage {
  put(key: string, buffer: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

/** Локальный диск: каталог с одним файлом на id. */
export function createLocalStorage(dir: string): ByteStorage {
  return {
    async put(key, buffer) {
      await fs.writeFile(join(dir, key), buffer, { flag: 'wx' });
    },
    async get(key) {
      return fs.readFile(join(dir, key));
    },
    async remove(key) {
      await fs.rm(join(dir, key), { force: true });
    },
  };
}

/**
 * Разбирает S3_ENDPOINT вида `host`, `host:9000`, `http://host:9000`, `https://host`.
 * Отдельно от S3_USE_SSL (намеренный https-эндпоинт) возвращает схему для дефолта.
 */
export function parseS3Endpoint(raw: string): {
  endPoint: string;
  port: number | undefined;
  useSSL: boolean;
} {
  const url = new URL(raw.includes('://') ? raw : `http://${raw}`);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`S3_ENDPOINT "${raw}": поддерживается только http/https`);
  }
  if (url.hostname === '') {
    throw new Error(`S3_ENDPOINT "${raw}": пустое имя хоста`);
  }
  const port = url.port === '' ? undefined : Number(url.port);
  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error(`S3_ENDPOINT "${raw}": неверный порт`);
  }
  return { endPoint: url.hostname, port, useSSL: url.protocol === 'https:' };
}

function minioClient(cfg: S3Config): MinioClient {
  const { endPoint, port } = parseS3Endpoint(cfg.endpoint);
  return new MinioClient({
    endPoint,
    port,
    useSSL: cfg.useSsl,
    accessKey: cfg.accessKey,
    secretKey: cfg.secretKey,
    region: cfg.region,
  });
}

/** S3-совместимое хранилище (MinIO и др.). Ключи — только UUID файлов. */
export function createS3Storage(cfg: S3Config): ByteStorage {
  const client = minioClient(cfg);
  return {
    async put(key, buffer) {
      await client.putObject(cfg.bucket, key, buffer, buffer.length);
    },
    async get(key) {
      const stream = await client.getObject(cfg.bucket, key);
      return streamToBuffer(stream);
    },
    async remove(key) {
      await client.removeObject(cfg.bucket, key);
    },
  };
}

/** Идемпотентно создаёт bucket, если его ещё нет. */
export async function ensureBucket(cfg: S3Config): Promise<void> {
  const client = minioClient(cfg);
  if (!(await client.bucketExists(cfg.bucket))) {
    await client.makeBucket(cfg.bucket, cfg.region);
  }
}

/** Выбирает хранилище по конфигу: S3 если задан endpoint, иначе локальный диск. */
export async function createConfiguredStorage(config: {
  s3: S3Config | null;
  filesDir: string;
}): Promise<ByteStorage> {
  if (config.s3) {
    await ensureBucket(config.s3);
    return createS3Storage(config.s3);
  }
  await fs.mkdir(config.filesDir, { recursive: true });
  return createLocalStorage(config.filesDir);
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
