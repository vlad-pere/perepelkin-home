import { randomBytes } from 'node:crypto';
import { loadEnvFile } from './env.js';
import { loadConfig } from './config.js';
import { openDb } from './db/db.js';
import { buildCore } from './core.js';

const DEFAULT_GROUPS = [
  { name: 'Семья', description: 'Ближний круг: обслуживание дома, планы, документы' },
  { name: 'Гости', description: 'Друзья и гости: игры и совместное' },
];

function isValidUsername(username: string): boolean {
  return /^[^\s\u0000-\u001F]{1,64}$/.test(username);
}

async function ensureAdmin(
  core: ReturnType<typeof buildCore>,
): Promise<{ created: boolean; username: string; generatedPassword: string | null }> {
  const username = process.env.ADMIN_USERNAME?.trim() || 'admin';
  if (!isValidUsername(username)) {
    throw new Error(`ADMIN_USERNAME "${username}" не подходит: 1–64 символа без пробелов`);
  }

  const existing = core.users.getByUsername(username);
  if (existing) {
    return { created: false, username, generatedPassword: null };
  }

  let password = process.env.ADMIN_PASSWORD;
  let generatedPassword: string | null = null;
  if (!password || password.length < 8) {
    generatedPassword = randomBytes(16).toString('base64url');
    password = generatedPassword;
  }
  if (password.length > 72) {
    throw new Error('ADMIN_PASSWORD слишком длинный (макс. 72 символа)');
  }

  await core.users.create({ username, password, isAdmin: true, authMode: 'password' });
  return { created: true, username, generatedPassword };
}

async function ensureGroups(core: ReturnType<typeof buildCore>): Promise<number[]> {
  const ids: number[] = [];
  for (const g of DEFAULT_GROUPS) {
    const existing = core.groups.list().find((x) => x.name === g.name);
    ids.push(existing ? existing.id : core.groups.create(g).id);
  }
  return ids;
}

async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  const db = openDb(config.dbPath);
  const core = buildCore(db);

  const admin = await ensureAdmin(core);
  const groupIds = await ensureGroups(core);

  const adminUser = core.users.getByUsername(admin.username) as NonNullable<ReturnType<typeof core.users.getByUsername>>;
  core.groups.addMember(groupIds[0]!, adminUser.id);

  console.log('Seed завершён.');
  console.log(`  Администратор: ${admin.username}`);
  if (admin.generatedPassword) {
    console.log(`  Пароль (сгенерирован, сохраните): ${admin.generatedPassword}`);
  } else {
    console.log('  Пароль: задан через ADMIN_PASSWORD');
  }
  console.log(`  Группы: ${core.groups.list().map((g) => `${g.name} (${g.memberCount} чел.)`).join(', ')}`);
  console.log('Запуск: npm run dev — фронтенд на http://localhost:5173');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
