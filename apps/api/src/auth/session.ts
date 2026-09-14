import { createHmac, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Role } from '@prisma/client';
import type { DatabaseClient } from '../db/client.js';
import { isIdleRenewalDue, sessionMaxAgeSeconds } from './policy.js';
import type { AuthenticatedIdentity } from './context.js';

export const SESSION_COOKIE_NAME = 'session';

export interface SessionOptions {
  absoluteTtlSeconds: number;
  idleTtlSeconds: number;
  hmacSecret: string | undefined;
}

interface SessionRecord {
  id: string;
  tokenHmac: Buffer;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  user: { id: string; role: Role };
}

export interface SessionResult {
  token: string;
  maxAgeSeconds: number;
}

export interface AuthenticatedSession {
  identity: AuthenticatedIdentity;
  replacement: SessionResult | null;
}

export class SessionService {
  private readonly key: Buffer;

  public constructor(
    private readonly database: DatabaseClient,
    private readonly options: SessionOptions,
  ) {
    this.key = options.hmacSecret ? Buffer.from(options.hmacSecret, 'utf8') : randomBytes(32);
  }

  private digest(token: string): Buffer {
    return createHmac('sha256', this.key).update(token, 'utf8').digest();
  }

  public async issue(userId: string, now = new Date()): Promise<SessionResult> {
    const token = randomBytes(32).toString('base64url');
    const maxAgeSeconds = Math.min(this.options.absoluteTtlSeconds, this.options.idleTtlSeconds);

    await this.database.authSession.create({
      data: {
        userId,
        tokenHmac: this.digest(token),
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + this.options.absoluteTtlSeconds * 1000),
      },
    });

    return { token, maxAgeSeconds };
  }

  public async authenticate(
    token: string | null,
    now = new Date(),
  ): Promise<AuthenticatedSession | null> {
    if (!token || token.length < 32 || token.length > 128) {
      return null;
    }

    const tokenHmac = this.digest(token);
    const session = (await this.database.authSession.findUnique({
      where: { tokenHmac },
      select: {
        id: true,
        tokenHmac: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        revokedAt: true,
        user: { select: { id: true, role: true } },
      },
    })) as SessionRecord | null;

    if (!session || session.revokedAt || session.expiresAt <= now) {
      return null;
    }

    const maxAgeSeconds = sessionMaxAgeSeconds(
      now,
      session.createdAt,
      session.lastSeenAt,
      this.options.absoluteTtlSeconds,
      this.options.idleTtlSeconds,
    );
    if (maxAgeSeconds <= 0) {
      return null;
    }

    const identity: AuthenticatedIdentity = {
      userId: session.user.id,
      role: session.user.role,
      sessionId: session.id,
    };

    if (!isIdleRenewalDue(now, session.lastSeenAt, this.options.idleTtlSeconds)) {
      return { identity, replacement: null };
    }

    const replacementToken = randomBytes(32).toString('base64url');
    const replacementHmac = this.digest(replacementToken);
    const updated = await this.database.authSession.updateMany({
      where: { id: session.id, tokenHmac, revokedAt: null },
      data: { tokenHmac: replacementHmac, lastSeenAt: now },
    });

    if (updated.count !== 1) {
      return null;
    }

    const replacementMaxAge = sessionMaxAgeSeconds(
      now,
      session.createdAt,
      now,
      this.options.absoluteTtlSeconds,
      this.options.idleTtlSeconds,
    );

    return {
      identity,
      replacement: { token: replacementToken, maxAgeSeconds: replacementMaxAge },
    };
  }

  public async revoke(
    sessionId: string,
    token: string | null,
    revokedAt = new Date(),
  ): Promise<void> {
    if (!token) {
      return;
    }

    await this.database.authSession.updateMany({
      where: { id: sessionId, tokenHmac: this.digest(token), revokedAt: null },
      data: { revokedAt },
    });
  }
}

export function readSessionCookie(request: FastifyRequest): string | null {
  const rawCookie = request.headers.cookie;
  if (!rawCookie || Array.isArray(rawCookie)) {
    return null;
  }

  for (const part of rawCookie.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if (name === SESSION_COOKIE_NAME) {
      return part.slice(separator + 1).trim() || null;
    }
  }

  return null;
}

export function setSessionCookie(
  reply: FastifyReply,
  session: SessionResult,
  secure: boolean,
): void {
  const attributes = [
    `${SESSION_COOKIE_NAME}=${session.token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${session.maxAgeSeconds}`,
  ];
  if (secure) attributes.push('Secure');
  reply.header('set-cookie', attributes.join('; '));
}

export function clearSessionCookie(reply: FastifyReply, secure: boolean): void {
  const attributes = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (secure) attributes.push('Secure');
  reply.header('set-cookie', attributes.join('; '));
}
