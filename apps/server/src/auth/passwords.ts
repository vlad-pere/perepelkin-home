import bcrypt from 'bcryptjs';

const SALT_ROUNDS = (() => {
  const raw = process.env.BCRYPT_ROUNDS;
  if (raw === undefined) return 12;
  const rounds = Number.parseInt(raw, 10);
  if (!Number.isInteger(rounds) || rounds < 4 || rounds > 15) {
    throw new Error(`Invalid BCRYPT_ROUNDS "${raw}"`);
  }
  return rounds;
})();

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
