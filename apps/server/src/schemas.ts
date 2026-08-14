export const usernameSchema = {
  type: 'string',
  pattern: '^[^\\s\\u0000-\\u001F]{1,64}$',
};

/** Секрет входа — пинкод (6 цифр) или пароль; формат проверяется по authMode. */
export const secretSchema = {
  type: 'string',
  minLength: 6,
  maxLength: 72,
};

export const authModeSchema = {
  type: 'string',
  enum: ['pin', 'password'],
};

export const nameSchema = {
  type: 'string',
  minLength: 1,
  maxLength: 64,
  pattern: '^[^\\u0000-\\u001F]+$',
};

export const descriptionSchema = {
  type: 'string',
  maxLength: 500,
};
