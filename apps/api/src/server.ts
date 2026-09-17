import { buildApp } from './app.js';
import { readConfig } from './config.js';
import { createDatabaseClient } from './db/client.js';
import { loadProjectEnvironment } from './environment.js';

loadProjectEnvironment();
const config = readConfig();
if (!config.DATABASE_URL || !config.SESSION_HMAC_SECRET) {
  throw new Error('DATABASE_URL and SESSION_HMAC_SECRET are required to start the API.');
}

const app = buildApp({
  config,
  logger: true,
  database: createDatabaseClient(config.DATABASE_URL),
});

try {
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch {
  app.log.error({ errorCode: 'STARTUP_FAILED' }, 'API startup failed');
  process.exitCode = 1;
  await app.close();
}
