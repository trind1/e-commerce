import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().trim().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  CORS_ORIGIN: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().url().optional(),
  SESSION_HMAC_SECRET: z.string().min(32).optional(),
  SESSION_ABSOLUTE_TTL_SECONDS: z.coerce.number().int().positive().max(28_800).default(28_800),
  SESSION_IDLE_TTL_SECONDS: z.coerce.number().int().positive().max(1_800).default(1_800),
});

export type AppConfig = z.infer<typeof environmentSchema>;

export function readConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  return environmentSchema.parse({
    NODE_ENV: environment.NODE_ENV,
    API_HOST: environment.API_HOST,
    API_PORT: environment.API_PORT,
    CORS_ORIGIN: environment.CORS_ORIGIN,
    DATABASE_URL: environment.DATABASE_URL,
    SESSION_HMAC_SECRET: environment.SESSION_HMAC_SECRET,
    SESSION_ABSOLUTE_TTL_SECONDS: environment.SESSION_ABSOLUTE_TTL_SECONDS,
    SESSION_IDLE_TTL_SECONDS: environment.SESSION_IDLE_TTL_SECONDS,
  });
}
