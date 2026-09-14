import type { Role } from '@prisma/client';

export interface AuthenticatedIdentity {
  userId: string;
  role: Role;
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthenticatedIdentity | null;
    sessionToken: string | null;
  }
}
