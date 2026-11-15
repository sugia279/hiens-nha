import { expect, it } from 'vitest';
import { recoveryFailure } from '../../scripts/backend/recovery-errors.mjs';

it('distinguishes connection failures without leaking nested error details', () => {
  const secret = 'postgresql://private-user:private-password@private-host/private-db';
  for (const [input, expected] of [
    ['ENOTFOUND', 'HOSTED_DNS_FAILED'], ['EAI_AGAIN', 'HOSTED_DNS_FAILED'],
    ['ECONNREFUSED', 'HOSTED_CONNECTION_REFUSED'], ['CONNECT_TIMEOUT', 'HOSTED_CONNECTION_TIMEOUT'],
    ['ETIMEDOUT', 'HOSTED_CONNECTION_TIMEOUT'], ['ECONNRESET', 'HOSTED_CONNECTION_CLOSED'],
    ['SELF_SIGNED_CERT_IN_CHAIN', 'HOSTED_TLS_UNTRUSTED_CHAIN'],
    ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'HOSTED_TLS_UNTRUSTED_CHAIN'],
    ['CERT_HAS_EXPIRED', 'HOSTED_TLS_CERT_EXPIRED'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'HOSTED_TLS_HOSTNAME_MISMATCH'],
    ['28P01', '28P01'], ['42501', '42501'], ['PT503', 'PT503'],
  ]) {
    const error = { message: secret, stack: secret, cause: { code: input, message: secret, host: secret } };
    expect(recoveryFailure(error, 'source-transaction')).toEqual({ stage: 'source-transaction', code: expected });
    expect(JSON.stringify(recoveryFailure(error, 'source-transaction'))).not.toContain(secret);
  }
});

it('redacts unknown fields, bounds cyclic causes and retains known operator failures', () => {
  const secret = 'private-password-fixture';
  const cycle: Record<string, unknown> = { message: secret, code: secret, recoveryStage: secret };
  cycle.cause = cycle;
  expect(recoveryFailure(cycle, secret)).toEqual({ stage: 'recovery', code: 'HOSTED_RECOVERY_FAILED' });
  expect(recoveryFailure({ message: 'PRIVATE_ACCESS_ALLOWED', recoveryStage: 'local-verify' }, 'configuration'))
    .toEqual({ stage: 'local-verify', code: 'PRIVATE_ACCESS_ALLOWED' });
  expect(recoveryFailure(null, 'configuration')).toEqual({ stage: 'configuration', code: 'HOSTED_RECOVERY_FAILED' });
  // Do not expose arbitrary short string codes as if they were SQLSTATE values.
  expect(recoveryFailure({ code: 'ABCDE', message: secret }, 'source-transaction').code).toBe('HOSTED_RECOVERY_FAILED');
});
