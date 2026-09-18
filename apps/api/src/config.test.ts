import { describe, expect, it } from 'vitest';
import { readConfig } from './config.js';

describe('readConfig', () => {
  it('uses safe development defaults', () => {
    expect(readConfig({})).toMatchObject({
      NODE_ENV: 'development',
      API_HOST: '127.0.0.1',
      API_PORT: 3000,
      CORS_ORIGIN: 'http://localhost:5173',
      DATABASE_CONNECTION_LIMIT: 5,
      DATABASE_POOL_TIMEOUT_SECONDS: 10,
    });
  });

  it('rejects invalid port values', () => {
    expect(() => readConfig({ API_PORT: '0' })).toThrow();
  });

  it('rejects unsafe database pool values', () => {
    expect(() => readConfig({ DATABASE_CONNECTION_LIMIT: '0' })).toThrow();
    expect(() => readConfig({ DATABASE_POOL_TIMEOUT_SECONDS: '301' })).toThrow();
  });
});
