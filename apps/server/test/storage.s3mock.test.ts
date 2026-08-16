import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createS3Storage, ensureBucket } from '../src/modules/storage.js';
import type { S3Config } from '../src/config.js';

/**
 * Имитация S3 (path-style запросы), достаточная для реального minio-клиента:
 * bucketExists (HEAD), makeBucket (PUT /bucket), putObject (PUT /bucket/key),
 * getObject (GET /bucket/key), removeObject (DELETE /bucket/key).
 */
function startFakeS3(): Promise<{
  url: string;
  close: () => Promise<void>;
  objects: Map<string, Buffer>;
  createdBuckets: string[];
}> {
  const objects = new Map<string, Buffer>();
  const createdBuckets: string[] = [];
  const state = { bucketExists: false };

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://fake');
    const parts = url.pathname.split('/').filter(Boolean);
    const bucket = parts[0] ?? '';
    const key = parts.slice(1).join('/');
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const respond = (code: number, headers: Record<string, string> = {}, payload: Buffer | string = '') => {
        res.writeHead(code, { ...headers, 'content-length': String(Buffer.byteLength(payload)) });
        res.end(payload);
      };
      const noSuchKey = () =>
        respond(
          404,
          { 'content-type': 'application/xml' },
          `<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code><Message>Not found</Message><Resource>/${bucket}/${key}</Resource></Error>`,
        );

      if (req.method === 'HEAD' && bucket && key === '') {
        return state.bucketExists ? respond(200) : respond(404);
      }
      if (req.method === 'PUT' && bucket && key === '') {
        state.bucketExists = true;
        createdBuckets.push(bucket);
        return respond(200);
      }
      if (req.method === 'PUT' && bucket && key !== '') {
        objects.set(key, body);
        return respond(200, { etag: '"mocked"' });
      }
      if (req.method === 'GET' && bucket && key !== '') {
        const data = objects.get(key);
        return data ? respond(200, { 'content-type': 'application/octet-stream' }, data) : noSuchKey();
      }
      if (req.method === 'DELETE' && bucket && key !== '') {
        objects.delete(key);
        return respond(204);
      }
      return respond(501);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve({
        get url() {
          return `127.0.0.1:${(server.address() as AddressInfo).port}`;
        },
        objects,
        createdBuckets,
        close: () => new Promise((resolveClose, rejectClose) => server.close((e) => (e ? rejectClose(e) : resolveClose()))),
      });
    });
  });
}

let fake: Awaited<ReturnType<typeof startFakeS3>>;
let cfg: S3Config;

beforeAll(async () => {
  fake = await startFakeS3();
  cfg = {
    endpoint: fake.url,
    accessKey: 'fake-user',
    secretKey: 'fake-secret',
    bucket: 'domo',
    useSsl: false,
    region: 'us-east-1',
  };
});

afterAll(async () => {
  await fake.close();
});

describe('S3 byte storage against a real minio client', () => {
  it('создаёт bucket, кладёт/читает/удаляет объект', async () => {
    expect(fake.createdBuckets).toEqual([]);
    await ensureBucket(cfg);
    expect(fake.createdBuckets).toEqual(['domo']);

    const storage = createS3Storage(cfg);
    const payload = Buffer.from('s3 round-trip \u0000\xff', 'utf8');

    await storage.put('a/uuid-file', payload);
    expect(fake.objects.get('a/uuid-file')).toEqual(payload);
    expect(await storage.get('a/uuid-file')).toEqual(payload);

    await storage.remove('a/uuid-file');
    expect(fake.objects.has('a/uuid-file')).toBe(false);
    await expect(storage.get('a/uuid-file')).rejects.toThrow();
  });

  it('ensureBucket идемпотентен', async () => {
    await ensureBucket(cfg);
    expect(fake.createdBuckets).toEqual(['domo']);
  });
});
