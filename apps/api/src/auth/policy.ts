import { z } from 'zod';

export const emailSchema = z.string().trim().min(1).max(254).email();
export const passwordSchema = z.string().min(8).max(128);
export const displayNameSchema = z.string().trim().min(1).max(100);

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isIdleRenewalDue(now: Date, lastSeenAt: Date, idleTtlSeconds: number): boolean {
  const idleElapsedSeconds = (now.getTime() - lastSeenAt.getTime()) / 1000;
  return idleElapsedSeconds >= idleTtlSeconds / 2;
}

export function sessionMaxAgeSeconds(
  now: Date,
  createdAt: Date,
  lastSeenAt: Date,
  absoluteTtlSeconds: number,
  idleTtlSeconds: number,
): number {
  const absoluteRemaining = absoluteTtlSeconds - (now.getTime() - createdAt.getTime()) / 1000;
  const idleRemaining = idleTtlSeconds - (now.getTime() - lastSeenAt.getTime()) / 1000;
  return Math.max(0, Math.floor(Math.min(absoluteRemaining, idleRemaining)));
}
