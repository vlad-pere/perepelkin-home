import { describe, expect, it } from 'vitest';
import { createS3Storage, ensureBucket } from '../src/modules/storage.js';
import type { S3Config } from '../src/config.js';

// Прогоняется только при заданном окружении, например:
//   docker run -d -p 9000:9000 -e MINIO_ROOT_USER=test -e MINIO_ROOT_PASSWORD=testtest \
//     minio/minio server /data
//   $env:S3_TEST_ENDPOINT='127.0.0.1:9000'; ... npm test -w @perepelkin-home/server
const endpoint = process.env.S3_TEST_ENDPOINT?.trim() ?? '';
const accessKey = process.env.S3_TEST_ACCESS_KEY?.trim() ?? 'test';
const secretKey = process.env.S3_TEST_SECRET_KEY?.trim() ?? 'testtest';
const bucket = process.env.S3_TEST_BUCKET?.trim() ?? 'vitest-files';

const describeS3 = endpoint ? describe : describe.skip;

describeS3('S3 byte storage integration', () => {
  const cfg: S3Config = {
    endpoint,
    accessKey,
    secretKey,
    bucket,
    useSsl: false,
    region: 'us-east-1',
  };

  it('обеспечивает bucket и выполняет put/get/remove', async () => {
    await ensureBucket(cfg);
    const storage = createS3Storage(cfg);
    const key = 'round-trip-test.bin';
    const payload = Buffer.from('привет из S3 \u0000\xff\x00', 'utf8');

    await storage.put(key, payload);
    expect(await storage.get(key)).toEqual(payload);

    await storage.remove(key);
    await expect(storage.get(key)).rejects.toThrow();
  }, 15000);
});
