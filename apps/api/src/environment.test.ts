import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadProjectEnvironment } from './environment.js';

describe('loadProjectEnvironment', () => {
  it('loads an explicit env file without replacing deployment-provided values', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ecommerce-env-'));
    const filePath = join(directory, '.env');
    const environment: NodeJS.ProcessEnv = { DATABASE_URL: 'postgresql://deployment/database' };

    try {
      await writeFile(
        filePath,
        'DATABASE_URL=postgresql://file/database\nSESSION_HMAC_SECRET=test-secret-from-file\n',
      );

      loadProjectEnvironment({ environment, filePath });

      expect(environment.DATABASE_URL).toBe('postgresql://deployment/database');
      expect(environment.SESSION_HMAC_SECRET).toBe('test-secret-from-file');
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
