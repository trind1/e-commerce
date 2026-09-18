import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { Role } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import type { AppConfig } from '../config.js';
import { createTestDatabase, resetTestDatabase } from './test/database.js';

const database = createTestDatabase();
const config: AppConfig = {
  NODE_ENV: 'test',
  API_HOST: '127.0.0.1',
  API_PORT: 3000,
  CORS_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: process.env.TEST_DATABASE_URL,
  DATABASE_CONNECTION_LIMIT: 5,
  DATABASE_POOL_TIMEOUT_SECONDS: 10,
  SESSION_HMAC_SECRET: 'test-session-hmac-secret-0123456789',
  SESSION_ABSOLUTE_TTL_SECONDS: 28_800,
  SESSION_IDLE_TTL_SECONDS: 1_800,
};

const app: FastifyInstance = buildApp({ config, database });

function cookieFrom(response: { headers: Record<string, unknown> }): string {
  const value = response.headers['set-cookie'];
  const first = Array.isArray(value) ? value[0] : typeof value === 'string' ? value : undefined;
  if (!first || typeof first !== 'string') throw new Error('Expected a session cookie.');
  const cookie = first.split(';')[0];
  if (!cookie) throw new Error('Expected a session cookie.');
  return cookie;
}

async function createCustomer(email: string): Promise<{ id: string; cookie: string }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password: 'customer-pass', displayName: 'Test Customer' },
  });
  expect(response.statusCode).toBe(201);
  const user = await database.user.findUniqueOrThrow({ where: { email: email.toLowerCase() } });
  return { id: user.id, cookie: cookieFrom(response) };
}

async function createAdmin(email = 'admin@example.com'): Promise<{ id: string; cookie: string }> {
  const passwordHash = await argon2.hash('admin-pass', { type: argon2.argon2id });
  const user = await database.user.create({
    data: { email, passwordHash, role: Role.ADMIN, displayName: 'Test Admin' },
  });
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: 'admin-pass' },
  });
  expect(response.statusCode).toBe(200);
  return { id: user.id, cookie: cookieFrom(response) };
}

async function createCategory(name: string) {
  return database.category.create({ data: { name } });
}

async function createProduct(
  categoryId: string,
  input: { name: string; description?: string; priceMinor?: bigint; stock?: bigint },
) {
  return database.product.create({
    data: {
      categoryId,
      name: input.name,
      description: input.description ?? `${input.name} description`,
      priceMinor: input.priceMinor ?? 1_000n,
      inventory: { create: { quantity: input.stock ?? 5n } },
    },
  });
}

async function addToCart(cookie: string, productId: string, quantity: number) {
  return app.inject({
    method: 'POST',
    url: '/api/cart/items',
    headers: { cookie, origin: config.CORS_ORIGIN },
    payload: { productId, quantity },
  });
}

async function checkout(cookie: string, cartVersion: number, idempotencyKey = randomUUID()) {
  return app.inject({
    method: 'POST',
    url: '/api/orders',
    headers: { cookie, origin: config.CORS_ORIGIN, 'idempotency-key': idempotencyKey },
    payload: { cartVersion },
  });
}

describe('MVP API integration', () => {
  beforeAll(async () => {
    await database.$connect();
    await app.ready();
  });

  beforeEach(async () => {
    await resetTestDatabase(database);
  });

  afterAll(async () => {
    await app.close();
    await database.$disconnect();
  });

  it('registers a customer, renews an idle session, and serves active catalog data', async () => {
    const category = await createCategory('Hardware');
    const product = await createProduct(category.id, {
      name: 'Keyboard',
      description: 'Mechanical keyboard',
      priceMinor: 12_500n,
      stock: 2n,
    });
    const customer = await createCustomer('Customer@Example.com');

    const categories = await app.inject({ method: 'GET', url: '/api/categories' });
    expect(categories.statusCode).toBe(200);
    expect(categories.json().items).toEqual([{ id: category.id, name: 'Hardware' }]);

    const products = await app.inject({ method: 'GET', url: '/api/products?q=MECHANICAL' });
    expect(products.statusCode).toBe(200);
    expect(products.json().items).toMatchObject([
      {
        id: product.id,
        name: 'Keyboard',
        priceMinor: 12_500,
        currency: 'USD',
        stockStatus: 'IN_STOCK',
      },
    ]);
    expect(products.body).not.toContain('stockQuantity');

    const profile = await app.inject({
      method: 'GET',
      url: '/api/users/me',
      headers: { cookie: customer.cookie },
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json()).toEqual({ email: 'customer@example.com', displayName: 'Test Customer' });

    const sessionRow = await database.authSession.findFirstOrThrow({
      where: { userId: customer.id },
    });
    const originalHmac = sessionRow.tokenHmac;
    await database.authSession.update({
      where: { id: sessionRow.id },
      data: { lastSeenAt: new Date(Date.now() - 1_000_000) },
    });
    const renewed = await app.inject({
      method: 'GET',
      url: '/api/auth/session',
      headers: { cookie: customer.cookie },
    });
    expect(renewed.statusCode).toBe(200);
    const replacementCookie = cookieFrom(renewed);
    expect(replacementCookie).not.toBe(customer.cookie);
    const renewedRow = await database.authSession.findUniqueOrThrow({
      where: { id: sessionRow.id },
    });
    expect(Buffer.from(renewedRow.tokenHmac).equals(Buffer.from(originalHmac))).toBe(false);
    await expect(
      app.inject({ method: 'GET', url: '/api/auth/session', headers: { cookie: customer.cookie } }),
    ).resolves.toMatchObject({ statusCode: 401 });
    await expect(
      app.inject({
        method: 'GET',
        url: '/api/auth/session',
        headers: { cookie: replacementCookie },
      }),
    ).resolves.toMatchObject({ statusCode: 200 });
  });

  it('creates one empty cart atomically with a newly registered Customer', async () => {
    const registration = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'new-customer@example.com', password: 'customer-pass' },
    });
    expect(registration.statusCode).toBe(201);

    const user = await database.user.findUniqueOrThrow({
      where: { email: 'new-customer@example.com' },
    });
    await expect(
      database.cart.findUniqueOrThrow({ where: { userId: user.id } }),
    ).resolves.toMatchObject({ userId: user.id, version: 0n });

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: ' NEW-CUSTOMER@example.com ', password: 'customer-pass' },
    });
    expect(duplicate.statusCode).toBe(409);
    await expect(database.user.count()).resolves.toBe(1);
    await expect(database.cart.count()).resolves.toBe(1);
  });

  it('enforces catalog lifecycle and Admin category/product/inventory controls', async () => {
    const admin = await createAdmin();
    const createdCategory = await app.inject({
      method: 'POST',
      url: '/api/admin/categories',
      headers: { cookie: admin.cookie, origin: config.CORS_ORIGIN },
      payload: { name: ' Home ' },
    });
    expect(createdCategory.statusCode).toBe(201);
    const categoryId = createdCategory.json().id as string;

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/admin/categories',
      headers: { cookie: admin.cookie, origin: config.CORS_ORIGIN },
      payload: { name: 'home' },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe('CATEGORY_NAME_EXISTS');

    const renamedCategory = await app.inject({
      method: 'PATCH',
      url: `/api/admin/categories/${categoryId}`,
      headers: { cookie: admin.cookie, origin: config.CORS_ORIGIN },
      payload: { name: 'Lighting' },
    });
    expect(renamedCategory.statusCode).toBe(200);
    expect(renamedCategory.json()).toMatchObject({ id: categoryId, name: 'Lighting' });

    const deactivated = await app.inject({
      method: 'PATCH',
      url: `/api/admin/categories/${categoryId}`,
      headers: { cookie: admin.cookie, origin: config.CORS_ORIGIN },
      payload: { isActive: false },
    });
    expect(deactivated.statusCode).toBe(200);

    const blockedProduct = await app.inject({
      method: 'POST',
      url: '/api/admin/products',
      headers: { cookie: admin.cookie, origin: config.CORS_ORIGIN },
      payload: {
        name: 'Blocked product',
        description: 'Cannot use inactive category',
        priceMinor: 1_000,
        categoryId,
        initialStock: 2,
      },
    });
    expect(blockedProduct.statusCode).toBe(409);
    expect(blockedProduct.json().error.code).toBe('CATEGORY_INACTIVE');

    await app.inject({
      method: 'PATCH',
      url: `/api/admin/categories/${categoryId}`,
      headers: { cookie: admin.cookie, origin: config.CORS_ORIGIN },
      payload: { isActive: true },
    });
    const productResponse = await app.inject({
      method: 'POST',
      url: '/api/admin/products',
      headers: { cookie: admin.cookie, origin: config.CORS_ORIGIN },
      payload: {
        name: 'Lamp',
        description: 'Warm desk lamp',
        priceMinor: 2_500,
        categoryId,
        initialStock: 3,
      },
    });
    expect(productResponse.statusCode).toBe(201);
    const productId = productResponse.json().id as string;

    const replacementCategory = await app.inject({
      method: 'POST',
      url: '/api/admin/categories',
      headers: { cookie: admin.cookie, origin: config.CORS_ORIGIN },
      payload: { name: 'Office' },
    });
    expect(replacementCategory.statusCode).toBe(201);
    const updatedProduct = await app.inject({
      method: 'PATCH',
      url: `/api/admin/products/${productId}`,
      headers: { cookie: admin.cookie, origin: config.CORS_ORIGIN },
      payload: {
        name: 'Reading lamp',
        description: 'Warm adjustable desk lamp',
        priceMinor: 2_750,
        categoryId: replacementCategory.json().id,
      },
    });
    expect(updatedProduct.statusCode).toBe(200);
    expect(updatedProduct.json()).toMatchObject({
      id: productId,
      name: 'Reading lamp',
      description: 'Warm adjustable desk lamp',
      priceMinor: 2_750,
      category: { id: replacementCategory.json().id, name: 'Office' },
    });

    const inventory = await app.inject({
      method: 'PATCH',
      url: `/api/admin/inventory/${productId}`,
      headers: { cookie: admin.cookie, origin: config.CORS_ORIGIN },
      payload: { quantity: 0 },
    });
    expect(inventory.statusCode).toBe(200);
    expect(inventory.json()).toMatchObject({ productId, quantity: 0 });

    const publicOutOfStock = await app.inject({ method: 'GET', url: `/api/products/${productId}` });
    expect(publicOutOfStock.statusCode).toBe(200);
    expect(publicOutOfStock.json().stockStatus).toBe('OUT_OF_STOCK');

    const deactivatedProduct = await app.inject({
      method: 'PATCH',
      url: `/api/admin/products/${productId}`,
      headers: { cookie: admin.cookie, origin: config.CORS_ORIGIN },
      payload: { isActive: false },
    });
    expect(deactivatedProduct.statusCode).toBe(200);
    const hiddenProduct = await app.inject({ method: 'GET', url: `/api/products/${productId}` });
    expect(hiddenProduct.statusCode).toBe(404);
  });

  it('merges cart lines and atomically creates an idempotent immutable order', async () => {
    const category = await createCategory('Office');
    const product = await createProduct(category.id, {
      name: 'Notebook',
      priceMinor: 1_250n,
      stock: 5n,
    });
    const customer = await createCustomer('buyer@example.com');

    const missingLine = await app.inject({
      method: 'PATCH',
      url: `/api/cart/items/${product.id}`,
      headers: { cookie: customer.cookie, origin: config.CORS_ORIGIN },
      payload: { quantity: 1 },
    });
    expect(missingLine.statusCode).toBe(404);
    expect(missingLine.json().error.code).toBe('CART_ITEM_NOT_FOUND');
    expect(await database.cart.count({ where: { userId: customer.id } })).toBe(1);

    const firstAdd = await addToCart(customer.cookie, product.id, 2);
    expect(firstAdd.statusCode).toBe(200);
    expect(firstAdd.json()).toMatchObject({ version: 1, subtotalMinor: 2_500 });
    const secondAdd = await addToCart(customer.cookie, product.id, 1);
    expect(secondAdd.statusCode).toBe(200);
    expect(secondAdd.json().items[0].quantity).toBe(3);

    await database.product.update({ where: { id: product.id }, data: { priceMinor: 1_500n } });
    const currentCart = await app.inject({
      method: 'GET',
      url: '/api/cart',
      headers: { cookie: customer.cookie },
    });
    expect(currentCart.json()).toMatchObject({ subtotalMinor: 4_500, totalMinor: 4_500 });
    const cartVersion = currentCart.json().version as number;
    const idempotencyKey = randomUUID();

    const order = await checkout(customer.cookie, cartVersion, idempotencyKey);
    expect(order.statusCode).toBe(201);
    expect(order.json()).toMatchObject({
      status: 'PLACED',
      totalMinor: 4_500,
      items: [
        {
          productId: product.id,
          productName: 'Notebook',
          unitPriceMinor: 1_500,
          quantity: 3,
          lineSubtotalMinor: 4_500,
        },
      ],
    });
    const orderId = order.json().id as string;
    expect(
      (await database.inventory.findUniqueOrThrow({ where: { productId: product.id } })).quantity,
    ).toBe(2n);
    expect((await database.cartItem.count()).toString()).toBe('0');

    const replay = await checkout(customer.cookie, cartVersion, idempotencyKey);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().id).toBe(orderId);
    expect(
      (await database.inventory.findUniqueOrThrow({ where: { productId: product.id } })).quantity,
    ).toBe(2n);

    const reused = await checkout(customer.cookie, cartVersion + 1, idempotencyKey);
    expect(reused.statusCode).toBe(409);
    expect(reused.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED');

    await database.product.update({
      where: { id: product.id },
      data: { name: 'Renamed notebook', priceMinor: 9_999n },
    });
    const detail = await app.inject({
      method: 'GET',
      url: `/api/orders/${orderId}`,
      headers: { cookie: customer.cookie },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      id: orderId,
      totalMinor: 4_500,
      items: [{ productName: 'Notebook', unitPriceMinor: 1_500, lineSubtotalMinor: 4_500 }],
    });
  });

  it('allows only one concurrent checkout to claim the last unit', async () => {
    const category = await createCategory('Limited');
    const product = await createProduct(category.id, { name: 'Last unit', stock: 1n });
    const first = await createCustomer('first-buyer@example.com');
    const second = await createCustomer('second-buyer@example.com');
    await addToCart(first.cookie, product.id, 1);
    await addToCart(second.cookie, product.id, 1);

    const [firstCart, secondCart] = await Promise.all([
      app.inject({ method: 'GET', url: '/api/cart', headers: { cookie: first.cookie } }),
      app.inject({ method: 'GET', url: '/api/cart', headers: { cookie: second.cookie } }),
    ]);
    const [firstOrder, secondOrder] = await Promise.all([
      checkout(first.cookie, firstCart.json().version),
      checkout(second.cookie, secondCart.json().version),
    ]);
    expect([firstOrder.statusCode, secondOrder.statusCode].sort()).toEqual([201, 409]);
    expect(await database.order.count()).toBe(1);
    expect(
      (await database.inventory.findUniqueOrThrow({ where: { productId: product.id } })).quantity,
    ).toBe(0n);
  });

  it('protects Admin order transitions and customer ownership boundaries', async () => {
    const category = await createCategory('Orders');
    const product = await createProduct(category.id, { name: 'Order item', stock: 2n });
    const customer = await createCustomer('order-customer@example.com');
    const otherCustomer = await createCustomer('other-customer@example.com');
    const admin = await createAdmin('orders-admin@example.com');
    await addToCart(customer.cookie, product.id, 1);
    const cart = await app.inject({
      method: 'GET',
      url: '/api/cart',
      headers: { cookie: customer.cookie },
    });
    const created = await checkout(customer.cookie, cart.json().version);
    const orderId = created.json().id as string;

    const customerAdminList = await app.inject({
      method: 'GET',
      url: '/api/admin/orders',
      headers: { cookie: customer.cookie },
    });
    expect(customerAdminList.statusCode).toBe(403);
    const privateNotFound = await app.inject({
      method: 'GET',
      url: `/api/orders/${orderId}`,
      headers: { cookie: otherCustomer.cookie },
    });
    expect(privateNotFound.statusCode).toBe(404);
    expect(privateNotFound.json().error.code).toBe('ORDER_NOT_FOUND');

    const processing = await app.inject({
      method: 'PATCH',
      url: `/api/admin/orders/${orderId}`,
      headers: { cookie: admin.cookie, origin: config.CORS_ORIGIN },
      payload: { status: 'PROCESSING' },
    });
    expect(processing.statusCode).toBe(200);
    const completed = await app.inject({
      method: 'PATCH',
      url: `/api/admin/orders/${orderId}`,
      headers: { cookie: admin.cookie, origin: config.CORS_ORIGIN },
      payload: { status: 'COMPLETED' },
    });
    expect(completed.statusCode).toBe(200);
    const reversal = await app.inject({
      method: 'PATCH',
      url: `/api/admin/orders/${orderId}`,
      headers: { cookie: admin.cookie, origin: config.CORS_ORIGIN },
      payload: { status: 'PLACED' },
    });
    expect(reversal.statusCode).toBe(409);
    expect(reversal.json().error.code).toBe('INVALID_ORDER_TRANSITION');
    const invalidStatus = await app.inject({
      method: 'PATCH',
      url: `/api/admin/orders/${orderId}`,
      headers: { cookie: admin.cookie, origin: config.CORS_ORIGIN },
      payload: { status: 'CANCELLED' },
    });
    expect(invalidStatus.statusCode).toBe(400);
    expect(invalidStatus.json().error.code).toBe('INVALID_STATUS');
    expect(invalidStatus.body).not.toContain('passwordHash');
  });

  it('rolls back cart and inventory on checkout conflicts', async () => {
    const category = await createCategory('Rollback');
    const product = await createProduct(category.id, { name: 'Unavailable', stock: 1n });
    const customer = await createCustomer('rollback-buyer@example.com');
    await addToCart(customer.cookie, product.id, 1);
    const cart = await app.inject({
      method: 'GET',
      url: '/api/cart',
      headers: { cookie: customer.cookie },
    });
    await database.inventory.update({ where: { productId: product.id }, data: { quantity: 0n } });

    const failed = await checkout(customer.cookie, cart.json().version);
    expect(failed.statusCode).toBe(409);
    expect(failed.json().error.code).toBe('INSUFFICIENT_STOCK');
    expect(await database.order.count()).toBe(0);
    expect(await database.checkoutIdempotency.count()).toBe(0);
    expect(await database.cartItem.count()).toBe(1);
    expect(
      (await database.inventory.findUniqueOrThrow({ where: { productId: product.id } })).quantity,
    ).toBe(0n);
  });
});
