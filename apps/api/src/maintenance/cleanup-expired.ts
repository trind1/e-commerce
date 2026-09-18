import { z } from 'zod';
import { readConfig } from '../config.js';
import { createDatabaseClient } from '../db/client.js';
import { loadProjectEnvironment } from '../environment.js';
import { cleanupExpiredRecords, MAX_CLEANUP_RETENTION_SECONDS } from './cleanup.js';

const cleanupEnvironmentSchema = z.object({
  CHECKOUT_IDEMPOTENCY_RETENTION_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .safe()
    .max(MAX_CLEANUP_RETENTION_SECONDS)
    .optional(),
});

loadProjectEnvironment();
const config = readConfig();
if (!config.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const cleanupEnvironment = cleanupEnvironmentSchema.parse({
  CHECKOUT_IDEMPOTENCY_RETENTION_SECONDS: process.env.CHECKOUT_IDEMPOTENCY_RETENTION_SECONDS,
});
const database = createDatabaseClient(config.DATABASE_URL, {
  connectionLimit: config.DATABASE_CONNECTION_LIMIT,
  poolTimeoutSeconds: config.DATABASE_POOL_TIMEOUT_SECONDS,
});

try {
  const input =
    cleanupEnvironment.CHECKOUT_IDEMPOTENCY_RETENTION_SECONDS === undefined
      ? { now: new Date() }
      : {
          now: new Date(),
          checkoutRetentionSeconds: cleanupEnvironment.CHECKOUT_IDEMPOTENCY_RETENTION_SECONDS,
        };
  const result = await cleanupExpiredRecords(database, input);
  console.log(JSON.stringify({ status: 'ok', ...result }));
} finally {
  await database.$disconnect();
}
