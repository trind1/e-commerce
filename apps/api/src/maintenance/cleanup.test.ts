import { CheckoutIdempotencyState, type PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  cleanupExpiredRecords,
  MAX_CLEANUP_RETENTION_SECONDS,
  retentionCutoff,
} from './cleanup.js';

describe('cleanupExpiredRecords', () => {
  it('deletes only expired sessions when idempotency retention is not configured', async () => {
    const deleteExpiredSessions = vi.fn().mockResolvedValue({ count: 3 });
    const deleteCompletedIdempotencies = vi.fn();
    const database = {
      $transaction: async (callback: (transaction: unknown) => Promise<unknown>) =>
        callback({
          authSession: { deleteMany: deleteExpiredSessions },
          checkoutIdempotency: { deleteMany: deleteCompletedIdempotencies },
        }),
    } as unknown as PrismaClient;

    await expect(
      cleanupExpiredRecords(database, { now: new Date('2026-09-16T00:00:00.000Z') }),
    ).resolves.toEqual({ expiredSessions: 3, completedIdempotencies: 0 });
    expect(deleteExpiredSessions).toHaveBeenCalledWith({
      where: { expiresAt: { lt: new Date('2026-09-16T00:00:00.000Z') } },
    });
    expect(deleteCompletedIdempotencies).not.toHaveBeenCalled();
  });

  it('deletes only completed idempotency rows older than configured retention', async () => {
    const deleteExpiredSessions = vi.fn().mockResolvedValue({ count: 1 });
    const deleteCompletedIdempotencies = vi.fn().mockResolvedValue({ count: 2 });
    const database = {
      $transaction: async (callback: (transaction: unknown) => Promise<unknown>) =>
        callback({
          authSession: { deleteMany: deleteExpiredSessions },
          checkoutIdempotency: { deleteMany: deleteCompletedIdempotencies },
        }),
    } as unknown as PrismaClient;
    const now = new Date('2026-09-16T00:00:00.000Z');

    await expect(
      cleanupExpiredRecords(database, { now, checkoutRetentionSeconds: 86_400 }),
    ).resolves.toEqual({ expiredSessions: 1, completedIdempotencies: 2 });
    expect(deleteCompletedIdempotencies).toHaveBeenCalledWith({
      where: {
        state: CheckoutIdempotencyState.COMPLETED,
        completedAt: { not: null, lt: new Date('2026-09-15T00:00:00.000Z') },
      },
    });
  });

  it('rejects a retention duration that would overflow date arithmetic', () => {
    expect(() =>
      retentionCutoff(new Date('2026-09-16T00:00:00.000Z'), Number.MAX_SAFE_INTEGER),
    ).toThrow('outside the supported range');
    expect(
      retentionCutoff(new Date('2026-09-16T00:00:00.000Z'), MAX_CLEANUP_RETENTION_SECONDS),
    ).toBeInstanceOf(Date);
  });
});
