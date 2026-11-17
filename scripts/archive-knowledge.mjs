import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { acceptsLegacyFeature } from '../src/lib/legacy-features.mjs';
import { knowledgeMarker, parseKnowledgeBody } from '../src/lib/knowledge-submissions.mjs';

export function createKnowledgeArchive(issue, deleted = false) {
  const knowledge = deleted ? null : parseKnowledgeBody(issue.body);
  return { version: 1, number: issue.number, approved: Boolean(knowledge) && issue.labels.some((label) => (typeof label === 'string' ? label : label.name) === 'knowledge-approved'), deleted, knowledge };
}
async function main() {
  const sources = JSON.parse(await fs.readFile(new URL('../config/feature-sources.json', import.meta.url), 'utf8'));
  const maintenance = JSON.parse(await fs.readFile(new URL('../config/legacy-features.json', import.meta.url), 'utf8'));
  if (!acceptsLegacyFeature(sources, maintenance, 'posts')) { console.log('Archive posts skipped: legacy publication frozen or API source.'); return; }
  const event = JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const repo = process.env.GITHUB_REPOSITORY;
  const number = Number(event.issue?.number ?? event.inputs?.issue_number);
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !Number.isSafeInteger(number) || number < 1) throw new Error('Invalid repository or issue number');
  const headers = { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const directory = path.resolve('data/knowledge');
  const destination = path.join(directory, `issue-${number}.json`);
  const exists = await fs.access(destination).then(() => true, () => false);
  if (!exists && event.issue && !String(event.issue.body ?? '').startsWith(knowledgeMarker)) return;
  const deleted = process.env.GITHUB_EVENT_NAME === 'issues' && event.action === 'deleted';
  let issue = event.issue;
  if (!deleted) {
    const response = await fetch(`https://api.github.com/repos/${repo}/issues/${number}`, { headers });
    if (!response.ok) throw new Error(`Cannot read knowledge issue (${response.status})`);
    issue = await response.json();
  }
  if (!exists && !String(issue.body ?? '').startsWith(knowledgeMarker)) return;
  // Create the approval label once, so maintainers can select it in the issue sidebar.
  const labelUrl = `https://api.github.com/repos/${repo}/labels`;
  const label = await fetch(`${labelUrl}/knowledge-approved`, { headers });
  if (label.status === 404) {
    const created = await fetch(labelUrl, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'knowledge-approved', color: '7c3aed', description: 'Approved Knowledge submission' }) });
    if (!created.ok && created.status !== 422) throw new Error(`Cannot create knowledge label (${created.status})`);
  } else if (!label.ok) throw new Error(`Cannot read knowledge label (${label.status})`);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(destination, JSON.stringify(createKnowledgeArchive(issue, deleted), null, 2) + '\n');
  console.log(`Archived knowledge issue ${number}.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
