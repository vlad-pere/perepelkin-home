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

/** Пинкод — ровно 6 цифр. */
export const PIN_PATTERN = /^\d{6}$/;

export const MIN_PASSWORD_LENGTH = 8;

export function hashSecret(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function isPinSecret(secret: string): boolean {
  return PIN_PATTERN.test(secret);
}

export function isPasswordSecret(secret: string): boolean {
  return secret.length >= MIN_PASSWORD_LENGTH;
}

/** Ошибка валидации пинкода (null — валидно). */
export function validatePin(secret: string): string | null {
  return isPinSecret(secret) ? null : 'Пинкод — это ровно 6 цифр';
}

/** Ошибка валидации пароля (null — валидно). */
export function validatePassword(secret: string): string | null {
  return isPasswordSecret(secret) ? null : 'Пароль должен быть не короче 8 символов';
}

/**
 * Проверка секрета при входе по любому из заданных способов.
 * Неверный формат для способа молча трактуется как неверные данные.
 */
export async function verifyLogin(
  secret: string,
  user: { pin_hash: string | null; password_hash: string | null },
): Promise<boolean> {
  if (isPinSecret(secret) && user.pin_hash !== null) {
    if (await bcrypt.compare(secret, user.pin_hash)) return true;
  }
  if (isPasswordSecret(secret) && user.password_hash !== null) {
    if (await bcrypt.compare(secret, user.password_hash)) return true;
  }
  return false;
}
