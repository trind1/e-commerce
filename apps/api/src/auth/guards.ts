import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../errors.js';
import type { SessionService } from './session.js';
import type { AuthenticatedIdentity } from './context.js';
import { readSessionCookie, setSessionCookie } from './session.js';
import type { AppConfig } from '../config.js';
import { Role } from '@prisma/client';

export function createAuthenticationGuard(sessionService: SessionService, config: AppConfig) {
  return async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token = readSessionCookie(request);
    const authenticated = await sessionService.authenticate(token);
    if (!authenticated) {
      throw new AppError('AUTHENTICATION_REQUIRED');
    }

    request.auth = authenticated.identity;
    request.sessionToken = authenticated.replacement?.token ?? token;
    if (authenticated.replacement) {
      setSessionCookie(reply, authenticated.replacement, config.NODE_ENV !== 'development');
    }
  };
}

export function requireRole(role: Role) {
  return async function roleGuard(request: FastifyRequest): Promise<void> {
    const identity: AuthenticatedIdentity | null = request.auth;
    if (!identity) {
      throw new AppError('AUTHENTICATION_REQUIRED');
    }
    if (identity.role !== role) {
      throw new AppError('ROLE_FORBIDDEN');
    }
  };
}

export const requireCustomer = requireRole(Role.CUSTOMER);
export const requireAdmin = requireRole(Role.ADMIN);

export function createOriginGuard(config: AppConfig) {
  return async function originGuard(request: FastifyRequest): Promise<void> {
    const method = request.method.toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return;
    }

    if (!readSessionCookie(request)) {
      return;
    }

    const origin = request.headers.origin;
    if (typeof origin !== 'string' || origin !== config.CORS_ORIGIN) {
      throw new AppError('ORIGIN_FORBIDDEN');
    }
  };
}
