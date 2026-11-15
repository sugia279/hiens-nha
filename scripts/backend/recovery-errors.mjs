// Fixed labels only: connection errors may contain DB credentials, addresses or rows.
const safeMessages = new Set([
  'HOSTED_RECOVERY_CONFIGURATION_REQUIRED', 'WORKFLOW_CONTEXT_REQUIRED', 'PRIVATE_DIRECTORY_REQUIRED',
  'OPERATOR_COMMAND_FAILED', 'OPERATOR_OUTPUT_BOUND', 'DISPOSABLE_TARGET_REQUIRED', 'VERIFIED_OWNER_REQUIRED',
  'POSTGRES_VERSION_DIFFERS', 'INVALID_SNAPSHOT', 'CUSTOM_DUMP_REQUIRED', 'RESTORE_FINGERPRINT_DIFFERS',
  'PUBLIC_PROJECTION_DIFFERS', 'PRIVATE_ACCESS_ALLOWED', 'RESTORED_OWNER_DIFFERS', 'RESTORED_WRITES_NOT_FROZEN',
  'CIPHERTEXT_FORMAT_REQUIRED', 'INVALID_RESTORE_COUNT',
  'HOSTED_CA_INVALID', 'HOSTED_CA_EXPIRED',
]);
const stages = new Set([
  'configuration', 'recipient', 'certificate', 'local-target', 'snapshot-and-local-restore', 'encryption', 'private-cleanup', 'manifest',
  'source-transaction', 'source-fingerprint', 'source-public-projection', 'snapshot-export', 'snapshot-dump',
  'source-private-denial', 'source-transaction-complete', 'local-role-prerequisites', 'local-create-database',
  'local-extensions', 'local-pg-restore', 'local-verify',
]);
const connectionCodes = new Map([
  ['ENOTFOUND', 'HOSTED_DNS_FAILED'], ['EAI_AGAIN', 'HOSTED_DNS_FAILED'],
  ['ECONNREFUSED', 'HOSTED_CONNECTION_REFUSED'],
  ['ETIMEDOUT', 'HOSTED_CONNECTION_TIMEOUT'], ['CONNECT_TIMEOUT', 'HOSTED_CONNECTION_TIMEOUT'],
  ['ECONNRESET', 'HOSTED_CONNECTION_CLOSED'], ['CONNECTION_CLOSED', 'HOSTED_CONNECTION_CLOSED'],
  ['CONNECTION_ENDED', 'HOSTED_CONNECTION_CLOSED'],
  ['SELF_SIGNED_CERT_IN_CHAIN', 'HOSTED_TLS_UNTRUSTED_CHAIN'],
  ['DEPTH_ZERO_SELF_SIGNED_CERT', 'HOSTED_TLS_UNTRUSTED_CHAIN'],
  ['UNABLE_TO_GET_ISSUER_CERT', 'HOSTED_TLS_UNTRUSTED_CHAIN'],
  ['UNABLE_TO_GET_ISSUER_CERT_LOCALLY', 'HOSTED_TLS_UNTRUSTED_CHAIN'],
  ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'HOSTED_TLS_UNTRUSTED_CHAIN'],
  ['CERT_HAS_EXPIRED', 'HOSTED_TLS_CERT_EXPIRED'], ['CERT_NOT_YET_VALID', 'HOSTED_TLS_CERT_NOT_YET_VALID'],
  ['ERR_TLS_CERT_ALTNAME_INVALID', 'HOSTED_TLS_HOSTNAME_MISMATCH'],
]);
export function recoveryFailure(error, fallbackStage) {
  const stage = stages.has(error?.recoveryStage) ? error.recoveryStage : stages.has(fallbackStage) ? fallbackStage : 'recovery';
  // Bound cause traversal, including cyclic errors. Never emit messages/stacks/hostnames.
  let current = error;
  for (let depth = 0; depth < 3 && current; depth++, current = current.cause) {
    if (safeMessages.has(current.message)) return { stage, code: current.message };
    if (connectionCodes.has(current.code)) return { stage, code: connectionCodes.get(current.code) };
    if (/^(?:[0-9]{2}|P[0-9A-Z])[0-9A-Z]{3}$/.test(current.code ?? '')) return { stage, code: current.code };
  }
  return { stage, code: 'HOSTED_RECOVERY_FAILED' };
}
