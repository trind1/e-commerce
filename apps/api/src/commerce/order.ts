import { createHmac, randomBytes } from 'node:crypto';
import { Prisma, OrderStatus, type PrismaClient } from '@prisma/client';
import type { DatabaseClient } from '../db/client.js';
import { AppError } from '../errors.js';

export interface OrderSummary {
  id: string;
  status: OrderStatus;
  totalMinor: number;
  currency: 'USD';
  createdAt: string;
}

export interface OrderDetail extends OrderSummary {
  statusDates: { placedAt: string; processingAt: string | null; completedAt: string | null };
  items: Array<{
    productId: string;
    productName: string;
    unitPriceMinor: number;
    quantity: number;
    lineSubtotalMinor: number;
    currency: 'USD';
  }>;
}

export interface AdminOrderDetail extends OrderDetail {
  customer: { id: string; email: string };
}

type OrderWithItems = Prisma.OrderGetPayload<{
  include: { items: true; user: { select: { id: true; email: true } } };
}>;

function numberFromBigInt(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Stored integer is outside supported range.');
  return number;
}

function pageBounds(page: { page: number; pageSize: number }): { skip: number; take: number } {
  if (
    !Number.isSafeInteger(page.page) ||
    !Number.isSafeInteger(page.pageSize) ||
    page.page < 1 ||
    page.pageSize < 1 ||
    page.pageSize > 100
  ) {
    throw new AppError('VALIDATION_ERROR');
  }
  const skip = (page.page - 1) * page.pageSize;
  if (!Number.isSafeInteger(skip)) throw new AppError('VALIDATION_ERROR');
  return { skip, take: page.pageSize };
}

function toOrderDetail(order: OrderWithItems): OrderDetail {
  return {
    id: order.id,
    status: order.status,
    totalMinor: numberFromBigInt(order.totalMinor),
    currency: 'USD',
    createdAt: order.createdAt.toISOString(),
    statusDates: {
      placedAt: order.placedAt.toISOString(),
      processingAt: order.processingAt?.toISOString() ?? null,
      completedAt: order.completedAt?.toISOString() ?? null,
    },
    items: order.items.map((item) => ({
      productId: item.productId,
      productName: item.productNameSnapshot,
      unitPriceMinor: numberFromBigInt(item.unitPriceMinor),
      quantity: numberFromBigInt(item.quantity),
      lineSubtotalMinor: numberFromBigInt(item.lineTotalMinor),
      currency: 'USD',
    })),
  };
}

function toAdminOrderDetail(order: OrderWithItems): AdminOrderDetail {
  return { ...toOrderDetail(order), customer: { id: order.user.id, email: order.user.email } };
}

function orderInclude() {
  return {
    items: { orderBy: { id: 'asc' as const } },
    user: { select: { id: true, email: true } },
  };
}

export class OrderService {
  public constructor(
    private readonly database: PrismaClient,
    private readonly idempotencySecret: string | undefined,
  ) {
    this.key = idempotencySecret ? Buffer.from(idempotencySecret, 'utf8') : randomBytes(32);
  }

  private readonly key: Buffer;

  private keyHmac(key: string): Buffer {
    return createHmac('sha256', this.key).update(key, 'utf8').digest();
  }

  private async lockCart(
    transaction: Prisma.TransactionClient,
    userId: string,
  ): Promise<{ id: string; version: bigint } | null> {
    const rows = await transaction.$queryRaw<Array<{ id: string; version: bigint }>>`
      SELECT id, version FROM carts WHERE user_id = ${userId} FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  private async loadOrder(client: DatabaseClient, orderId: string): Promise<OrderWithItems | null> {
    return client.order.findUnique({ where: { id: orderId }, include: orderInclude() });
  }

  public async checkout(
    userId: string,
    cartVersion: number,
    idempotencyKey: string,
  ): Promise<{ order: OrderDetail; replay: boolean }> {
    const keyHmac = this.keyHmac(idempotencyKey);
    try {
      return await this.database.$transaction(async (transaction) => {
        const existing = await transaction.checkoutIdempotency.findUnique({
          where: { userId_keyHmac: { userId, keyHmac } },
        });
        if (existing) {
          if (existing.cartVersion !== BigInt(cartVersion))
            throw new AppError('IDEMPOTENCY_KEY_REUSED');
          if (existing.state === 'COMPLETED' && existing.orderId) {
            const order = await this.loadOrder(transaction, existing.orderId);
            if (order) return { order: toOrderDetail(order), replay: true };
            throw new AppError('CONFLICT');
          }
          throw new AppError('CONFLICT');
        }

        await transaction.checkoutIdempotency.create({
          data: { userId, keyHmac, cartVersion: BigInt(cartVersion) },
        });
        const cart = await this.lockCart(transaction, userId);
        if (!cart) throw new AppError('EMPTY_CART');
        if (cart.version !== BigInt(cartVersion)) throw new AppError('CART_VERSION_CONFLICT');

        const initialCartItems = await transaction.cartItem.findMany({
          where: { cartId: cart.id },
          include: { product: { include: { category: true, inventory: true } } },
          orderBy: { productId: 'asc' },
        });
        if (initialCartItems.length === 0) throw new AppError('EMPTY_CART');

        const productIds = initialCartItems.map((item) => item.productId);
        const categoryIds = [...new Set(initialCartItems.map((item) => item.product.categoryId))];
        await transaction.$queryRaw`
          SELECT id FROM categories WHERE id IN (${Prisma.join(categoryIds)}) ORDER BY id FOR UPDATE
        `;
        await transaction.$queryRaw`
          SELECT id FROM products WHERE id IN (${Prisma.join(productIds)}) ORDER BY id FOR UPDATE
        `;
        const cartItems = await transaction.cartItem.findMany({
          where: { cartId: cart.id },
          include: { product: { include: { category: true, inventory: true } } },
          orderBy: { productId: 'asc' },
        });
        if (cartItems.length === 0) throw new AppError('EMPTY_CART');

        const orderItems = [];
        let totalMinor = 0n;
        for (const item of cartItems) {
          if (!item.product.isActive || !item.product.category.isActive)
            throw new AppError('PRODUCT_UNAVAILABLE');
          const stock = item.product.inventory?.quantity ?? 0n;
          if (item.quantity > stock) throw new AppError('INSUFFICIENT_STOCK');
          const update = await transaction.inventory.updateMany({
            where: { productId: item.productId, quantity: { gte: item.quantity } },
            data: { quantity: { decrement: item.quantity } },
          });
          if (update.count !== 1) throw new AppError('INSUFFICIENT_STOCK');
          const lineTotalMinor = item.product.priceMinor * item.quantity;
          totalMinor += lineTotalMinor;
          orderItems.push({
            productId: item.productId,
            productNameSnapshot: item.product.name,
            unitPriceMinor: item.product.priceMinor,
            quantity: item.quantity,
            lineTotalMinor,
            currency: 'USD',
          });
        }

        const created = await transaction.order.create({
          data: {
            userId,
            totalMinor,
            status: OrderStatus.PLACED,
            items: { create: orderItems },
          },
          include: orderInclude(),
        });
        await transaction.cartItem.deleteMany({ where: { cartId: cart.id } });
        await transaction.cart.update({
          where: { id: cart.id },
          data: { version: { increment: 1n } },
        });
        await transaction.checkoutIdempotency.update({
          where: { userId_keyHmac: { userId, keyHmac } },
          data: { state: 'COMPLETED', orderId: created.id, completedAt: new Date() },
        });
        return { order: toOrderDetail(created), replay: false };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.database.checkoutIdempotency.findUnique({
          where: { userId_keyHmac: { userId, keyHmac } },
        });
        if (existing && existing.cartVersion !== BigInt(cartVersion)) {
          throw new AppError('IDEMPOTENCY_KEY_REUSED');
        }
        if (
          existing?.cartVersion === BigInt(cartVersion) &&
          existing.state === 'COMPLETED' &&
          existing.orderId
        ) {
          const order = await this.loadOrder(this.database, existing.orderId);
          if (order) return { order: toOrderDetail(order), replay: true };
        }
        throw new AppError('CONFLICT');
      }
      throw error;
    }
  }

  public async listCustomerOrders(
    userId: string,
    page: { page: number; pageSize: number },
  ): Promise<{ items: OrderSummary[]; totalItems: number }> {
    const bounds = pageBounds(page);
    const [orders, totalItems] = await Promise.all([
      this.database.order.findMany({
        where: { userId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...bounds,
      }),
      this.database.order.count({ where: { userId } }),
    ]);
    return {
      items: orders.map((order) => ({
        id: order.id,
        status: order.status,
        totalMinor: numberFromBigInt(order.totalMinor),
        currency: 'USD',
        createdAt: order.createdAt.toISOString(),
      })),
      totalItems,
    };
  }

  public async getCustomerOrder(userId: string, orderId: string): Promise<OrderDetail> {
    const order = await this.database.order.findFirst({
      where: { id: orderId, userId },
      include: orderInclude(),
    });
    if (!order) throw new AppError('ORDER_NOT_FOUND');
    return toOrderDetail(order);
  }

  public async listAdminOrders(
    page: { page: number; pageSize: number },
    status?: OrderStatus,
  ): Promise<{ items: AdminOrderDetail[]; totalItems: number }> {
    const where = status ? { status } : {};
    const bounds = pageBounds(page);
    const [orders, totalItems] = await Promise.all([
      this.database.order.findMany({
        where,
        include: orderInclude(),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...bounds,
      }),
      this.database.order.count({ where }),
    ]);
    return { items: orders.map(toAdminOrderDetail), totalItems };
  }

  public async getAdminOrder(orderId: string): Promise<AdminOrderDetail> {
    const order = await this.loadOrder(this.database, orderId);
    if (!order) throw new AppError('ORDER_NOT_FOUND');
    return toAdminOrderDetail(order);
  }

  public async updateStatus(orderId: string, status: OrderStatus): Promise<AdminOrderDetail> {
    const order = await this.database.order.findUnique({ where: { id: orderId } });
    if (!order) throw new AppError('ORDER_NOT_FOUND');
    const expected =
      order.status === OrderStatus.PLACED
        ? OrderStatus.PROCESSING
        : order.status === OrderStatus.PROCESSING
          ? OrderStatus.COMPLETED
          : null;
    if (status !== expected) throw new AppError('INVALID_ORDER_TRANSITION');
    const now = new Date();
    const updated = await this.database.order.updateMany({
      where: { id: orderId, status: order.status },
      data:
        status === OrderStatus.PROCESSING
          ? { status, processingAt: now }
          : { status, completedAt: now },
    });
    if (updated.count !== 1) throw new AppError('INVALID_ORDER_TRANSITION');
    return this.getAdminOrder(orderId);
  }
}
