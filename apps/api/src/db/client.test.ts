import { describe, expect, it } from 'vitest';
import { withDatabasePoolOptions } from './client.js';

describe('withDatabasePoolOptions', () => {
  it('adds bounded pool settings without changing the database target', () => {
    const result = new URL(
      withDatabasePoolOptions('postgresql://user:password@localhost:5432/ecommerce?schema=public', {
        connectionLimit: 7,
        poolTimeoutSeconds: 12,
      }),
    );

    expect(result.hostname).toBe('localhost');
    expect(result.pathname).toBe('/ecommerce');
    expect(result.searchParams.get('schema')).toBe('public');
    expect(result.searchParams.get('connection_limit')).toBe('7');
    expect(result.searchParams.get('pool_timeout')).toBe('12');
  });

  it('preserves explicit URL pool settings', () => {
    const result = new URL(
      withDatabasePoolOptions(
        'postgresql://localhost/ecommerce?connection_limit=3&pool_timeout=20',
        { connectionLimit: 7, poolTimeoutSeconds: 12 },
      ),
    );

    expect(result.searchParams.get('connection_limit')).toBe('3');
    expect(result.searchParams.get('pool_timeout')).toBe('20');
  });
});
