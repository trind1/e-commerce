import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { OrderService } from './order.js';

describe('OrderService pagination', () => {
  it('rejects a page whose calculated database offset is not a safe integer', async () => {
    const orders = new OrderService({} as PrismaClient, 'test-idempotency-secret');

    await expect(
      orders.listCustomerOrders('customer-id', {
        page: Number.MAX_SAFE_INTEGER,
        pageSize: 100,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
