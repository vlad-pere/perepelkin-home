import { describe, expect, it } from 'vitest';
import { parseS3Endpoint } from '../src/modules/storage.js';
import { loadConfig } from '../src/config.js';

describe('parseS3Endpoint', () => {
  it('принимает host:port без схемы', () => {
    expect(parseS3Endpoint('minio:9000')).toEqual({
      endPoint: 'minio',
      port: 9000,
      useSSL: false,
    });
  });

  it('принимает явную схему http/https', () => {
    expect(parseS3Endpoint('https://s3.example.com:8443')).toEqual({
      endPoint: 's3.example.com',
      port: 8443,
      useSSL: true,
    });
    expect(parseS3Endpoint('http://10.0.0.5:9000')).toEqual({
      endPoint: '10.0.0.5',
      port: 9000,
      useSSL: false,
    });
  });

  it('без порта оставляет port undefined', () => {
    expect(parseS3Endpoint('storage.local')).toEqual({
      endPoint: 'storage.local',
      port: undefined,
      useSSL: false,
    });
  });

  it('отвергает мусор и не-http схемы', () => {
    expect(() => parseS3Endpoint('')).toThrow();
    expect(() => parseS3Endpoint('ftp://host')).toThrow();
    expect(() => parseS3Endpoint('host:notaport')).toThrow();
  });
});

describe('loadConfig s3', () => {
  it('возвращает null без S3_ENDPOINT', () => {
    expect(loadConfig({}).s3).toBeNull();
  });

  it('требует ключи и bucket при заданном endpoint', () => {
    expect(() => loadConfig({ S3_ENDPOINT: 'minio:9000' })).toThrow(/S3_ACCESS_KEY/);
  });

  it('собирает S3Config из env', () => {
    const s3 = loadConfig({
      S3_ENDPOINT: 'minio:9000',
      S3_ACCESS_KEY: 'user',
      S3_SECRET_KEY: 'secret',
      S3_BUCKET: 'domo',
    }).s3;
    expect(s3).toEqual({
      endpoint: 'minio:9000',
      accessKey: 'user',
      secretKey: 'secret',
      bucket: 'domo',
      useSsl: false,
      region: 'us-east-1',
    });
  });

  it('S3_USE_SSL переопределяет схему, S3_REGION — регион', () => {
    const s3 = loadConfig({
      S3_ENDPOINT: 'http://minio:9000',
      S3_ACCESS_KEY: 'user',
      S3_SECRET_KEY: 'secret',
      S3_BUCKET: 'domo',
      S3_USE_SSL: 'true',
      S3_REGION: 'eu-1',
    }).s3;
    expect(s3!.useSsl).toBe(true);
    expect(s3!.region).toBe('eu-1');
  });

  it('без S3_USE_SSL берёт схему из endpoint', () => {
    const s3 = loadConfig({
      S3_ENDPOINT: 'https://s3.example.com',
      S3_ACCESS_KEY: 'user',
      S3_SECRET_KEY: 'secret',
      S3_BUCKET: 'domo',
    }).s3;
    expect(s3!.useSsl).toBe(true);
  });
});
