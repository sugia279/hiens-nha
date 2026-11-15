import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export const maxBackupBytes = 10 * 1024 * 1024;
export const maxRepositoryArtifactBytes = 300 * 1024 * 1024;
export function artifactPageBytes(page) {
  if (!Array.isArray(page.artifacts)) throw new Error('ARTIFACT_INVENTORY_INVALID');
  return page.artifacts.reduce((sum, a) => {
    if (typeof a.expired !== 'boolean' || !Number.isSafeInteger(a.size_in_bytes) || a.size_in_bytes < 0) throw new Error('ARTIFACT_INVENTORY_INVALID');
    return sum + (a.expired ? 0 : a.size_in_bytes);
  }, 0);
}
export function assertArtifactBudget(existingBytes, nextBytes = maxBackupBytes + 1024 * 1024) {
  if (!Number.isSafeInteger(existingBytes) || existingBytes < 0 || !Number.isSafeInteger(nextBytes) || nextBytes < 0 || existingBytes + nextBytes > maxRepositoryArtifactBytes) throw new Error('ARTIFACT_BUDGET_EXCEEDED');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    if (process.env.GITHUB_REPOSITORY !== 'sugia279/hiens-nha' || process.env.BACKUP_STORAGE_QUOTA_CHECKED !== 'true' || !process.env.GITHUB_TOKEN) throw new Error('ARTIFACT_BUDGET_CONFIGURATION_REQUIRED');
    let bytes = 0, done = false;
    for (let page = 1; page <= 10; page++) {
      const response = await fetch(`https://api.github.com/repos/sugia279/hiens-nha/actions/artifacts?per_page=100&page=${page}`, {
        headers: { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, redirect: 'error', signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('ARTIFACT_INVENTORY_FAILED');
      const data = await response.json(); bytes += artifactPageBytes(data); assertArtifactBudget(bytes);
      if (data.artifacts.length < 100) { done = true; break; }
    }
    if (!done) throw new Error('ARTIFACT_INVENTORY_BOUND');
    console.log(JSON.stringify({ activeRepositoryArtifactBytes: bytes, reservedBackupBytes: maxBackupBytes + 1024 * 1024, repositoryLimitBytes: maxRepositoryArtifactBytes }));
  } catch { console.error('Encrypted backup artifact budget check failed; no paid limit is raised.'); process.exitCode = 1; }
}
