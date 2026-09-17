import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const environmentFile = fileURLToPath(new URL('../.env', import.meta.url));

try {
  process.loadEnvFile(environmentFile);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
    throw new Error('Create .env from .env.example before migrating the test database.', {
      cause: error,
    });
  }
  throw error;
}

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('TEST_DATABASE_URL is required to migrate the test database.');
}

let parsedDatabaseUrl: URL;
try {
  parsedDatabaseUrl = new URL(databaseUrl);
} catch {
  throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL URL.');
}

if (
  !['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol) ||
  !decodeURIComponent(parsedDatabaseUrl.pathname.slice(1)).endsWith('_test')
) {
  throw new Error(
    'TEST_DATABASE_URL must target a disposable PostgreSQL database ending in _test.',
  );
}

const prismaCli = fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url));
const child = spawn(process.execPath, [prismaCli, 'migrate', 'deploy'], {
  cwd: projectRoot,
  env: { ...process.env, DATABASE_URL: databaseUrl },
  stdio: 'inherit',
});

const exitCode = await new Promise<number>((resolve, reject) => {
  child.once('error', reject);
  child.once('exit', (code) => resolve(code ?? 1));
});

if (exitCode !== 0) process.exitCode = exitCode;
