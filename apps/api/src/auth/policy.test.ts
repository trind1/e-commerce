import { describe, expect, it } from 'vitest';
import {
  displayNameSchema,
  emailSchema,
  isIdleRenewalDue,
  normalizeEmail,
  passwordSchema,
  sessionMaxAgeSeconds,
} from './policy.js';

describe('authentication policy', () => {
  it('normalizes email without transforming the password', () => {
    expect(normalizeEmail('  Customer@Example.COM ')).toBe('customer@example.com');
    expect(emailSchema.parse('  Customer@Example.COM ')).toBe('Customer@Example.COM');
    expect(passwordSchema.parse('  eight characters  ')).toBe('  eight characters  ');
  });

  it('accepts password boundaries and rejects outside them', () => {
    expect(passwordSchema.safeParse('12345678').success).toBe(true);
    expect(passwordSchema.safeParse('x'.repeat(128)).success).toBe(true);
    expect(passwordSchema.safeParse('1234567').success).toBe(false);
    expect(passwordSchema.safeParse('x'.repeat(129)).success).toBe(false);
    expect(displayNameSchema.safeParse('  Customer  ').success).toBe(true);
    expect(displayNameSchema.safeParse('   ').success).toBe(false);
  });

  it('renews only in the latter half of idle lifetime and never extends absolute lifetime', () => {
    const createdAt = new Date('2026-01-01T00:00:00.000Z');
    const recent = new Date('2026-01-01T00:05:00.000Z');
    const due = new Date('2026-01-01T00:16:00.000Z');
    expect(isIdleRenewalDue(recent, createdAt, 1_800)).toBe(false);
    expect(isIdleRenewalDue(due, createdAt, 1_800)).toBe(true);
    expect(sessionMaxAgeSeconds(due, createdAt, due, 28_800, 1_800)).toBe(1_800);
    const absoluteDeadline = new Date('2026-01-01T07:59:00.000Z');
    expect(sessionMaxAgeSeconds(absoluteDeadline, createdAt, absoluteDeadline, 28_800, 1_800)).toBe(
      60,
    );
  });
});
