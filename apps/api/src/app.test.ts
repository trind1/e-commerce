import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { AppError } from './errors.js';

function createTestApp() {
  return buildApp({
    config: {
      NODE_ENV: 'test',
      API_HOST: '127.0.0.1',
      API_PORT: 3000,
      CORS_ORIGIN: 'http://localhost:5173',
      SESSION_ABSOLUTE_TTL_SECONDS: 28_800,
      SESSION_IDLE_TTL_SECONDS: 1_800,
    },
  });
}

describe('API foundation', () => {
  it('returns a minimal health response', async () => {
    const app = createTestApp();
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', environment: 'test' });
    await app.close();
  });

  it('returns an allowlisted not-found error with a safe request id', async () => {
    const app = createTestApp();
    const response = await app.inject({ method: 'GET', url: '/not-a-route' });
    const body = response.json();

    expect(response.statusCode).toBe(404);
    expect(body.error).toMatchObject({ code: 'NOT_FOUND', message: 'Resource not found' });
    expect(body.error.requestId).toMatch(/^[0-9a-f-]{36}$/i);
    await app.close();
  });

  it('does not leak thrown error details', async () => {
    const app = createTestApp();
    app.get('/test-unexpected', () => {
      throw new Error('postgresql://secret-user:secret-password@host/database');
    });

    const response = await app.inject({ method: 'GET', url: '/test-unexpected' });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('secret-password');
    expect(response.json().error).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
    await app.close();
  });
  it('maps controlled errors through an allowlist instead of exposing internal text', async () => {
    const app = createTestApp();
    app.get('/test-controlled', () => {
      const error = new AppError('CONFLICT');
      error.message = 'database password: secret-password';
      throw error;
    });

    const response = await app.inject({ method: 'GET', url: '/test-controlled' });

    expect(response.statusCode).toBe(409);
    expect(response.body).not.toContain('secret-password');
    expect(response.json().error).toEqual(
      expect.objectContaining({
        code: 'CONFLICT',
        message: 'Request conflicts with current state',
      }),
    );
    await app.close();
  });
});
