import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { createErrorBody } from '@ecommerce/contracts';
import type { AppConfig } from './config.js';
import { AppError, validationError } from './errors.js';
import { registerAuthRoutes } from './auth/routes.js';
import { SessionService } from './auth/session.js';
import { AuthService } from './auth/service.js';
import { createDatabaseClient } from './db/client.js';
import { registerCatalogRoutes } from './catalog/routes.js';
import { CatalogService } from './catalog/service.js';
import { registerCommerceRoutes } from './commerce/routes.js';
import { CartService } from './commerce/cart.js';
import { OrderService } from './commerce/order.js';

export interface BuildAppOptions {
  config: AppConfig;
  logger?: FastifyServerOptions['logger'];
  database?: PrismaClient;
}

export function buildApp(options: BuildAppOptions): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  const database =
    options.database ??
    (options.config.DATABASE_URL ? createDatabaseClient(options.config.DATABASE_URL) : undefined);
  const sessions = database
    ? new SessionService(database, {
        absoluteTtlSeconds: options.config.SESSION_ABSOLUTE_TTL_SECONDS,
        idleTtlSeconds: options.config.SESSION_IDLE_TTL_SECONDS,
        hmacSecret: options.config.SESSION_HMAC_SECRET,
      })
    : undefined;

  app.decorateRequest('auth', null);
  app.decorateRequest('sessionToken', null);

  app.addHook('onRequest', async (request, reply) => {
    const requestId = randomUUID();
    request.headers['x-request-id'] = requestId;
    reply.header('x-request-id', requestId);
  });

  app.addHook('onRequest', async (request, reply) => {
    const origin = request.headers.origin;
    if (origin === options.config.CORS_ORIGIN) {
      reply.header('access-control-allow-origin', origin);
      reply.header('access-control-allow-credentials', 'true');
      reply.header('access-control-allow-headers', 'Content-Type, Idempotency-Key');
      reply.header('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
      reply.header('vary', 'Origin');
    }
  });

  app.options('/api/*', async (_request, reply) => reply.code(204).send());

  if (database && sessions) {
    registerAuthRoutes(app, new AuthService(database, sessions), sessions, options.config);
    registerCatalogRoutes(app, new CatalogService(database), sessions, options.config);
    registerCommerceRoutes(
      app,
      new CartService(database),
      new OrderService(database, options.config.SESSION_HMAC_SECRET),
      sessions,
      options.config,
    );
    app.addHook('onClose', async () => {
      if (!options.database) await database.$disconnect();
    });
  }

  app.get('/health', async () => ({ status: 'ok', environment: options.config.NODE_ENV }));
  app.get('/ready', async (_request, reply) => {
    if (!database) return reply.code(503).send({ status: 'unavailable' });

    try {
      await database.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });

  app.setNotFoundHandler((request, reply) => {
    const requestId = request.headers['x-request-id'] as string;
    return reply.status(404).send(createErrorBody('NOT_FOUND', 'Resource not found', requestId));
  });

  app.setErrorHandler((error, request, reply) => {
    const requestId = request.headers['x-request-id'] as string;

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send(error.toResponse(requestId));
    }

    if (error instanceof ZodError) {
      return reply.status(400).send(validationError(requestId));
    }

    request.log.error({ requestId, errorCode: 'UNEXPECTED' }, 'Unexpected application error');
    return reply
      .status(500)
      .send(createErrorBody('INTERNAL_ERROR', 'An unexpected error occurred', requestId));
  });

  return app;
}
