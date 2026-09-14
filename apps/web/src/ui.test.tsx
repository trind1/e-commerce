import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api.js';
import { EmptyState, ErrorState, Field, formatMoney, LoadingState, ProductCard } from './ui.js';

const unavailableProduct = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Unavailable lamp',
  description: 'A lamp that is currently out of stock.',
  priceMinor: 2_500,
  currency: 'USD' as const,
  category: { id: '00000000-0000-0000-0000-000000000002', name: 'Lighting' },
  stockStatus: 'OUT_OF_STOCK' as const,
};

describe('shared web UI', () => {
  it('formats integer USD cents without floating point display drift', () => {
    expect(formatMoney(1_250)).toBe('$12.50');
  });

  it('announces loading and valid empty states semantically', () => {
    render(
      <>
        <LoadingState label="Loading products" />
        <EmptyState title="No products match those filters" />
      </>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading products…');
    expect(screen.getByRole('heading', { name: 'No products match those filters' })).toBeVisible();
  });

  it('shows a safe error and an actionable retry control', () => {
    const retry = vi.fn();
    render(<ErrorState error={new ApiError('CONFLICT', 409, 'Request conflicts')} retry={retry} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Request conflicts');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('renders field errors with an explicit input association', () => {
    render(
      <Field label="Display name" id="display-name" error="Invalid value">
        <input id="display-name" aria-describedby="display-name-error" aria-invalid="true" />
      </Field>,
    );

    expect(screen.getByLabelText('Display name')).toHaveAttribute(
      'aria-describedby',
      'display-name-error',
    );
    expect(screen.getByText('Invalid value')).toHaveAttribute('role', 'alert');
  });

  it('disables add-to-cart for unavailable products', () => {
    const onAdd = vi.fn();
    render(
      <MemoryRouter>
        <ProductCard product={unavailableProduct} onAdd={onAdd} />
      </MemoryRouter>,
    );

    const button = screen.getByRole('button', { name: 'Unavailable' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onAdd).not.toHaveBeenCalled();
  });
});
