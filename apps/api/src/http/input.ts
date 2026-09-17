import { z, ZodError } from 'zod';
import type { FastifyRequest } from 'fastify';
import { AppError } from '../errors.js';

export const uuidSchema = z.string().uuid();
export const pageQuerySchema = z
  .object({
    page: z.coerce.number().int().safe().min(1).default(1),
    pageSize: z.coerce.number().int().safe().min(1).max(100).default(20),
  })
  .strict();

export function parseInput<T>(request: FastifyRequest, schema: z.ZodType<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      const fields: Record<string, 'Invalid value'> = {};
      for (const issue of error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string') fields[field] = 'Invalid value';
      }
      throw new AppError('VALIDATION_ERROR', fields);
    }
    throw error;
  }
}

export function parsePathId(request: FastifyRequest, value: unknown): string {
  return parseInput(request, uuidSchema, value);
}

export function parsePageQuery(request: FastifyRequest): z.infer<typeof pageQuerySchema> {
  return parseInput(request, pageQuerySchema, request.query);
}

export function collectionPage<T>(items: T[], page: number, pageSize: number, totalItems: number) {
  return {
    items,
    page,
    pageSize,
    totalItems,
    totalPages: Math.ceil(totalItems / pageSize),
  };
}
