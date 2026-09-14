import type { FastifyInstance, FastifyRequest } from 'fastify';
import { OrderStatus } from '@prisma/client';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import { AppError } from '../errors.js';
import {
  createAuthenticationGuard,
  createOriginGuard,
  requireAdmin,
  requireCustomer,
} from '../auth/guards.js';
import type { SessionService } from '../auth/session.js';
import { collectionPage, pageQuerySchema, parseInput, parsePathId } from '../http/input.js';
import type { CartService } from './cart.js';
import type { OrderService } from './order.js';

const addItemSchema = z
  .object({ productId: z.string().uuid(), quantity: z.number().int().safe().positive() })
  .strict();
const updateItemSchema = z.object({ quantity: z.number().int().safe().nonnegative() }).strict();
const checkoutSchema = z.object({ cartVersion: z.number().int().safe().positive() }).strict();
const orderStatusSchema = z.object({ status: z.string().min(1) }).strict();
const orderQuerySchema = pageQuerySchema.extend({ status: z.nativeEnum(OrderStatus).optional() });

function body<T>(request: FastifyRequest, schema: z.ZodType<T>): T {
  return parseInput(request, schema, request.body);
}
function query<T>(request: FastifyRequest, schema: z.ZodType<T>): T {
  return parseInput(request, schema, request.query);
}

export function registerCommerceRoutes(
  app: FastifyInstance,
  cart: CartService,
  orders: OrderService,
  sessions: SessionService,
  config: AppConfig,
): void {
  const authenticate = createAuthenticationGuard(sessions, config);
  const origin = createOriginGuard(config);
  const customer = [origin, authenticate, requireCustomer];
  const admin = [origin, authenticate, requireAdmin];

  app.get('/api/cart', { preHandler: [authenticate, requireCustomer] }, async (request, reply) => {
    if (!request.auth) throw new AppError('AUTHENTICATION_REQUIRED');
    return reply.send(await cart.getCart(request.auth.userId));
  });
  app.post('/api/cart/items', { preHandler: customer }, async (request, reply) => {
    if (!request.auth) throw new AppError('AUTHENTICATION_REQUIRED');
    const input = body(request, addItemSchema);
    return reply.send(await cart.addItem(request.auth.userId, input.productId, input.quantity));
  });
  app.patch('/api/cart/items/:productId', { preHandler: customer }, async (request, reply) => {
    if (!request.auth) throw new AppError('AUTHENTICATION_REQUIRED');
    const productId = parsePathId(request, (request.params as { productId?: unknown }).productId);
    return reply.send(
      await cart.updateItem(
        request.auth.userId,
        productId,
        body(request, updateItemSchema).quantity,
      ),
    );
  });
  app.delete('/api/cart/items/:productId', { preHandler: customer }, async (request, reply) => {
    if (!request.auth) throw new AppError('AUTHENTICATION_REQUIRED');
    const productId = parsePathId(request, (request.params as { productId?: unknown }).productId);
    await cart.removeItem(request.auth.userId, productId);
    return reply.code(204).send();
  });

  app.post('/api/orders', { preHandler: customer }, async (request, reply) => {
    if (!request.auth) throw new AppError('AUTHENTICATION_REQUIRED');
    const idempotencyKey = request.headers['idempotency-key'];
    const key = typeof idempotencyKey === 'string' ? idempotencyKey : undefined;
    if (!key || !z.string().uuid().safeParse(key).success) throw new AppError('VALIDATION_ERROR');
    const input = body(request, checkoutSchema);
    const result = await orders.checkout(request.auth.userId, input.cartVersion, key);
    return reply.code(result.replay ? 200 : 201).send(result.order);
  });
  app.get(
    '/api/orders',
    { preHandler: [authenticate, requireCustomer] },
    async (request, reply) => {
      if (!request.auth) throw new AppError('AUTHENTICATION_REQUIRED');
      const input = query(request, pageQuerySchema);
      const result = await orders.listCustomerOrders(request.auth.userId, input);
      return reply.send(
        collectionPage(result.items, input.page, input.pageSize, result.totalItems),
      );
    },
  );
  app.get(
    '/api/orders/:orderId',
    { preHandler: [authenticate, requireCustomer] },
    async (request, reply) => {
      if (!request.auth) throw new AppError('AUTHENTICATION_REQUIRED');
      const orderId = parsePathId(request, (request.params as { orderId?: unknown }).orderId);
      return reply.send(await orders.getCustomerOrder(request.auth.userId, orderId));
    },
  );

  app.get(
    '/api/admin/orders',
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const input = query(request, orderQuerySchema);
      const result = await orders.listAdminOrders(input, input.status);
      return reply.send(
        collectionPage(result.items, input.page, input.pageSize, result.totalItems),
      );
    },
  );
  app.get(
    '/api/admin/orders/:orderId',
    { preHandler: [authenticate, requireAdmin] },
    async (request, reply) => {
      const orderId = parsePathId(request, (request.params as { orderId?: unknown }).orderId);
      return reply.send(await orders.getAdminOrder(orderId));
    },
  );
  app.patch('/api/admin/orders/:orderId', { preHandler: admin }, async (request, reply) => {
    const orderId = parsePathId(request, (request.params as { orderId?: unknown }).orderId);
    const input = body(request, orderStatusSchema);
    if (!Object.values(OrderStatus).includes(input.status as OrderStatus)) {
      throw new AppError('INVALID_STATUS');
    }
    return reply.send(await orders.updateStatus(orderId, input.status as OrderStatus));
  });
}
