import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';
import { AppError } from '../errors.js';
import { displayNameSchema, emailSchema, passwordSchema } from './policy.js';
import { clearSessionCookie, setSessionCookie, type SessionService } from './session.js';
import type { AuthService } from './service.js';
import { createAuthenticationGuard, createOriginGuard, requireCustomer } from './guards.js';
import type { AppConfig } from '../config.js';

const registrationSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    displayName: displayNameSchema.optional(),
  })
  .strict();
const loginSchema = z.object({ email: emailSchema, password: passwordSchema }).strict();
const profileSchema = z.object({ displayName: displayNameSchema }).strict();

function bodyOrValidation<T>(request: FastifyRequest, schema: z.ZodType<T>): T {
  try {
    return schema.parse(request.body);
  } catch (error) {
    if (error instanceof ZodError) {
      const fields: Record<string, 'Invalid value'> = {};
      for (const issue of error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string') fields[field] = 'Invalid value';
      }
      throw new AppError('VALIDATION_ERROR', fields);
    }
    throw error;
  }
}

export function registerAuthRoutes(
  app: FastifyInstance,
  authService: AuthService,
  sessions: SessionService,
  config: AppConfig,
): void {
  const authenticate = createAuthenticationGuard(sessions, config);
  const originGuard = createOriginGuard(config);
  const secureCookie = config.NODE_ENV !== 'development';

  app.post('/api/auth/register', async (request, reply) => {
    const input = bodyOrValidation(request, registrationSchema);
    const result = await authService.register({
      email: input.email,
      password: input.password,
      displayName: input.displayName,
    });
    setSessionCookie(reply, result.session, secureCookie);
    return reply.code(201).send(result.profile);
  });

  app.post('/api/auth/login', async (request, reply) => {
    const input = bodyOrValidation(request, loginSchema);
    const result = await authService.login(input);
    setSessionCookie(reply, result.session, secureCookie);
    return reply.code(200).send(result.identity);
  });

  app.post(
    '/api/auth/logout',
    { preHandler: [originGuard, authenticate] },
    async (request, reply) => {
      if (!request.auth) throw new AppError('AUTHENTICATION_REQUIRED');
      await sessions.revoke(request.auth.sessionId, request.sessionToken);
      clearSessionCookie(reply, secureCookie);
      return reply.code(204).send();
    },
  );

  app.get('/api/auth/session', { preHandler: authenticate }, async (request, reply) => {
    if (!request.auth) throw new AppError('AUTHENTICATION_REQUIRED');
    return reply.code(200).send({ id: request.auth.userId, role: request.auth.role });
  });

  app.get(
    '/api/users/me',
    { preHandler: [authenticate, requireCustomer] },
    async (request, reply) => {
      if (!request.auth) throw new AppError('AUTHENTICATION_REQUIRED');
      return reply.code(200).send(await authService.getProfile(request.auth.userId));
    },
  );

  app.patch(
    '/api/users/me',
    { preHandler: [originGuard, authenticate, requireCustomer] },
    async (request, reply) => {
      if (!request.auth) throw new AppError('AUTHENTICATION_REQUIRED');
      const input = bodyOrValidation(request, profileSchema);
      return reply
        .code(200)
        .send(await authService.updateProfile(request.auth.userId, input.displayName.trim()));
    },
  );
}
