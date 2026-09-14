import { z } from 'zod';

export const errorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'AUTHENTICATION_REQUIRED',
  'INVALID_CREDENTIALS',
  'REGISTRATION_UNAVAILABLE',
  'ROLE_FORBIDDEN',
  'ORIGIN_FORBIDDEN',
  'NOT_FOUND',
  'CATEGORY_NOT_FOUND',
  'CATEGORY_NAME_EXISTS',
  'CATEGORY_INACTIVE',
  'PRODUCT_NOT_FOUND',
  'PRODUCT_UNAVAILABLE',
  'ORDER_NOT_FOUND',
  'INSUFFICIENT_STOCK',
  'CART_ITEM_NOT_FOUND',
  'EMPTY_CART',
  'CART_VERSION_CONFLICT',
  'IDEMPOTENCY_KEY_REUSED',
  'INVALID_STATUS',
  'INVALID_ORDER_TRANSITION',
  'CONFLICT',
  'INTERNAL_ERROR',
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorBodySchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string().min(1).max(200),
    fields: z.record(z.string(), z.string()).optional(),
    requestId: z.string().uuid(),
  }),
});

export type ErrorBody = z.infer<typeof errorBodySchema>;

export const validationProbeSchema = z
  .object({
    value: z.string().trim().min(1).max(120),
  })
  .strict();

export function createErrorBody(
  code: ErrorCode,
  message: string,
  requestId: string,
  fields?: Record<string, string>,
): ErrorBody {
  return fields === undefined
    ? { error: { code, message, requestId } }
    : { error: { code, message, fields, requestId } };
}
