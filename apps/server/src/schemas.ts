export const usernameSchema = {
  type: 'string',
  pattern: '^[^\\s\\u0000-\\u001F]{1,64}$',
};

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
