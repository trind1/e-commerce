import type { Prisma, PrismaClient } from '@prisma/client';
import type { DatabaseClient } from '../db/client.js';
import { AppError } from '../errors.js';

export type CartAvailability = 'AVAILABLE' | 'UNAVAILABLE' | 'INSUFFICIENT_STOCK';

export interface CartLine {
  product: {
    id: string;
    name: string;
    description: string;
    priceMinor: number;
    currency: 'USD';
    category: { id: string; name: string };
    stockStatus: 'IN_STOCK' | 'OUT_OF_STOCK';
  };
  quantity: number;
  currentUnitPriceMinor: number;
  lineSubtotalMinor: number;
  availability: CartAvailability;
}

export interface CartView {
  version: number;
  items: CartLine[];
  subtotalMinor: number;
  totalMinor: number;
  currency: 'USD';
}

type CartWithItems = Prisma.CartGetPayload<{
  include: { items: { include: { product: { include: { category: true; inventory: true } } } } };
}>;

function numberFromBigInt(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Stored integer is outside supported range.');
  return number;
}

function toCartView(cart: CartWithItems): CartView {
  const items = cart.items.map((item) => {
    const priceMinor = numberFromBigInt(item.product.priceMinor);
    const quantity = numberFromBigInt(item.quantity);
    const isLifecycleAvailable = item.product.isActive && item.product.category.isActive;
    const stockQuantity = item.product.inventory ? item.product.inventory.quantity : 0n;
    const availability: CartAvailability = !isLifecycleAvailable
      ? 'UNAVAILABLE'
      : stockQuantity >= item.quantity
        ? 'AVAILABLE'
        : 'INSUFFICIENT_STOCK';

    return {
      product: {
        id: item.product.id,
        name: item.product.name,
        description: item.product.description,
        priceMinor,
        currency: 'USD' as const,
        category: { id: item.product.category.id, name: item.product.category.name },
        stockStatus: stockQuantity > 0n ? ('IN_STOCK' as const) : ('OUT_OF_STOCK' as const),
      },
      quantity,
      currentUnitPriceMinor: priceMinor,
      lineSubtotalMinor: priceMinor * quantity,
      availability,
    };
  });

  const subtotalMinor = items.reduce((sum, item) => sum + item.lineSubtotalMinor, 0);
  return {
    version: numberFromBigInt(cart.version),
    items,
    subtotalMinor,
    totalMinor: subtotalMinor,
    currency: 'USD',
  };
}

export class CartService {
  public constructor(private readonly database: PrismaClient) {}

  private async ensureCart(userId: string): Promise<void> {
    await this.database.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true },
    });
  }

  private async requireExistingCart(userId: string): Promise<void> {
    const cart = await this.database.cart.findUnique({ where: { userId }, select: { id: true } });
    if (!cart) throw new AppError('CART_ITEM_NOT_FOUND');
  }

  private async loadCart(client: DatabaseClient, userId: string): Promise<CartWithItems> {
    return client.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      include: {
        items: {
          include: { product: { include: { category: true, inventory: true } } },
          orderBy: { id: 'asc' },
        },
      },
    });
  }

  private async lockCart(transaction: Prisma.TransactionClient, userId: string): Promise<void> {
    await transaction.$queryRaw`SELECT id FROM carts WHERE user_id = ${userId} FOR UPDATE`;
  }

  public async getCart(userId: string): Promise<CartView> {
    return toCartView(await this.loadCart(this.database, userId));
  }

  public async addItem(userId: string, productId: string, quantity: number): Promise<CartView> {
    await this.ensureCart(userId);
    return this.database.$transaction(async (transaction) => {
      await this.lockCart(transaction, userId);
      const cart = await this.loadCart(transaction, userId);
      const product = await transaction.product.findUnique({
        where: { id: productId },
        include: { category: true, inventory: true },
      });
      if (!product) throw new AppError('PRODUCT_NOT_FOUND');
      if (!product.isActive || !product.category.isActive)
        throw new AppError('PRODUCT_UNAVAILABLE');

      const current = await transaction.cartItem.findUnique({
        where: { cartId_productId: { cartId: cart.id, productId } },
      });
      const resultingQuantity = (current?.quantity ?? 0n) + BigInt(quantity);
      const stock = product.inventory?.quantity ?? 0n;
      if (resultingQuantity > stock) throw new AppError('INSUFFICIENT_STOCK');

      if (current) {
        await transaction.cartItem.update({
          where: { id: current.id },
          data: { quantity: resultingQuantity },
        });
      } else {
        await transaction.cartItem.create({
          data: { cartId: cart.id, productId, quantity: resultingQuantity },
        });
      }
      await transaction.cart.update({
        where: { id: cart.id },
        data: { version: { increment: 1n } },
      });
      return toCartView(await this.loadCart(transaction, userId));
    });
  }

  public async updateItem(userId: string, productId: string, quantity: number): Promise<CartView> {
    await this.requireExistingCart(userId);
    return this.database.$transaction(async (transaction) => {
      await this.lockCart(transaction, userId);
      const cart = await this.loadCart(transaction, userId);
      const item = await transaction.cartItem.findUnique({
        where: { cartId_productId: { cartId: cart.id, productId } },
        include: { product: { include: { category: true, inventory: true } } },
      });
      if (!item) throw new AppError('CART_ITEM_NOT_FOUND');
      if (quantity === 0) {
        await transaction.cartItem.delete({ where: { id: item.id } });
      } else {
        if (!item.product.isActive || !item.product.category.isActive)
          throw new AppError('PRODUCT_UNAVAILABLE');
        const stock = item.product.inventory?.quantity ?? 0n;
        if (BigInt(quantity) > stock) throw new AppError('INSUFFICIENT_STOCK');
        await transaction.cartItem.update({
          where: { id: item.id },
          data: { quantity: BigInt(quantity) },
        });
      }
      await transaction.cart.update({
        where: { id: cart.id },
        data: { version: { increment: 1n } },
      });
      return toCartView(await this.loadCart(transaction, userId));
    });
  }

  public async removeItem(userId: string, productId: string): Promise<void> {
    await this.requireExistingCart(userId);
    await this.database.$transaction(async (transaction) => {
      await this.lockCart(transaction, userId);
      const cart = await this.loadCart(transaction, userId);
      const item = await transaction.cartItem.findUnique({
        where: { cartId_productId: { cartId: cart.id, productId } },
      });
      if (!item) throw new AppError('CART_ITEM_NOT_FOUND');
      await transaction.cartItem.delete({ where: { id: item.id } });
      await transaction.cart.update({
        where: { id: cart.id },
        data: { version: { increment: 1n } },
      });
    });
  }
}
