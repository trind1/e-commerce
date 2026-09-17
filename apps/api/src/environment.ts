import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';

export const projectEnvironmentPath = fileURLToPath(new URL('../../../.env', import.meta.url));

export function loadProjectEnvironment(
  options: {
    environment?: NodeJS.ProcessEnv;
    filePath?: string;
  } = {},
): void {
  const result = loadDotenv({
    path: options.filePath ?? projectEnvironmentPath,
    processEnv: options.environment ?? process.env,
    override: false,
    quiet: true,
  });

  if (result.error && (result.error as NodeJS.ErrnoException).code !== 'ENOENT') {
    throw result.error;
  }
}
