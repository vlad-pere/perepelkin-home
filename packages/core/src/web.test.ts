import { describe, expect, it } from 'vitest';
import { formatDate, safeHttpUrl, todayISODate, toISODate } from '../src/web.js';

describe('formatDate', () => {
  it('returns an empty string for missing values', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
  });

  it('formats a date-only value in local time without a UTC shift', () => {
    expect(formatDate('2026-01-01')).toMatch(/^1\s/);
  });

  it('returns the raw value when the date cannot be parsed', () => {
    expect(formatDate('не дата')).toBe('не дата');
  });

  it('omits the year when year is disabled', () => {
    expect(formatDate('2026-01-01', { year: false })).not.toContain('2026');
  });

  it('includes the weekday when requested', () => {
    expect(formatDate('2026-01-01', { weekday: true })).toContain(',');
  });
});

describe('safeHttpUrl', () => {
  it('returns null for missing values', () => {
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
    expect(safeHttpUrl('')).toBeNull();
  });

  it('rejects non-http protocols', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('ftp://example.com/file')).toBeNull();
    expect(safeHttpUrl('/relative/path')).toBeNull();
  });

  it('keeps http and https links', () => {
    expect(safeHttpUrl('https://example.com/')).toBe('https://example.com/');
    expect(safeHttpUrl('http://example.com/a')).toBe('http://example.com/a');
  });
});

describe('todayISODate', () => {
  it('returns the current local date as YYYY-MM-DD', () => {
    const now = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
    const expected = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    expect(todayISODate()).toBe(expected);
  });
});

describe('toISODate', () => {
  it('formats a date in local time', () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('pads single-digit months and days', () => {
    expect(toISODate(new Date(2026, 8, 9))).toBe('2026-09-09');
  });
});
