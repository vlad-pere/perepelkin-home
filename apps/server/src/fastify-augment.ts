import type { Core, UserRow } from './core.js';

declare module 'fastify' {
  interface FastifyRequest {
    core: Core;
    user: UserRow | null;
    sessionToken: string | null;
    csrfToken: string | null;
  }
}
