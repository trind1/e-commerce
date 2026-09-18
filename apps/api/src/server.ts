import { buildApp } from './app.js';
import { readConfig } from './config.js';
import { loadProjectEnvironment } from './environment.js';

loadProjectEnvironment();
const config = readConfig();
if (!config.DATABASE_URL || !config.SESSION_HMAC_SECRET) {
  throw new Error('DATABASE_URL and SESSION_HMAC_SECRET are required to start the API.');
}

const app = buildApp({
  config,
  logger: true,
});

let closePromise: Promise<void> | undefined;

function closeApplication(reason: string): Promise<void> {
  closePromise ??= (async () => {
    app.log.info({ reason }, 'Closing API application');
    try {
      await app.close();
    } catch {
      app.log.error({ errorCode: 'SHUTDOWN_FAILED' }, 'API shutdown failed');
      process.exitCode = 1;
    }
  })();
  return closePromise;
}

process.once('SIGTERM', () => {
  void closeApplication('SIGTERM');
});
process.once('SIGINT', () => {
  void closeApplication('SIGINT');
});

try {
  await app.listen({ host: config.API_HOST, port: config.API_PORT });
} catch {
  app.log.error({ errorCode: 'STARTUP_FAILED' }, 'API startup failed');
  await closeApplication('startup-failure');
  process.exitCode = 1;
}
