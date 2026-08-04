import { existsSync, readFileSync } from 'node:fs';

/**
 * Минимальный загрузчик .env без внешних зависимостей.
 * Не перезаписывает уже заданные переменные окружения.
 */
export function loadEnvFile(path = '.env'): void {
  if (!existsSync(path)) return;

  const text = readFileSync(path, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice('export '.length).trim();

    const eq = line.indexOf('=');
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) process.env[key] = value;
  }
}
