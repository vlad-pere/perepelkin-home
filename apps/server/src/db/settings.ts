import type Database from 'better-sqlite3';

interface AppSettingRow {
  value: string;
}

/** Общие настройки установки (таблица app_settings): оформления и прочего, что придёт позже. */
export function getSetting(db: Database.Database, key: string): string | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | AppSettingRow
    | undefined;
  return row?.value ?? null;
}

export function setSetting(db: Database.Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  ).run(key, value);
}
