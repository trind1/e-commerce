import argon2 from 'argon2';
import { Prisma, Role, type User } from '@prisma/client';
import type { DatabaseClient } from '../db/client.js';
import { AppError } from '../errors.js';
import { normalizeEmail } from './policy.js';
import type { SessionResult, SessionService } from './session.js';

export interface Profile {
  email: string;
  displayName: string | null;
}

export interface SessionIdentity {
  id: string;
  role: Role;
}

function toProfile(user: Pick<User, 'email' | 'displayName'>): Profile {
  return { email: user.email, displayName: user.displayName };
}

function toIdentity(user: Pick<User, 'id' | 'role'>): SessionIdentity {
  return { id: user.id, role: user.role };
}

export class AuthService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly sessions: SessionService,
  ) {}

  public async register(input: {
    email: string;
    password: string;
    displayName: string | undefined;
  }): Promise<{ profile: Profile; session: SessionResult }> {
    const email = normalizeEmail(input.email);
    const existing = await this.database.user.findUnique({ where: { email } });
    if (existing) throw new AppError('REGISTRATION_UNAVAILABLE');
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    let user: User;

    try {
      user = await this.database.user.create({
        data: {
          email,
          passwordHash,
          displayName: input.displayName ?? null,
          role: Role.CUSTOMER,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError('REGISTRATION_UNAVAILABLE');
      }
      throw error;
    }

    return {
      profile: toProfile(user),
      session: await this.sessions.issue(user.id),
    };
  }

  public async login(input: { email: string; password: string }): Promise<{
    identity: SessionIdentity;
    session: SessionResult;
  }> {
    const user = await this.database.user.findUnique({
      where: { email: normalizeEmail(input.email) },
    });
    let passwordMatches = false;
    if (user) {
      try {
        passwordMatches = await argon2.verify(user.passwordHash, input.password);
      } catch {
        passwordMatches = false;
      }
    }
    if (!user || !passwordMatches) {
      throw new AppError('INVALID_CREDENTIALS');
    }

    return { identity: toIdentity(user), session: await this.sessions.issue(user.id) };
  }

  public async getProfile(userId: string): Promise<Profile> {
    const user = await this.database.user.findFirst({
      where: { id: userId, role: Role.CUSTOMER },
      select: { email: true, displayName: true },
    });
    if (!user) {
      throw new AppError('NOT_FOUND');
    }
    return toProfile(user);
  }

  public async updateProfile(userId: string, displayName: string): Promise<Profile> {
    const user = await this.database.user.updateMany({
      where: { id: userId, role: Role.CUSTOMER },
      data: { displayName },
    });
    if (user.count !== 1) {
      throw new AppError('NOT_FOUND');
    }
    return this.getProfile(userId);
  }
}
