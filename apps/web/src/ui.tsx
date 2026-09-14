import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, type Product } from './api.js';

export function formatMoney(minor: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(minor / 100);
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <p className="state" role="status">
      {label}…
    </p>
  );
}

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="state empty-state">
      <h2>{title}</h2>
      {action}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const message = error instanceof ApiError ? error.message : 'We could not load this information.';
  return (
    <div className="alert error" role="alert">
      <span>{message}</span>
      {retry && (
        <button className="link-button" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function ProductCard({
  product,
  onAdd,
}: {
  product: Product;
  onAdd?: (product: Product) => void;
}) {
  const available = product.stockStatus === 'IN_STOCK';
  return (
    <article className="card product-card">
      <div className="product-art" aria-hidden="true">
        ✦
      </div>
      <div className="card-body">
        <span className="eyebrow">{product.category.name}</span>
        <h2>
          <Link to={`/products/${product.id}`}>{product.name}</Link>
        </h2>
        <p className="muted">{product.description}</p>
        <div className="card-row">
          <strong>{formatMoney(product.priceMinor)}</strong>
          <span className={`badge ${available ? 'success' : 'warning'}`}>
            {available ? 'In stock' : 'Out of stock'}
          </span>
        </div>
        <div className="card-actions">
          <Link className="button secondary" to={`/products/${product.id}`}>
            View details
          </Link>
          {onAdd && (
            <button className="button" disabled={!available} onClick={() => onAdd(product)}>
              {available ? 'Add to cart' : 'Unavailable'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}

export function Field({
  label,
  id,
  error,
  children,
}: {
  label: string;
  id: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error && (
        <small id={`${id}-error`} className="field-error" role="alert">
          {error}
        </small>
      )}
    </div>
  );
}

export function InlineAlert({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'error' | 'success';
}) {
  return (
    <div className={`alert ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
