import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyAdminProvisionToken } from './provision-token.js';

describe('verifyAdminProvisionToken', () => {
  it('requires a supplied token to match the configured SHA-256 digest', () => {
    const token = 'operator-entered-token-0123456789ab';
    const hash = createHash('sha256').update(token, 'utf8').digest('hex');

    expect(() => verifyAdminProvisionToken(token, hash)).not.toThrow();
    expect(() => verifyAdminProvisionToken('wrong-token-0123456789abcdef012345', hash)).toThrow(
      'does not match ADMIN_PROVISION_TOKEN_HASH',
    );
  });

  it('rejects absent or malformed expected digests', () => {
    expect(() => verifyAdminProvisionToken(undefined, undefined)).toThrow(
      'ADMIN_PROVISION_TOKEN and a SHA-256 ADMIN_PROVISION_TOKEN_HASH are required.',
    );
    expect(() => verifyAdminProvisionToken('token', 'not-a-digest')).toThrow(
      'ADMIN_PROVISION_TOKEN and a SHA-256 ADMIN_PROVISION_TOKEN_HASH are required.',
    );
    expect(() => verifyAdminProvisionToken('short-token', 'a'.repeat(64))).toThrow(
      'ADMIN_PROVISION_TOKEN and a SHA-256 ADMIN_PROVISION_TOKEN_HASH are required.',
    );
  });
});
