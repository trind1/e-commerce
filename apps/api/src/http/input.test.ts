import { describe, expect, it } from 'vitest';
import { pageQuerySchema } from './input.js';

describe('pageQuerySchema', () => {
  it('rejects non-safe page and page-size integers before they reach a service', () => {
    expect(pageQuerySchema.safeParse({ page: String(Number.MAX_SAFE_INTEGER + 1) }).success).toBe(
      false,
    );
    expect(
      pageQuerySchema.safeParse({ pageSize: String(Number.MAX_SAFE_INTEGER + 1) }).success,
    ).toBe(false);
  });
});
