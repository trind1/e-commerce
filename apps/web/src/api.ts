export type Role = 'CUSTOMER' | 'ADMIN';

export interface Session {
  id: string;
  role: Role;
}

export interface Profile {
  email: string;
  displayName: string | null;
}

export interface Category {
  id: string;
  name: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  priceMinor: number;
  currency: 'USD';
  category: { id: string; name: string };
  stockStatus: 'IN_STOCK' | 'OUT_OF_STOCK';
  isActive?: boolean;
  stockQuantity?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Collection<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface Cart {
  version: number;
  items: Array<{
    product: Product;
    quantity: number;
    currentUnitPriceMinor: number;
    lineSubtotalMinor: number;
    availability: 'AVAILABLE' | 'UNAVAILABLE' | 'INSUFFICIENT_STOCK';
  }>;
  subtotalMinor: number;
  totalMinor: number;
  currency: 'USD';
}

export interface OrderSummary {
  id: string;
  status: 'PLACED' | 'PROCESSING' | 'COMPLETED';
  totalMinor: number;
  currency: 'USD';
  createdAt: string;
}

export interface Order extends OrderSummary {
  statusDates: { placedAt: string; processingAt: string | null; completedAt: string | null };
  items: Array<{
    productId: string;
    productName: string;
    unitPriceMinor: number;
    quantity: number;
    lineSubtotalMinor: number;
    currency: 'USD';
  }>;
  customer?: { id: string; email: string };
}

export interface InventoryItem {
  productId: string;
  name: string;
  quantity: number;
  stockStatus: 'IN_STOCK' | 'OUT_OF_STOCK';
}

export class ApiError extends Error {
  public constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' });
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => null)) as
    { error?: { code?: string; message?: string; fields?: Record<string, string> } } | T | null;
  if (!response.ok) {
    const error =
      payload && typeof payload === 'object' && 'error' in payload ? payload.error : undefined;
    throw new ApiError(
      error?.code ?? 'INTERNAL_ERROR',
      response.status,
      error?.message ?? 'Something went wrong. Please try again.',
      error?.fields,
    );
  }
  return payload as T;
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export async function getSession(): Promise<Session | null> {
  try {
    return await request<Session>('/auth/session');
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export const register = (body: { email: string; password: string; displayName?: string }) =>
  request<Profile>('/auth/register', json(body));
export const login = (body: { email: string; password: string }) =>
  request<Session>('/auth/login', json(body));
export const logout = () => request<void>('/auth/logout', { method: 'POST' });
export const getProfile = () => request<Profile>('/users/me');
export const updateProfile = (displayName: string) =>
  request<Profile>('/users/me', { method: 'PATCH', body: JSON.stringify({ displayName }) });

export const getCategories = (query = '') => request<Collection<Category>>(`/categories${query}`);
export const getProducts = (query = '') => request<Collection<Product>>(`/products${query}`);
export const getProduct = (productId: string) => request<Product>(`/products/${productId}`);

export const getCart = () => request<Cart>('/cart');
export const addCartItem = (productId: string, quantity: number) =>
  request<Cart>('/cart/items', { method: 'POST', body: JSON.stringify({ productId, quantity }) });
export const updateCartItem = (productId: string, quantity: number) =>
  request<Cart>(`/cart/items/${productId}`, {
    method: 'PATCH',
    body: JSON.stringify({ quantity }),
  });
export const removeCartItem = (productId: string) =>
  request<void>(`/cart/items/${productId}`, { method: 'DELETE' });

export const checkout = (cartVersion: number, idempotencyKey: string) =>
  request<Order>('/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ cartVersion }),
  });
export const getOrders = (query = '') => request<Collection<OrderSummary>>(`/orders${query}`);
export const getOrder = (orderId: string) => request<Order>(`/orders/${orderId}`);

export const getAdminCategories = (query = '') =>
  request<Collection<Category>>(`/admin/categories${query}`);
export const createCategory = (name: string) =>
  request<Category>('/admin/categories', json({ name }));
export const updateCategory = (id: string, body: { name?: string; isActive?: boolean }) =>
  request<Category>(`/admin/categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const getAdminProducts = (query = '') =>
  request<Collection<Product>>(`/admin/products${query}`);
export const createProduct = (body: {
  name: string;
  description: string;
  priceMinor: number;
  categoryId: string;
  initialStock: number;
}) => request<Product>('/admin/products', json(body));
export const updateProduct = (
  id: string,
  body: {
    name?: string;
    description?: string;
    priceMinor?: number;
    categoryId?: string;
    isActive?: boolean;
  },
) => request<Product>(`/admin/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const getInventory = (query = '') =>
  request<Collection<InventoryItem>>(`/admin/inventory${query}`);
export const updateInventory = (id: string, quantity: number) =>
  request<{ productId: string; quantity: number; updatedAt: string }>(`/admin/inventory/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ quantity }),
  });
export const getAdminOrders = (query = '') => request<Collection<Order>>(`/admin/orders${query}`);
export const getAdminOrder = (orderId: string) => request<Order>(`/admin/orders/${orderId}`);
export const updateOrderStatus = (id: string, status: Order['status']) =>
  request<Order>(`/admin/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
