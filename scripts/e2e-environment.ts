export interface E2eEnvironment {
  adminEmail: string;
  adminPassword: string;
}

const requiredVariables = [
  'E2E_DATABASE_URL',
  'E2E_SESSION_HMAC_SECRET',
  'E2E_ADMIN_EMAIL',
  'E2E_ADMIN_PASSWORD',
] as const;

export function readE2eEnvironment(environment: NodeJS.ProcessEnv = process.env): E2eEnvironment {
  const missingVariables = requiredVariables.filter((name) => !environment[name]?.trim());
  if (missingVariables.length > 0) {
    throw new Error(
      `E2E acceptance requires ${missingVariables.join(', ')}. Use test:e2e:smoke for the no-API shell check.`,
    );
  }

  const databaseUrl = environment.E2E_DATABASE_URL as string;
  let parsedDatabaseUrl: URL;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error('E2E_DATABASE_URL must be a valid PostgreSQL URL.');
  }

  if (
    !['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol) ||
    !decodeURIComponent(parsedDatabaseUrl.pathname.slice(1)).endsWith('_test')
  ) {
    throw new Error(
      'E2E_DATABASE_URL must target a disposable PostgreSQL database ending in _test.',
    );
  }

  const sessionSecret = environment.E2E_SESSION_HMAC_SECRET as string;
  if (sessionSecret.length < 32) {
    throw new Error('E2E_SESSION_HMAC_SECRET must be at least 32 characters long.');
  }

  return {
    adminEmail: environment.E2E_ADMIN_EMAIL as string,
    adminPassword: environment.E2E_ADMIN_PASSWORD as string,
  };
}
