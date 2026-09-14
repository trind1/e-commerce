import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import {
  addCartItem,
  ApiError,
  checkout,
  createCategory,
  createProduct,
  getAdminCategories,
  getAdminOrders,
  getAdminProducts,
  getAdminOrder,
  getCart,
  getCategories,
  getInventory,
  getOrder,
  getOrders,
  getProduct,
  getProducts,
  getProfile,
  getSession,
  login,
  logout,
  register,
  removeCartItem,
  updateCategory,
  updateCartItem,
  updateInventory,
  updateOrderStatus,
  updateProfile,
  updateProduct,
  type Order,
} from './api.js';
import {
  EmptyState,
  ErrorState,
  Field,
  formatMoney,
  InlineAlert,
  LoadingState,
  PageHeader,
  ProductCard,
} from './ui.js';

const queryDefaults = { staleTime: 15_000, retry: false };
const queryClient = new QueryClient({ defaultOptions: { queries: queryDefaults } });

function AppShell() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const session = useQuery({ queryKey: ['session'], queryFn: getSession });
  const signOut = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['session'] });
      navigate('/');
    },
  });
  return (
    <div className="app-frame">
      <header className="site-header">
        <Link className="brand" to="/">
          <span className="brand-mark">E</span>
          <span>E-commerce</span>
        </Link>
        <nav aria-label="Primary navigation" className="main-nav">
          <Link to="/">Shop</Link>
          {session.data?.role === 'CUSTOMER' && (
            <>
              <Link to="/cart">Cart</Link>
              <Link to="/orders">Orders</Link>
              <Link to="/profile">Profile</Link>
            </>
          )}
          {session.data?.role === 'ADMIN' && <Link to="/admin/products">Admin</Link>}
        </nav>
        <div className="header-actions">
          {session.data ? (
            <button
              className="button text-button"
              disabled={signOut.isPending}
              onClick={() => signOut.mutate()}
            >
              {signOut.isPending ? 'Signing out…' : 'Sign out'}
            </button>
          ) : (
            <>
              <Link className="button secondary compact" to="/login">
                Log in
              </Link>
              <Link className="button compact" to="/register">
                Join
              </Link>
            </>
          )}
        </div>
      </header>
      {signOut.isError && (
        <div className="container top-alert">
          <ErrorState error={signOut.error} />
        </div>
      )}
      <main className="main-content">
        <Outlet />
      </main>
      <footer className="site-footer">
        <span>Thoughtful goods, simply shopped.</span>
        <span>USD · Secure account access</span>
      </footer>
    </div>
  );
}

function AccessState({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <section className="container narrow access-state">
      <div className="state-icon" aria-hidden="true">
        ◌
      </div>
      <h1>{title}</h1>
      <p className="muted">{message}</p>
      {action}
    </section>
  );
}

function CustomerRoute() {
  const session = useQuery({ queryKey: ['session'], queryFn: getSession });
  if (session.isPending) return <LoadingState label="Checking your session" />;
  if (!session.data) return <Navigate replace to="/login" />;
  if (session.data.role !== 'CUSTOMER')
    return (
      <AccessState
        title="Customer access only"
        message="This area is not available for Admin accounts."
        action={
          <Link className="button" to="/">
            Return to shop
          </Link>
        }
      />
    );
  return <Outlet />;
}
function AdminRoute() {
  const session = useQuery({ queryKey: ['session'], queryFn: getSession });
  if (session.isPending) return <LoadingState label="Checking your session" />;
  if (!session.data) return <Navigate replace to="/login" />;
  if (session.data.role !== 'ADMIN')
    return (
      <AccessState
        title="Admin access only"
        message="You do not have permission to view management tools."
        action={
          <Link className="button" to="/">
            Return to shop
          </Link>
        }
      />
    );
  return <Outlet />;
}

function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const mutation = useMutation({
    mutationFn: async () =>
      mode === 'login'
        ? login({ email, password })
        : register({ email, password, ...(displayName ? { displayName } : {}) }),
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ['session'] });
      navigate('role' in result && result.role === 'ADMIN' ? '/admin/products' : '/');
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };
  const fieldError = (field: string) =>
    mutation.error instanceof ApiError ? mutation.error.fields?.[field] : undefined;
  return (
    <section className="container narrow auth-panel">
      <PageHeader eyebrow="Welcome" title={mode === 'login' ? 'Log in' : 'Create your account'} />
      <p className="lead">
        {mode === 'login'
          ? 'Pick up where you left off.'
          : 'A simple account keeps your cart and orders together.'}
      </p>
      <form className="form-card" onSubmit={submit} noValidate>
        {mutation.isError && (
          <InlineAlert tone="error">
            {mutation.error instanceof ApiError
              ? mutation.error.message
              : 'We could not complete that request.'}
          </InlineAlert>
        )}
        <Field label="Email address" id="auth-email" error={fieldError('email')}>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(fieldError('email'))}
            aria-describedby={fieldError('email') ? 'auth-email-error' : undefined}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </Field>
        <Field label="Password" id="auth-password" error={fieldError('password')}>
          <input
            id="auth-password"
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            aria-invalid={Boolean(fieldError('password'))}
            aria-describedby={fieldError('password') ? 'auth-password-error' : undefined}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </Field>
        {mode === 'register' && (
          <Field
            label="Display name (optional)"
            id="display-name"
            error={fieldError('displayName')}
          >
            <input
              id="display-name"
              autoComplete="name"
              aria-invalid={Boolean(fieldError('displayName'))}
              aria-describedby={fieldError('displayName') ? 'display-name-error' : undefined}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </Field>
        )}
        <button className="button full" disabled={mutation.isPending}>
          {mutation.isPending ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>
      </form>
      <p className="form-switch">
        {mode === 'login' ? 'New here?' : 'Already have an account?'}{' '}
        <Link to={mode === 'login' ? '/register' : '/login'}>
          {mode === 'login' ? 'Create an account' : 'Log in'}
        </Link>
      </p>
    </section>
  );
}

function ProductListPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const categoryId = params.get('categoryId') ?? '';
  const parsedPage = Number(params.get('page') ?? '1');
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const [draftQ, setDraftQ] = useState(q);
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
    ...queryDefaults,
  });
  const products = useQuery({
    queryKey: ['products', q, categoryId, page],
    queryFn: () =>
      getProducts(
        `?page=${page}&pageSize=20${q ? `&q=${encodeURIComponent(q)}` : ''}${categoryId ? `&categoryId=${encodeURIComponent(categoryId)}` : ''}`,
      ),
    ...queryDefaults,
  });
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next);
  };
  return (
    <section className="container">
      <PageHeader eyebrow="The edit" title="Find your next favorite" />
      <div className="catalog-toolbar">
        <form
          className="search-form"
          onSubmit={(event) => {
            event.preventDefault();
            setFilter('q', draftQ.trim());
          }}
        >
          <label className="sr-only" htmlFor="product-search">
            Search products
          </label>
          <input
            id="product-search"
            placeholder="Search by name or description"
            value={draftQ}
            onChange={(event) => setDraftQ(event.target.value)}
          />
          <button className="button" type="submit">
            Search
          </button>
        </form>
        <label className="filter">
          <span>Category</span>
          <select
            aria-label="Filter by category"
            value={categoryId}
            onChange={(event) => setFilter('categoryId', event.target.value)}
          >
            <option value="">All categories</option>
            {!categories.isError &&
              categories.data?.items.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      {categories.isError && (
        <ErrorState error={categories.error} retry={() => void categories.refetch()} />
      )}
      {products.isPending && <LoadingState label="Curating products" />}
      {products.isError && (
        <ErrorState error={products.error} retry={() => void products.refetch()} />
      )}
      {!products.isError && products.data && products.data.items.length === 0 && (
        <EmptyState
          title={
            q || categoryId ? 'No products match those filters' : 'The shop is being replenished'
          }
          action={
            q || categoryId ? (
              <button
                className="button secondary"
                onClick={() => {
                  setDraftQ('');
                  setParams({});
                }}
              >
                Clear filters
              </button>
            ) : undefined
          }
        />
      )}
      {!products.isError && products.data && products.data.items.length > 0 && (
        <div className="product-grid">
          {products.data.items.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
      {!products.isError && products.data && products.data.totalPages > 1 && (
        <nav className="pagination" aria-label="Product pages">
          <button
            className="button secondary"
            disabled={page <= 1}
            onClick={() => setFilter('page', String(page - 1))}
          >
            Previous
          </button>
          <span aria-live="polite">
            Page {page} of {products.data.totalPages}
          </span>
          <button
            className="button secondary"
            disabled={page >= products.data.totalPages}
            onClick={() => setFilter('page', String(page + 1))}
          >
            Next
          </button>
        </nav>
      )}
    </section>
  );
}

function ProductDetailPage() {
  const { productId = '' } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const session = useQuery({ queryKey: ['session'], queryFn: getSession });
  const product = useQuery({
    queryKey: ['product', productId],
    queryFn: () => getProduct(productId),
    enabled: Boolean(productId),
    ...queryDefaults,
  });
  const [quantity, setQuantity] = useState(1);
  const add = useMutation({
    mutationFn: () => addCartItem(productId, quantity),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['cart'] });
      navigate('/cart');
    },
  });
  if (product.isPending)
    return (
      <section className="container">
        <LoadingState label="Loading product" />
      </section>
    );
  if (product.isError)
    return (
      <section className="container narrow">
        <ErrorState error={product.error} retry={() => void product.refetch()} />
      </section>
    );
  if (!product.data)
    return (
      <section className="container narrow">
        <EmptyState
          title="Product not found"
          action={
            <Link className="button" to="/">
              Back to shop
            </Link>
          }
        />
      </section>
    );
  const item = product.data;
  const available = item.stockStatus === 'IN_STOCK';
  return (
    <section className="container detail-layout">
      <div className="detail-art" aria-hidden="true">
        ✦
      </div>
      <div className="detail-copy">
        <span className="eyebrow">{item.category.name}</span>
        <h1>{item.name}</h1>
        <p className="detail-price">{formatMoney(item.priceMinor)}</p>
        <p className="lead">{item.description}</p>
        <p
          className={`availability ${available ? 'is-available' : 'is-unavailable'}`}
          role="status"
        >
          {available ? 'In stock and ready to ship' : 'Currently out of stock'}
        </p>
        {session.data?.role === 'CUSTOMER' && available && (
          <div className="purchase-row">
            <label className="quantity-field" htmlFor="detail-quantity">
              Quantity
              <input
                id="detail-quantity"
                type="number"
                min="1"
                value={quantity}
                onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
              />
            </label>
            <button className="button" disabled={add.isPending} onClick={() => add.mutate()}>
              {add.isPending ? 'Adding…' : 'Add to cart'}
            </button>
          </div>
        )}
        {!session.data && (
          <Link className="button" to="/login">
            Log in to add to cart
          </Link>
        )}
        {session.data?.role === 'ADMIN' && (
          <InlineAlert>Admins can browse the catalog but do not have a customer cart.</InlineAlert>
        )}
        {add.isError && (
          <InlineAlert tone="error">
            {add.error instanceof ApiError ? add.error.message : 'Could not add this product.'}
          </InlineAlert>
        )}
      </div>
    </section>
  );
}

function CartPage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const cart = useQuery({ queryKey: ['cart'], queryFn: getCart, ...queryDefaults });
  const mutation = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      updateCartItem(id, quantity),
    onSuccess: () => client.invalidateQueries({ queryKey: ['cart'] }),
  });
  const remove = useMutation({
    mutationFn: removeCartItem,
    onSuccess: () => client.invalidateQueries({ queryKey: ['cart'] }),
  });
  if (cart.isPending)
    return (
      <section className="container">
        <LoadingState label="Loading your cart" />
      </section>
    );
  if (cart.isError)
    return (
      <section className="container">
        <ErrorState error={cart.error} retry={() => void cart.refetch()} />
      </section>
    );
  if (!cart.data || cart.data.items.length === 0)
    return (
      <section className="container narrow">
        <PageHeader eyebrow="Your space" title="Your cart" />
        <EmptyState
          title="Your cart is waiting for something good"
          action={
            <Link className="button" to="/">
              Browse products
            </Link>
          }
        />
      </section>
    );
  return (
    <section className="container">
      <PageHeader eyebrow="Your space" title="Your cart" />
      <div className="commerce-layout">
        <div className="cart-lines">
          {cart.data.items.map((item) => (
            <article className="cart-line" key={item.product.id}>
              <div className="mini-art" aria-hidden="true">
                ✦
              </div>
              <div className="cart-line-copy">
                <h2>{item.product.name}</h2>
                <span className="muted">{formatMoney(item.currentUnitPriceMinor)} each</span>
                <span
                  className={`badge ${item.availability === 'AVAILABLE' ? 'success' : 'warning'}`}
                >
                  {item.availability === 'AVAILABLE'
                    ? 'Available'
                    : item.availability === 'UNAVAILABLE'
                      ? 'Unavailable'
                      : 'Insufficient stock'}
                </span>
              </div>
              <label className="quantity-field" htmlFor={`quantity-${item.product.id}`}>
                Qty
                <input
                  id={`quantity-${item.product.id}`}
                  type="number"
                  min="0"
                  value={item.quantity}
                  onChange={(event) =>
                    mutation.mutate({
                      id: item.product.id,
                      quantity: Math.max(0, Number(event.target.value) || 0),
                    })
                  }
                />
              </label>
              <strong>{formatMoney(item.lineSubtotalMinor)}</strong>
              <button
                className="icon-button"
                aria-label={`Remove ${item.product.name}`}
                onClick={() => remove.mutate(item.product.id)}
              >
                ×
              </button>
            </article>
          ))}
        </div>
        <aside className="summary-card">
          <span className="eyebrow">Order summary</span>
          <div className="summary-row">
            <span>Subtotal</span>
            <strong>{formatMoney(cart.data.subtotalMinor)}</strong>
          </div>
          <div className="summary-row total">
            <span>Total</span>
            <strong>{formatMoney(cart.data.totalMinor)}</strong>
          </div>
          {(mutation.isError || remove.isError) && (
            <InlineAlert tone="error">Cart update failed. Please try again.</InlineAlert>
          )}
          <button className="button full" onClick={() => navigate('/checkout')}>
            Continue to checkout
          </button>
        </aside>
      </div>
    </section>
  );
}

function CheckoutPage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const cart = useQuery({ queryKey: ['cart'], queryFn: getCart, ...queryDefaults });
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const mutation = useMutation({
    mutationFn: (version: number) => checkout(version, idempotencyKey),
    onSuccess: async (order) => {
      await client.invalidateQueries({ queryKey: ['cart'] });
      await client.invalidateQueries({ queryKey: ['orders'] });
      navigate(`/orders/${order.id}?confirmation=1`);
    },
  });
  if (cart.isPending)
    return (
      <section className="container">
        <LoadingState label="Preparing checkout" />
      </section>
    );
  if (cart.isError)
    return (
      <section className="container">
        <ErrorState error={cart.error} />
      </section>
    );
  if (!cart.data || cart.data.items.length === 0)
    return (
      <section className="container narrow">
        <PageHeader title="Checkout" />
        <EmptyState
          title="There is nothing to check out"
          action={
            <Link className="button" to="/">
              Browse products
            </Link>
          }
        />
      </section>
    );
  const blocked = cart.data.items.some((item) => item.availability !== 'AVAILABLE');
  return (
    <section className="container narrow">
      <PageHeader eyebrow="One last look" title="Checkout" />
      <div className="summary-card checkout-card">
        <p className="muted">
          No payment is needed for this MVP. Confirm your current cart to place the order.
        </p>
        {cart.data.items.map((item) => (
          <div className="summary-row" key={item.product.id}>
            <span>
              {item.product.name} × {item.quantity}
            </span>
            <strong>{formatMoney(item.lineSubtotalMinor)}</strong>
          </div>
        ))}
        <div className="summary-row total">
          <span>Total</span>
          <strong>{formatMoney(cart.data.totalMinor)}</strong>
        </div>
        {blocked && (
          <InlineAlert tone="error">
            Resolve unavailable cart items before checking out.
          </InlineAlert>
        )}
        {mutation.isError && (
          <InlineAlert tone="error">
            {mutation.error instanceof ApiError
              ? mutation.error.message
              : 'Checkout failed. Your cart was not changed.'}
          </InlineAlert>
        )}
        <button
          className="button full"
          disabled={blocked || mutation.isPending}
          onClick={() => mutation.mutate(cart.data!.version)}
        >
          {mutation.isPending ? 'Placing order…' : 'Place order'}
        </button>
      </div>
    </section>
  );
}

function OrderDetailPage() {
  const { orderId = '' } = useParams();
  const [params] = useSearchParams();
  const order = useQuery({
    queryKey: ['order', orderId],
    queryFn: () => getOrder(orderId),
    enabled: Boolean(orderId),
    ...queryDefaults,
  });
  if (order.isPending)
    return (
      <section className="container">
        <LoadingState label="Loading order" />
      </section>
    );
  if (order.isError)
    return (
      <section className="container narrow">
        <ErrorState error={order.error} retry={() => void order.refetch()} />
      </section>
    );
  if (!order.data)
    return (
      <section className="container narrow">
        <EmptyState
          title="Order not found"
          action={
            <Link className="button" to="/orders">
              Back to orders
            </Link>
          }
        />
      </section>
    );
  return (
    <section className="container narrow">
      <PageHeader
        eyebrow={params.has('confirmation') ? 'Order confirmed' : 'Order details'}
        title={
          params.has('confirmation')
            ? 'Thank you for your order'
            : `Order ${order.data.id.slice(0, 8)}`
        }
      >
        <span className="badge success">{order.data.status}</span>
      </PageHeader>
      <div className="summary-card order-card">
        {order.data.items.map((item) => (
          <div className="summary-row" key={item.productId}>
            <span>
              {item.productName} × {item.quantity}
            </span>
            <strong>{formatMoney(item.lineSubtotalMinor)}</strong>
          </div>
        ))}
        <div className="summary-row total">
          <span>Total</span>
          <strong>{formatMoney(order.data.totalMinor)}</strong>
        </div>
        <p className="muted">Placed {new Date(order.data.statusDates.placedAt).toLocaleString()}</p>
        <Link className="button secondary" to="/orders">
          View order history
        </Link>
      </div>
    </section>
  );
}
function OrdersPage() {
  const orders = useQuery({ queryKey: ['orders'], queryFn: getOrders, ...queryDefaults });
  if (orders.isPending)
    return (
      <section className="container">
        <LoadingState label="Loading orders" />
      </section>
    );
  if (orders.isError)
    return (
      <section className="container">
        <ErrorState error={orders.error} retry={() => void orders.refetch()} />
      </section>
    );
  return (
    <section className="container">
      <PageHeader eyebrow="Your history" title="Orders" />
      {!orders.data?.items.length ? (
        <EmptyState
          title="No orders yet"
          action={
            <Link className="button" to="/">
              Start shopping
            </Link>
          }
        />
      ) : (
        <div className="order-list">
          {orders.data.items.map((order) => (
            <Link className="card order-row" to={`/orders/${order.id}`} key={order.id}>
              <span>
                <strong>Order {order.id.slice(0, 8)}</strong>
                <small>{new Date(order.createdAt).toLocaleDateString()}</small>
              </span>
              <span className="badge">{order.status}</span>
              <strong>{formatMoney(order.totalMinor)}</strong>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
function ProfilePage() {
  const profile = useQuery({ queryKey: ['profile'], queryFn: getProfile, ...queryDefaults });
  const [name, setName] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (next) => setName(next.displayName),
  });
  if (profile.isPending)
    return (
      <section className="container narrow">
        <LoadingState label="Loading profile" />
      </section>
    );
  if (profile.isError)
    return (
      <section className="container narrow">
        <ErrorState error={profile.error} />
      </section>
    );
  if (!profile.data) return null;
  const currentName = name ?? profile.data.displayName ?? '';
  return (
    <section className="container narrow">
      <PageHeader eyebrow="Your account" title="Profile" />
      <form
        className="form-card"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate(currentName);
        }}
      >
        <Field label="Email address" id="profile-email">
          <input id="profile-email" value={profile.data.email} readOnly />
        </Field>
        <Field
          label="Display name"
          id="profile-name"
          error={
            mutation.error instanceof ApiError ? mutation.error.fields?.displayName : undefined
          }
        >
          <input
            id="profile-name"
            aria-invalid={Boolean(
              mutation.error instanceof ApiError && mutation.error.fields?.displayName,
            )}
            aria-describedby={
              mutation.error instanceof ApiError && mutation.error.fields?.displayName
                ? 'profile-name-error'
                : undefined
            }
            value={currentName}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </Field>
        {mutation.isSuccess && <InlineAlert tone="success">Profile saved.</InlineAlert>}
        {mutation.isError && (
          <InlineAlert tone="error">
            {mutation.error instanceof ApiError
              ? mutation.error.message
              : 'Could not save your profile.'}
          </InlineAlert>
        )}
        <button className="button full" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving…' : 'Save display name'}
        </button>
      </form>
    </section>
  );
}

function AdminNav() {
  return (
    <div className="admin-nav" aria-label="Admin navigation">
      <Link to="/admin/products">Products</Link>
      <Link to="/admin/categories">Categories</Link>
      <Link to="/admin/inventory">Inventory</Link>
      <Link to="/admin/orders">Orders</Link>
    </div>
  );
}
function AdminPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="container">
      <PageHeader eyebrow="Management" title={title} />
      <AdminNav />
      {children}
    </section>
  );
}
function AdminCategoriesPage() {
  const client = useQueryClient();
  const categories = useQuery({
    queryKey: ['admin-categories'],
    queryFn: getAdminCategories,
    ...queryDefaults,
  });
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: createCategory,
    onSuccess: async () => {
      setName('');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin-categories'] }),
        client.invalidateQueries({ queryKey: ['categories'] }),
      ]);
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateCategory(id, { isActive }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['admin-categories'] }),
        client.invalidateQueries({ queryKey: ['categories'] }),
        client.invalidateQueries({ queryKey: ['admin-products'] }),
        client.invalidateQueries({ queryKey: ['products'] }),
      ]),
  });
  return (
    <AdminPage title="Categories">
      <form
        className="inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate(name);
        }}
      >
        <label className="sr-only" htmlFor="new-category">
          Category name
        </label>
        <input
          id="new-category"
          placeholder="New category name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
        <button className="button" disabled={create.isPending}>
          Add category
        </button>
      </form>
      {create.isError && (
        <InlineAlert tone="error">
          {create.error instanceof ApiError ? create.error.message : 'Could not create category.'}
        </InlineAlert>
      )}
      {toggle.isError && <InlineAlert tone="error">Could not update category status.</InlineAlert>}
      {categories.isPending ? (
        <LoadingState />
      ) : categories.isError ? (
        <ErrorState error={categories.error} />
      ) : !categories.data?.items.length ? (
        <EmptyState title="No categories yet" />
      ) : (
        <div className="admin-list">
          {categories.data.items.map((category) => (
            <div className="admin-row" key={category.id}>
              <div>
                <strong>{category.name}</strong>
                <small>{category.isActive ? 'Active' : 'Inactive'}</small>
              </div>
              <button
                className="button secondary"
                disabled={toggle.isPending}
                onClick={() =>
                  (!category.isActive || window.confirm(`Deactivate ${category.name}?`)) &&
                  toggle.mutate({ id: category.id, isActive: !category.isActive })
                }
              >
                {category.isActive ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          ))}
        </div>
      )}
    </AdminPage>
  );
}
function AdminProductsPage() {
  const client = useQueryClient();
  const products = useQuery({
    queryKey: ['admin-products'],
    queryFn: getAdminProducts,
    ...queryDefaults,
  });
  const categories = useQuery({
    queryKey: ['admin-categories'],
    queryFn: getAdminCategories,
    ...queryDefaults,
  });
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    categoryId: '',
    stock: '0',
  });
  const create = useMutation({
    mutationFn: () =>
      createProduct({
        name: form.name,
        description: form.description,
        priceMinor: Math.round(Number(form.price) * 100),
        categoryId: form.categoryId,
        initialStock: Number(form.stock),
      }),
    onSuccess: async () => {
      setForm({ name: '', description: '', price: '', categoryId: '', stock: '0' });
      await Promise.all([
        client.invalidateQueries({ queryKey: ['admin-products'] }),
        client.invalidateQueries({ queryKey: ['products'] }),
      ]);
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateProduct(id, { isActive }),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['admin-products'] }),
        client.invalidateQueries({ queryKey: ['products'] }),
        client.invalidateQueries({ queryKey: ['product'] }),
      ]),
  });
  return (
    <AdminPage title="Products">
      <form
        className="form-card admin-form"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <h2>Add product</h2>
        <Field label="Name" id="new-product-name">
          <input
            id="new-product-name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            required
          />
        </Field>
        <Field label="Description" id="new-product-description">
          <textarea
            id="new-product-description"
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            required
          />
        </Field>
        <div className="form-grid">
          <Field label="Price (USD)" id="new-product-price">
            <input
              id="new-product-price"
              type="number"
              min="0.01"
              step="0.01"
              value={form.price}
              onChange={(event) => setForm({ ...form, price: event.target.value })}
              required
            />
          </Field>
          <Field label="Initial stock" id="new-product-stock">
            <input
              id="new-product-stock"
              type="number"
              min="0"
              step="1"
              value={form.stock}
              onChange={(event) => setForm({ ...form, stock: event.target.value })}
              required
            />
          </Field>
        </div>
        <Field label="Category" id="new-product-category">
          <select
            id="new-product-category"
            value={form.categoryId}
            onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
            required
          >
            <option value="">Choose a category</option>
            {categories.data?.items
              .filter((category) => category.isActive)
              .map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
          </select>
        </Field>
        {create.isError && (
          <InlineAlert tone="error">
            {create.error instanceof ApiError ? create.error.message : 'Could not create product.'}
          </InlineAlert>
        )}
        <button className="button" disabled={create.isPending}>
          Create product
        </button>
      </form>
      {products.isPending ? (
        <LoadingState />
      ) : products.isError ? (
        <ErrorState error={products.error} />
      ) : !products.data?.items.length ? (
        <EmptyState title="No products yet" />
      ) : (
        <div className="admin-list">
          {products.data.items.map((product) => (
            <div className="admin-row" key={product.id}>
              <div>
                <strong>{product.name}</strong>
                <small>
                  {product.isActive ? 'Active' : 'Inactive'} · {formatMoney(product.priceMinor)} ·{' '}
                  {product.stockQuantity} units
                </small>
              </div>
              <button
                className="button secondary"
                disabled={toggle.isPending}
                onClick={() =>
                  (!product.isActive || window.confirm(`Deactivate ${product.name}?`)) &&
                  toggle.mutate({ id: product.id, isActive: !product.isActive })
                }
              >
                {product.isActive ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          ))}
        </div>
      )}
      {toggle.isError && <InlineAlert tone="error">Could not update product status.</InlineAlert>}
    </AdminPage>
  );
}
function AdminInventoryPage() {
  const client = useQueryClient();
  const inventory = useQuery({ queryKey: ['inventory'], queryFn: getInventory, ...queryDefaults });
  const [values, setValues] = useState<Record<string, string>>({});
  const mutation = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      updateInventory(id, quantity),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['inventory'] }),
        client.invalidateQueries({ queryKey: ['admin-products'] }),
        client.invalidateQueries({ queryKey: ['products'] }),
        client.invalidateQueries({ queryKey: ['product'] }),
      ]),
  });
  return (
    <AdminPage title="Inventory">
      {mutation.isError && (
        <InlineAlert tone="error">
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : 'Could not update inventory.'}
        </InlineAlert>
      )}
      {inventory.isPending ? (
        <LoadingState />
      ) : inventory.isError ? (
        <ErrorState error={inventory.error} />
      ) : !inventory.data?.items.length ? (
        <EmptyState title="No inventory records" />
      ) : (
        <div className="admin-list">
          {inventory.data.items.map((item) => (
            <form
              className="admin-row"
              key={item.productId}
              onSubmit={(event) => {
                event.preventDefault();
                mutation.mutate({
                  id: item.productId,
                  quantity: Number(values[item.productId] ?? item.quantity),
                });
              }}
            >
              <div>
                <strong>{item.name}</strong>
                <small>
                  {item.stockStatus === 'IN_STOCK' ? 'In stock' : 'Out of stock'} · Current{' '}
                  {item.quantity}
                </small>
              </div>
              <div className="inline-form">
                <label className="sr-only" htmlFor={`stock-${item.productId}`}>
                  Quantity for {item.name}
                </label>
                <input
                  id={`stock-${item.productId}`}
                  type="number"
                  min="0"
                  step="1"
                  value={values[item.productId] ?? item.quantity}
                  onChange={(event) =>
                    setValues({ ...values, [item.productId]: event.target.value })
                  }
                />
                <button className="button secondary" disabled={mutation.isPending}>
                  Save
                </button>
              </div>
            </form>
          ))}
        </div>
      )}
    </AdminPage>
  );
}
function AdminOrdersPage() {
  const client = useQueryClient();
  const orders = useQuery({
    queryKey: ['admin-orders'],
    queryFn: getAdminOrders,
    ...queryDefaults,
  });
  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Order['status'] }) =>
      updateOrderStatus(id, status),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['admin-orders'] }),
        client.invalidateQueries({ queryKey: ['orders'] }),
        client.invalidateQueries({ queryKey: ['order'] }),
        client.invalidateQueries({ queryKey: ['admin-order'] }),
      ]),
  });
  return (
    <AdminPage title="Orders">
      {mutation.isError && (
        <InlineAlert tone="error">
          {mutation.error instanceof ApiError
            ? mutation.error.message
            : 'Could not update order status.'}
        </InlineAlert>
      )}
      {orders.isPending ? (
        <LoadingState />
      ) : orders.isError ? (
        <ErrorState error={orders.error} />
      ) : !orders.data?.items.length ? (
        <EmptyState title="No orders yet" />
      ) : (
        <div className="admin-list">
          {orders.data.items.map((order) => {
            const next =
              order.status === 'PLACED'
                ? 'PROCESSING'
                : order.status === 'PROCESSING'
                  ? 'COMPLETED'
                  : null;
            return (
              <div className="admin-row" key={order.id}>
                <div>
                  <strong>Order {order.id.slice(0, 8)}</strong>
                  <small>
                    {order.customer?.email} · {formatMoney(order.totalMinor)}
                  </small>
                </div>
                <span className="badge">{order.status}</span>
                {next && (
                  <button
                    className="button secondary"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ id: order.id, status: next })}
                  >
                    Mark {next.toLowerCase()}
                  </button>
                )}
                <Link className="text-link" to={`/admin/orders/${order.id}`}>
                  View
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </AdminPage>
  );
}
function AdminOrderDetailPage() {
  const { orderId = '' } = useParams();
  const order = useQuery({
    queryKey: ['admin-order', orderId],
    queryFn: () => getAdminOrder(orderId),
    enabled: Boolean(orderId),
    ...queryDefaults,
  });
  if (order.isPending)
    return (
      <section className="container">
        <LoadingState />
      </section>
    );
  if (order.isError || !order.data)
    return (
      <section className="container narrow">
        <ErrorState error={order.error} />
      </section>
    );
  return (
    <section className="container narrow">
      <PageHeader eyebrow="Admin order" title={`Order ${order.data.id.slice(0, 8)}`}>
        <span className="badge">{order.data.status}</span>
      </PageHeader>
      <div className="summary-card order-card">
        {order.data.items.map((item) => (
          <div className="summary-row" key={item.productId}>
            <span>
              {item.productName} × {item.quantity}
            </span>
            <strong>{formatMoney(item.lineSubtotalMinor)}</strong>
          </div>
        ))}
        <div className="summary-row total">
          <span>Total</span>
          <strong>{formatMoney(order.data.totalMinor)}</strong>
        </div>
      </div>
    </section>
  );
}
function NotFoundPage() {
  return (
    <AccessState
      title="Page not found"
      message="That page has moved or never existed."
      action={
        <Link className="button" to="/">
          Return to shop
        </Link>
      }
    />
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<ProductListPage />} />
            <Route path="/products/:productId" element={<ProductDetailPage />} />
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route element={<CustomerRoute />}>
              <Route path="/cart" element={<CartPage />} />
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/orders/:orderId" element={<OrderDetailPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
            <Route element={<AdminRoute />}>
              <Route path="/admin/categories" element={<AdminCategoriesPage />} />
              <Route path="/admin/products" element={<AdminProductsPage />} />
              <Route path="/admin/inventory" element={<AdminInventoryPage />} />
              <Route path="/admin/orders" element={<AdminOrdersPage />} />
              <Route path="/admin/orders/:orderId" element={<AdminOrderDetailPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
