import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { X509Certificate } from 'node:crypto';

// Public certificate linked by this project's Database Settings > Download certificate.
// https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt
export const recoveryCaFingerprint = '807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa';
const certificatePath = fileURLToPath(new URL('./certs/supabase-prod-ca-2021.crt', import.meta.url));

export function validateRecoveryCa(pem, now = Date.now()) {
  let certificate;
  try {
    if (typeof pem !== 'string' || !/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\s*$/.test(pem.trim())) throw 0;
    certificate = new X509Certificate(pem);
    if (!certificate.ca || !certificate.verify(certificate.publicKey) ||
        certificate.fingerprint256.replaceAll(':', '').toLowerCase() !== recoveryCaFingerprint) throw 0;
  } catch { throw new Error('HOSTED_CA_INVALID'); }
  if (now < Date.parse(certificate.validFrom) || now >= Date.parse(certificate.validTo)) throw new Error('HOSTED_CA_EXPIRED');
  return pem;
}

export async function loadRecoveryCa() {
  let pem;
  try { pem = await readFile(certificatePath, 'utf8'); }
  catch { throw new Error('HOSTED_CA_INVALID'); }
  return { pem: validateRecoveryCa(pem), path: certificatePath, fingerprint: recoveryCaFingerprint };
}

export function recoveryTlsOptions(host, ca) {
  return { ca, rejectUnauthorized: true, servername: host };
}
