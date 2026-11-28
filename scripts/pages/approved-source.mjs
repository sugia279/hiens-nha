import { appendFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const sourceRepository = 'sugia279/hiens-nha';
export const destinationRepository = 'suduyhien/suduyhien.github.io';
export function sourceIsApproved(runs, sha) {
  return /^[a-f0-9]{40}$/.test(sha) && runs.some(run => run.head_sha === sha && run.head_branch === 'main' && run.event === 'push' && run.path === '.github/workflows/backend-foundation.yml' && run.status === 'completed' && run.conclusion === 'success');
}
export async function deliveryDecision(repository, sha, fetcher = fetch, token) {
  if (repository !== destinationRepository || !/^[a-f0-9]{40}$/.test(sha)) throw Error('Unexpected Pages delivery context');
  const headers = {Accept:'application/vnd.github+json'};
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetcher(`https://api.github.com/repos/${sourceRepository}/actions/runs?head_sha=${sha}&event=push&per_page=20`, {headers,redirect:'error'});
  if (!response.ok) throw Error(`Source verification unavailable (HTTP ${response.status})`);
  const data = await response.json();
  if (!Array.isArray(data.workflow_runs) || !sourceIsApproved(data.workflow_runs,sha)) throw Error('Current source main has not passed backend/native/browser checks');
  const deployed = await fetcher('https://suduyhien.github.io/.well-known/hiens-source.json', {cache:'no-store'});
  if (deployed.status === 404) return true;
  if (!deployed.ok) throw Error('Destination verification unavailable');
  const previous = await deployed.json();
  return previous.repository !== sourceRepository || previous.commit !== sha;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const sha = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const changed = await deliveryDecision(process.env.GITHUB_REPOSITORY,sha,fetch,process.env.GH_TOKEN);
  if (!process.env.GITHUB_OUTPUT) throw Error('Missing workflow output');
  await appendFile(process.env.GITHUB_OUTPUT,`source_sha=${sha}\nchanged=${changed}\n`);
  console.log(changed ? `Verified source ${sha}; build required.` : `Verified source ${sha}; already deployed.`);
}
