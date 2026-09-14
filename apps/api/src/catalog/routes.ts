import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import { collectionPage, pageQuerySchema, parseInput, parsePathId } from '../http/input.js';
import { createAuthenticationGuard, createOriginGuard, requireAdmin } from '../auth/guards.js';
import type { SessionService } from '../auth/session.js';
import type { CatalogService } from './service.js';

const publicProductQuerySchema = pageQuerySchema.extend({
  q: z.string().max(120).optional(),
  categoryId: z.string().uuid().optional(),
});
const booleanQuery = z.preprocess(
  (value) => (value === 'true' ? true : value === 'false' ? false : value),
  z.boolean(),
);
const adminCategoryQuerySchema = pageQuerySchema.extend({
  isActive: booleanQuery.optional(),
});
const adminProductQuerySchema = publicProductQuerySchema.extend({
  isActive: booleanQuery.optional(),
});
const inventoryQuerySchema = pageQuerySchema.extend({
  q: z.string().max(120).optional(),
  stock: z.enum(['in', 'out']).optional(),
});
const createCategorySchema = z.object({ name: z.string().trim().min(1).max(120) }).strict();
const updateCategorySchema = z
  .object({ name: z.string().trim().min(1).max(120).optional(), isActive: z.boolean().optional() })
  .strict();
const createProductSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().min(1).max(4000),
    priceMinor: z.number().int().safe().positive(),
    categoryId: z.string().uuid(),
    initialStock: z.number().int().safe().nonnegative(),
  })
  .strict();
const updateProductSchema = createProductSchema
  .partial()
  .omit({ initialStock: true })
  .extend({ isActive: z.boolean().optional() })
  .strict();
const inventorySchema = z.object({ quantity: z.number().int().safe().nonnegative() }).strict();

function query<T>(request: FastifyRequest, schema: z.ZodType<T>): T {
  return parseInput(request, schema, request.query);
}

function body<T>(request: FastifyRequest, schema: z.ZodType<T>): T {
  return parseInput(request, schema, request.body);
}

export function registerCatalogRoutes(
  app: FastifyInstance,
  catalog: CatalogService,
  sessions: SessionService,
  config: AppConfig,
): void {
  const authenticate = createAuthenticationGuard(sessions, config);
  const origin = createOriginGuard(config);
  const admin = [authenticate, requireAdmin];
  const adminWrite = [origin, authenticate, requireAdmin];

  app.get('/api/categories', async (request, reply) => {
    const input = query(request, pageQuerySchema);
    const result = await catalog.listCategories(input);
    return reply.send(collectionPage(result.items, input.page, input.pageSize, result.totalItems));
  });

  app.get('/api/products', async (request, reply) => {
    const input = query(request, publicProductQuerySchema);
    const result = await catalog.listProducts(input);
    return reply.send(collectionPage(result.items, input.page, input.pageSize, result.totalItems));
  });

  app.get('/api/products/:productId', async (request, reply) => {
    const productId = parsePathId(request, (request.params as { productId?: unknown }).productId);
    return reply.send(await catalog.getProduct(productId));
  });

  app.get('/api/admin/categories', { preHandler: admin }, async (request, reply) => {
    const input = query(request, adminCategoryQuerySchema);
    const result = await catalog.listCategories(input, true);
    return reply.send(collectionPage(result.items, input.page, input.pageSize, result.totalItems));
  });

  app.post('/api/admin/categories', { preHandler: adminWrite }, async (request, reply) => {
    const input = body(request, createCategorySchema);
    return reply.code(201).send(await catalog.createCategory(input.name));
  });

  app.patch(
    '/api/admin/categories/:categoryId',
    { preHandler: adminWrite },
    async (request, reply) => {
      const categoryId = parsePathId(
        request,
        (request.params as { categoryId?: unknown }).categoryId,
      );
      return reply.send(
        await catalog.updateCategory(categoryId, body(request, updateCategorySchema)),
      );
    },
  );

  app.get('/api/admin/products', { preHandler: admin }, async (request, reply) => {
    const input = query(request, adminProductQuerySchema);
    const result = await catalog.listProducts(input, true);
    return reply.send(collectionPage(result.items, input.page, input.pageSize, result.totalItems));
  });

  app.post('/api/admin/products', { preHandler: adminWrite }, async (request, reply) => {
    return reply.code(201).send(await catalog.createProduct(body(request, createProductSchema)));
  });

  app.patch(
    '/api/admin/products/:productId',
    { preHandler: adminWrite },
    async (request, reply) => {
      const productId = parsePathId(request, (request.params as { productId?: unknown }).productId);
      return reply.send(await catalog.updateProduct(productId, body(request, updateProductSchema)));
    },
  );

  app.get('/api/admin/inventory', { preHandler: admin }, async (request, reply) => {
    const input = query(request, inventoryQuerySchema);
    const result = await catalog.listInventory(input);
    return reply.send(collectionPage(result.items, input.page, input.pageSize, result.totalItems));
  });

  app.patch(
    '/api/admin/inventory/:productId',
    { preHandler: adminWrite },
    async (request, reply) => {
      const productId = parsePathId(request, (request.params as { productId?: unknown }).productId);
      return reply.send(
        await catalog.setInventory(productId, body(request, inventorySchema).quantity),
      );
    },
  );
}
