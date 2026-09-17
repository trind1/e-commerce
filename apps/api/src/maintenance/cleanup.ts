import { CheckoutIdempotencyState, type PrismaClient } from '@prisma/client';

export interface CleanupInput {
  now: Date;
  checkoutRetentionSeconds?: number;
}

export interface CleanupResult {
  expiredSessions: number;
  completedIdempotencies: number;
}

export const MAX_CLEANUP_RETENTION_SECONDS = Math.floor(8_640_000_000_000_000 / 1_000);

export function retentionCutoff(now: Date, retentionSeconds: number): Date {
  if (
    !Number.isSafeInteger(retentionSeconds) ||
    retentionSeconds <= 0 ||
    retentionSeconds > MAX_CLEANUP_RETENTION_SECONDS
  ) {
    throw new Error('Checkout idempotency retention is outside the supported range.');
  }
  const cutoff = new Date(now.getTime() - retentionSeconds * 1_000);
  if (Number.isNaN(cutoff.getTime())) {
    throw new Error('Checkout idempotency retention produced an invalid date.');
  }
  return cutoff;
}

export async function cleanupExpiredRecords(
  database: PrismaClient,
  input: CleanupInput,
): Promise<CleanupResult> {
  return database.$transaction(async (transaction) => {
    const expiredSessions = await transaction.authSession.deleteMany({
      where: { expiresAt: { lt: input.now } },
    });
    if (input.checkoutRetentionSeconds === undefined) {
      return { expiredSessions: expiredSessions.count, completedIdempotencies: 0 };
    }

    const completedIdempotencies = await transaction.checkoutIdempotency.deleteMany({
      where: {
        state: CheckoutIdempotencyState.COMPLETED,
        completedAt: {
          not: null,
          lt: retentionCutoff(input.now, input.checkoutRetentionSeconds),
        },
      },
    });
    return {
      expiredSessions: expiredSessions.count,
      completedIdempotencies: completedIdempotencies.count,
    };
  });
}
