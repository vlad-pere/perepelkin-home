import bcrypt from 'bcryptjs';
import type { AuthMode } from '@perepelkin-home/core';

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

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/** Соответствует ли секрет формату, заданному режимом входа. */
export function isValidSecret(secret: string, mode: AuthMode): boolean {
  return mode === 'pin' ? PIN_PATTERN.test(secret) : secret.length >= MIN_PASSWORD_LENGTH;
}

/** Ошибка валидации секрета для режима входа (null — валидно). */
export function validateCredential(secret: string, mode: AuthMode): string | null {
  if (mode === 'pin') {
    return PIN_PATTERN.test(secret) ? null : 'Пинкод — это ровно 6 цифр';
  }
  return secret.length >= MIN_PASSWORD_LENGTH ? null : 'Пароль должен быть не короче 8 символов';
}

/** Проверка секрета при входе: неверный формат молча трактуется как неверные данные. */
export function verifyCredential(secret: string, hash: string, mode: AuthMode): Promise<boolean> {
  if (!isValidSecret(secret, mode)) return Promise.resolve(false);
  return bcrypt.compare(secret, hash);
}
