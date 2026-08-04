export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const notFound = (message = 'Ресурс не найден'): ApiError =>
  new ApiError(404, 'NOT_FOUND', message);

export const badRequest = (message = 'Некорректный запрос'): ApiError =>
  new ApiError(400, 'BAD_REQUEST', message);

export const conflict = (message = 'Конфликт'): ApiError =>
  new ApiError(409, 'CONFLICT', message);

export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE'
  );
}
