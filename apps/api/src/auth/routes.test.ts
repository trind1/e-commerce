import type { PrismaClient } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';

interface FakeUser {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
  role: 'CUSTOMER' | 'ADMIN';
  createdAt: Date;
  updatedAt: Date;
}

function createAuthDatabase(): PrismaClient {
  const users: FakeUser[] = [];
  const sessions: Array<{
    id: string;
    tokenHmac: Buffer;
    userId: string;
    createdAt: Date;
    lastSeenAt: Date;
    expiresAt: Date;
    revokedAt: Date | null;
  }> = [];
  let userSequence = 0;
  let sessionSequence = 0;

  const database = {
    user: {
      create: async ({ data }: { data: Omit<FakeUser, 'id' | 'createdAt' | 'updatedAt'> }) => {
        const now = new Date();
        const user = {
          ...data,
          id: `00000000-0000-4000-8000-${String(++userSequence).padStart(12, '0')}`,
          createdAt: now,
          updatedAt: now,
        };
        users.push(user);
        return user;
      },
      findUnique: async ({ where }: { where: { email?: string } }) =>
        users.find((user) => user.email === where.email) ?? null,
      findFirst: async ({ where }: { where: { id: string; role: 'CUSTOMER' } }) => {
        const user = users.find(
          (candidate) => candidate.id === where.id && candidate.role === where.role,
        );
        return user ? { email: user.email, displayName: user.displayName } : null;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; role: 'CUSTOMER' };
        data: { displayName: string };
      }) => {
        const user = users.find(
          (candidate) => candidate.id === where.id && candidate.role === where.role,
        );
        if (!user) return { count: 0 };
        user.displayName = data.displayName;
        return { count: 1 };
      },
    },
    authSession: {
      create: async ({
        data,
      }: {
        data: {
          userId: string;
          tokenHmac: Buffer;
          createdAt: Date;
          lastSeenAt: Date;
          expiresAt: Date;
        };
      }) => {
        const session = {
          ...data,
          id: `00000000-0000-4000-8000-${String(++sessionSequence).padStart(12, '0')}`,
          revokedAt: null,
        };
        sessions.push(session);
        return session;
      },
      findUnique: async ({ where }: { where: { tokenHmac?: Buffer } }) => {
        const tokenHmac = where.tokenHmac;
        const session = sessions.find(
          (candidate) => tokenHmac && candidate.tokenHmac.equals(tokenHmac),
        );
        if (!session) return null;
        const user = users.find((candidate) => candidate.id === session.userId);
        return user ? { ...session, user: { id: user.id, role: user.role } } : null;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; tokenHmac: Buffer; revokedAt: null };
        data: { revokedAt?: Date; tokenHmac?: Buffer; lastSeenAt?: Date };
      }) => {
        const session = sessions.find(
          (candidate) =>
            candidate.id === where.id &&
            candidate.tokenHmac.equals(where.tokenHmac) &&
            !candidate.revokedAt,
        );
        if (!session) return { count: 0 };
        Object.assign(session, data);
        return { count: 1 };
      },
    },
  } as unknown as PrismaClient;

  return database;
}

const config = {
  NODE_ENV: 'test' as const,
  API_HOST: '127.0.0.1',
  API_PORT: 3000,
  CORS_ORIGIN: 'http://localhost:5173',
  SESSION_ABSOLUTE_TTL_SECONDS: 28_800,
  SESSION_IDLE_TTL_SECONDS: 1_800,
};

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const value = response.headers['set-cookie'];
  const first = Array.isArray(value) ? value[0] : typeof value === 'string' ? value : undefined;
  if (!first) throw new Error('Expected a session cookie.');
  const cookie = first.split(';')[0];
  if (!cookie) throw new Error('Expected a session cookie.');
  return cookie;
}

describe('authentication HTTP contract', () => {
  it('registers a Customer, protects profile access, and revokes logout', async () => {
    const app = buildApp({ config, database: createAuthDatabase() });
    const registration = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: ' Customer@Example.COM ',
        password: 'exact-pass',
        displayName: ' Customer ',
      },
    });
    expect(registration.statusCode).toBe(201);
    expect(registration.json()).toEqual({
      email: 'customer@example.com',
      displayName: 'Customer',
    });
    expect(registration.body).not.toContain('exact-pass');
    const cookie = cookieFrom(registration);
    expect(registration.headers['set-cookie']).toContain('HttpOnly');
    expect(registration.headers['set-cookie']).toContain('SameSite=Lax');
    expect(registration.headers['set-cookie']).toContain('Max-Age=1800');

    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().role).toBe('CUSTOMER');

    const forbiddenOrigin = await app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: { cookie, origin: 'https://attacker.example' },
      payload: { displayName: 'Changed' },
    });
    expect(forbiddenOrigin.statusCode).toBe(403);
    const profile = await app.inject({ method: 'GET', url: '/api/users/me', headers: { cookie } });
    expect(profile.json()).toEqual({ email: 'customer@example.com', displayName: 'Customer' });

    const logout = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { cookie, origin: config.CORS_ORIGIN },
    });
    expect(logout.statusCode).toBe(204);
    const afterLogout = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie },
    });
    expect(afterLogout.statusCode).toBe(401);
    await app.close();
  });

  it('uses generic duplicate registration and login failures and rejects mass assignment', async () => {
    const app = buildApp({ config, database: createAuthDatabase() });
    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'user@example.com', password: 'password' },
    });
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: ' USER@example.com ', password: 'password' },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error).toMatchObject({
      code: 'REGISTRATION_UNAVAILABLE',
      message: 'Registration is unavailable',
    });
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nobody@example.com', password: 'password' },
    });
    expect(invalid.statusCode).toBe(401);
    const massAssignment = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'other@example.com', password: 'password', role: 'ADMIN' },
    });
    expect(massAssignment.statusCode).toBe(400);
    await app.close();
  });
});
