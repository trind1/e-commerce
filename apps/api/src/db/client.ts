import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';

export type DatabaseClient = PrismaClient | Prisma.TransactionClient;

export interface DatabasePoolOptions {
  connectionLimit: number;
  poolTimeoutSeconds: number;
}

const defaultPoolOptions: DatabasePoolOptions = {
  connectionLimit: 5,
  poolTimeoutSeconds: 10,
};

export function withDatabasePoolOptions(
  databaseUrl: string,
  options: DatabasePoolOptions = defaultPoolOptions,
): string {
  const url = new URL(databaseUrl);
  if (!url.searchParams.has('connection_limit')) {
    url.searchParams.set('connection_limit', String(options.connectionLimit));
  }
  if (!url.searchParams.has('pool_timeout')) {
    url.searchParams.set('pool_timeout', String(options.poolTimeoutSeconds));
  }
  return url.toString();
}

export function createDatabaseClient(
  databaseUrl: string,
  poolOptions: DatabasePoolOptions = defaultPoolOptions,
): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: {
        url: withDatabasePoolOptions(databaseUrl, poolOptions),
      },
    },
  });
}

export async function withinTransaction<T>(
  client: PrismaClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return client.$transaction(operation);
}
