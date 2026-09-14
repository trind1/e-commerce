import {
  Prisma,
  type Category,
  type Inventory,
  type Product,
  type PrismaClient,
} from '@prisma/client';
import { AppError } from '../errors.js';

export interface PageInput {
  page: number;
  pageSize: number;
}

export interface ProductSearch extends PageInput {
  q?: string | undefined;
  categoryId?: string | undefined;
  isActive?: boolean | undefined;
}

type ProductWithRelations = Product & {
  category: Category;
  inventory: Inventory | null;
};

export interface PublicCategory {
  id: string;
  name: string;
}

export interface AdminCategory extends PublicCategory {
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicProduct {
  id: string;
  name: string;
  description: string;
  priceMinor: number;
  currency: 'USD';
  category: PublicCategory;
  stockStatus: 'IN_STOCK' | 'OUT_OF_STOCK';
}

export interface AdminProduct extends PublicProduct {
  isActive: boolean;
  stockQuantity: number;
  createdAt: string;
  updatedAt: string;
}

function pageBounds(page: PageInput): { skip: number; take: number } {
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

function toNumber(value: bigint): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Stored integer is outside supported range.');
  return number;
}

function toPublicCategory(category: Category): PublicCategory {
  return { id: category.id, name: category.name };
}

function toPublicProduct(product: ProductWithRelations): PublicProduct {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    priceMinor: toNumber(product.priceMinor),
    currency: 'USD',
    category: toPublicCategory(product.category),
    stockStatus: product.inventory && product.inventory.quantity > 0n ? 'IN_STOCK' : 'OUT_OF_STOCK',
  };
}

function toAdminCategory(category: Category): AdminCategory {
  return {
    ...toPublicCategory(category),
    isActive: category.isActive,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString(),
  };
}

function toAdminProduct(product: ProductWithRelations): AdminProduct {
  return {
    ...toPublicProduct(product),
    isActive: product.isActive,
    stockQuantity: product.inventory ? toNumber(product.inventory.quantity) : 0,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

function normalizedCategoryName(name: string): string {
  return name.trim();
}

function normalizedProductText(value: string): string {
  return value.trim();
}

export class CatalogService {
  public constructor(private readonly database: PrismaClient) {}

  private async requireCategory(categoryId: string, activeOnly: boolean): Promise<Category> {
    const category = await this.database.category.findFirst({
      where: { id: categoryId, ...(activeOnly ? { isActive: true } : {}) },
    });
    if (!category) throw new AppError('CATEGORY_NOT_FOUND');
    return category;
  }

  private async requireProduct(
    productId: string,
    publicOnly: boolean,
  ): Promise<ProductWithRelations> {
    const product = await this.database.product.findFirst({
      where: {
        id: productId,
        ...(publicOnly ? { isActive: true, category: { isActive: true } } : {}),
      },
      include: { category: true, inventory: true },
    });
    if (!product) throw new AppError('PRODUCT_NOT_FOUND');
    return product;
  }

  public async listCategories(
    page: PageInput,
    admin = false,
  ): Promise<{
    items: PublicCategory[] | AdminCategory[];
    totalItems: number;
  }> {
    const bounds = pageBounds(page);
    const where = admin ? {} : { isActive: true };
    const [items, totalItems] = await Promise.all([
      this.database.category.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        ...bounds,
      }),
      this.database.category.count({ where }),
    ]);
    return {
      items: admin ? items.map(toAdminCategory) : items.map(toPublicCategory),
      totalItems,
    };
  }

  public async createCategory(name: string): Promise<AdminCategory> {
    const normalizedName = normalizedCategoryName(name);
    const existing = await this.database.category.findFirst({
      where: { name: { equals: normalizedName, mode: 'insensitive' } },
    });
    if (existing) throw new AppError('CATEGORY_NAME_EXISTS');

    try {
      return toAdminCategory(
        await this.database.category.create({ data: { name: normalizedName } }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError('CATEGORY_NAME_EXISTS');
      }
      throw error;
    }
  }

  public async updateCategory(
    categoryId: string,
    input: { name?: string | undefined; isActive?: boolean | undefined },
  ): Promise<AdminCategory> {
    await this.requireCategory(categoryId, false);
    const data: { name?: string; isActive?: boolean } = {};
    if (input.name !== undefined) {
      const name = normalizedCategoryName(input.name);
      const duplicate = await this.database.category.findFirst({
        where: { name: { equals: name, mode: 'insensitive' }, NOT: { id: categoryId } },
      });
      if (duplicate) throw new AppError('CATEGORY_NAME_EXISTS');
      data.name = name;
    }
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (Object.keys(data).length === 0) throw new AppError('VALIDATION_ERROR');
    try {
      return toAdminCategory(
        await this.database.category.update({ where: { id: categoryId }, data }),
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError('CATEGORY_NAME_EXISTS');
      }
      throw error;
    }
  }

  public async listProducts(
    search: ProductSearch,
    admin = false,
  ): Promise<{
    items: PublicProduct[] | AdminProduct[];
    totalItems: number;
  }> {
    const bounds = pageBounds(search);
    if (search.categoryId) await this.requireCategory(search.categoryId, !admin);
    const q = search.q?.trim();
    const where = {
      ...(admin ? {} : { isActive: true, category: { isActive: true } }),
      ...(search.isActive === undefined || !admin ? {} : { isActive: search.isActive }),
      ...(search.categoryId ? { categoryId: search.categoryId } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { description: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [products, totalItems] = await Promise.all([
      this.database.product.findMany({
        where,
        include: { category: true, inventory: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...bounds,
      }),
      this.database.product.count({ where }),
    ]);
    return {
      items: admin ? products.map(toAdminProduct) : products.map(toPublicProduct),
      totalItems,
    };
  }

  public async getProduct(productId: string, admin = false): Promise<PublicProduct | AdminProduct> {
    const product = await this.requireProduct(productId, !admin);
    return admin ? toAdminProduct(product) : toPublicProduct(product);
  }

  public async createProduct(input: {
    name: string;
    description: string;
    priceMinor: number;
    categoryId: string;
    initialStock: number;
  }): Promise<AdminProduct> {
    const name = normalizedProductText(input.name);
    const description = normalizedProductText(input.description);
    const product = await this.database.$transaction(async (transaction) => {
      const categories = await transaction.$queryRaw<Array<{ id: string; is_active: boolean }>>`
        SELECT id, is_active FROM categories WHERE id = ${input.categoryId} FOR UPDATE
      `;
      const category = categories[0];
      if (!category) throw new AppError('CATEGORY_NOT_FOUND');
      if (!category.is_active) throw new AppError('CATEGORY_INACTIVE');
      const created = await transaction.product.create({
        data: {
          name,
          description,
          priceMinor: BigInt(input.priceMinor),
          categoryId: input.categoryId,
          inventory: { create: { quantity: BigInt(input.initialStock) } },
        },
        include: { category: true, inventory: true },
      });
      return created;
    });
    return toAdminProduct(product);
  }

  public async updateProduct(
    productId: string,
    input: {
      name?: string | undefined;
      description?: string | undefined;
      priceMinor?: number | undefined;
      categoryId?: string | undefined;
      isActive?: boolean | undefined;
    },
  ): Promise<AdminProduct> {
    const data: Prisma.ProductUpdateInput = {};
    if (input.name !== undefined) data.name = normalizedProductText(input.name);
    if (input.description !== undefined)
      data.description = normalizedProductText(input.description);
    if (input.priceMinor !== undefined) data.priceMinor = BigInt(input.priceMinor);
    if (input.categoryId !== undefined) data.category = { connect: { id: input.categoryId } };
    if (input.isActive !== undefined) data.isActive = input.isActive;
    if (Object.keys(data).length === 0) throw new AppError('VALIDATION_ERROR');
    const product = await this.database.$transaction(async (transaction) => {
      const existing = await transaction.product.findUnique({ where: { id: productId } });
      if (!existing) throw new AppError('PRODUCT_NOT_FOUND');
      if (input.categoryId !== undefined) {
        const categories = await transaction.$queryRaw<Array<{ id: string; is_active: boolean }>>`
          SELECT id, is_active FROM categories WHERE id = ${input.categoryId} FOR UPDATE
        `;
        const category = categories[0];
        if (!category) throw new AppError('CATEGORY_NOT_FOUND');
        if (!category.is_active) throw new AppError('CATEGORY_INACTIVE');
      }
      return transaction.product.update({
        where: { id: productId },
        data,
        include: { category: true, inventory: true },
      });
    });
    return toAdminProduct(product);
  }

  public async listInventory(
    input: PageInput & { q?: string | undefined; stock?: 'in' | 'out' | undefined },
  ): Promise<{
    items: Array<{
      productId: string;
      name: string;
      quantity: number;
      stockStatus: 'IN_STOCK' | 'OUT_OF_STOCK';
    }>;
    totalItems: number;
  }> {
    const bounds = pageBounds(input);
    const q = input.q?.trim();
    const where = {
      product: {
        ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
      },
      ...(input.stock === 'in' ? { quantity: { gt: 0n } } : {}),
      ...(input.stock === 'out' ? { quantity: 0n } : {}),
    };
    const [inventories, totalItems] = await Promise.all([
      this.database.inventory.findMany({
        where,
        include: { product: true },
        orderBy: [{ product: { name: 'asc' } }, { productId: 'asc' }],
        ...bounds,
      }),
      this.database.inventory.count({ where }),
    ]);
    return {
      items: inventories.map((inventory) => ({
        productId: inventory.productId,
        name: inventory.product.name,
        quantity: toNumber(inventory.quantity),
        stockStatus: inventory.quantity > 0n ? 'IN_STOCK' : 'OUT_OF_STOCK',
      })),
      totalItems,
    };
  }

  public async setInventory(productId: string, quantity: number) {
    await this.requireProduct(productId, false);
    const inventory = await this.database.inventory.upsert({
      where: { productId },
      create: { productId, quantity: BigInt(quantity) },
      update: { quantity: BigInt(quantity) },
    });
    return {
      productId: inventory.productId,
      quantity: toNumber(inventory.quantity),
      updatedAt: inventory.updatedAt.toISOString(),
    };
  }
}
