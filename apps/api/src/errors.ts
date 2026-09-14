import { createErrorBody, type ErrorBody, type ErrorCode } from '@ecommerce/contracts';

type ControlledErrorCode = Exclude<ErrorCode, 'INTERNAL_ERROR'>;
type ValidationFieldMessage = 'Invalid value' | 'Required value' | 'Out of range';

const errorDefinitions: Record<ControlledErrorCode, { statusCode: number; message: string }> = {
  VALIDATION_ERROR: { statusCode: 400, message: 'Request is invalid' },
  AUTHENTICATION_REQUIRED: { statusCode: 401, message: 'Authentication is required' },
  INVALID_CREDENTIALS: { statusCode: 401, message: 'Invalid credentials' },
  REGISTRATION_UNAVAILABLE: { statusCode: 409, message: 'Registration is unavailable' },
  ROLE_FORBIDDEN: { statusCode: 403, message: 'Action is not permitted' },
  ORIGIN_FORBIDDEN: { statusCode: 403, message: 'Request origin is not permitted' },
  NOT_FOUND: { statusCode: 404, message: 'Resource not found' },
  CATEGORY_NOT_FOUND: { statusCode: 404, message: 'Category not found' },
  CATEGORY_NAME_EXISTS: { statusCode: 409, message: 'Category name already exists' },
  CATEGORY_INACTIVE: { statusCode: 409, message: 'Category is inactive' },
  PRODUCT_NOT_FOUND: { statusCode: 404, message: 'Product not found' },
  PRODUCT_UNAVAILABLE: { statusCode: 409, message: 'Product is unavailable' },
  ORDER_NOT_FOUND: { statusCode: 404, message: 'Order not found' },
  INSUFFICIENT_STOCK: { statusCode: 409, message: 'Insufficient stock' },
  CART_ITEM_NOT_FOUND: { statusCode: 404, message: 'Cart item not found' },
  EMPTY_CART: { statusCode: 409, message: 'Cart is empty' },
  CART_VERSION_CONFLICT: { statusCode: 409, message: 'Cart version conflicts with current state' },
  IDEMPOTENCY_KEY_REUSED: { statusCode: 409, message: 'Idempotency key cannot be reused' },
  INVALID_STATUS: { statusCode: 400, message: 'Invalid status' },
  INVALID_ORDER_TRANSITION: {
    statusCode: 409,
    message: 'Order status transition is not permitted',
  },
  CONFLICT: { statusCode: 409, message: 'Request conflicts with current state' },
};

const safeValidationMessages = new Set<ValidationFieldMessage>([
  'Invalid value',
  'Required value',
  'Out of range',
]);
const safeFieldName = /^[a-z][a-zA-Z0-9]{0,63}$/;

function sanitizeValidationFields(
  fields: Record<string, unknown> | undefined,
): Record<string, string> | undefined {
  if (fields === undefined) {
    return undefined;
  }

  const safeFields: Record<string, string> = {};

  for (const [field, message] of Object.entries(fields)) {
    if (
      safeFieldName.test(field) &&
      typeof message === 'string' &&
      safeValidationMessages.has(message as ValidationFieldMessage)
    ) {
      safeFields[field] = message;
    }
  }

  return Object.keys(safeFields).length === 0 ? undefined : safeFields;
}

export class AppError extends Error {
  public readonly code: ControlledErrorCode;
  public readonly statusCode: number;
  private readonly fields: Record<string, string> | undefined;

  public constructor(code: ControlledErrorCode, fields?: Record<string, unknown>) {
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = errorDefinitions[code].statusCode;
    this.fields = code === 'VALIDATION_ERROR' ? sanitizeValidationFields(fields) : undefined;
  }

  public toResponse(requestId: string): ErrorBody {
    const definition = errorDefinitions[this.code];
    return createErrorBody(this.code, definition.message, requestId, this.fields);
  }
}

export function validationError(requestId: string, fields?: Record<string, unknown>): ErrorBody {
  return new AppError('VALIDATION_ERROR', fields).toResponse(requestId);
}
