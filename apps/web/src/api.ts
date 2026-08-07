import { CSRF_HEADER } from '@perepelkin-home/core';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = { accept: 'application/json' };
  if (method !== 'GET' && csrfToken) {
    headers[CSRF_HEADER] = csrfToken;
  }
  if (init.body !== undefined) {
    headers['content-type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Сервер недоступен. Попробуйте ещё раз.');
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    if (res.status === 401 && err?.code === 'UNAUTHENTICATED' && csrfToken !== null) {
      window.location.assign('/login');
    }
    throw new ApiError(res.status, err?.code ?? 'UNKNOWN', err?.message ?? 'Что-то пошло не так.');
  }

  return data as T;
}
