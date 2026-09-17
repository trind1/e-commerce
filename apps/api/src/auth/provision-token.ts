import { createHash, timingSafeEqual } from 'node:crypto';

const SHA256_HEX = /^[0-9a-f]{64}$/i;
const MIN_TOKEN_LENGTH = 32;

export function verifyAdminProvisionToken(
  token: string | undefined,
  expectedHash: string | undefined,
): void {
  if (
    !token ||
    token.length < MIN_TOKEN_LENGTH ||
    !expectedHash ||
    !SHA256_HEX.test(expectedHash)
  ) {
    throw new Error('ADMIN_PROVISION_TOKEN and a SHA-256 ADMIN_PROVISION_TOKEN_HASH are required.');
  }

  const actual = createHash('sha256').update(token, 'utf8').digest();
  const expected = Buffer.from(expectedHash, 'hex');
  if (!timingSafeEqual(actual, expected)) {
    throw new Error('ADMIN_PROVISION_TOKEN does not match ADMIN_PROVISION_TOKEN_HASH.');
  }
}
