export const usernameSchema = {
  type: 'string',
  pattern: '^[^\\s\\u0000-\\u001F]{1,64}$',
};

/** Секрет входа — пинкод (6 цифр) или пароль; на входе проверяется по обоим способам. */
export const secretSchema = {
  type: 'string',
  minLength: 6,
  maxLength: 72,
};

/** Пинкод из ровно 6 цифр. */
export const pinSchema = {
  type: 'string',
  pattern: '^\\d{6}$',
};

/** Пароль длиной от 8 символов. */
export const passwordSchema = {
  type: 'string',
  minLength: 8,
  maxLength: 72,
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
