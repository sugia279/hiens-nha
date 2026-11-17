import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { acceptsLegacyFeature } from '../src/lib/legacy-features.mjs';
import { createRequestArchive, requestMarker } from '../src/lib/requests.mjs';
export async function archiveRequestEvent(event, { repo, eventName, token, request = fetch, directory = path.resolve('data/requests') }) {
 const number = Number(event.issue?.number ?? event.inputs?.issue_number);
 if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '') || !Number.isSafeInteger(number) || number < 1) throw new Error('Invalid repository or issue number');
 const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
 const destination = path.join(directory, `issue-${number}.json`);
 const exists = await fs.access(destination).then(() => true, () => false);
 if (!exists && event.issue && !String(event.issue.body ?? '').startsWith(requestMarker)) return;
 const api = `https://api.github.com/repos/${repo}`;
 async function get(resource) { const response = await request(`${api}/${resource}`, { headers }); if (!response.ok) throw new Error(`Request archive failed (${response.status})`); return response.json(); }
 const deleted = eventName === 'issues' && event.action === 'deleted';
 const issue = deleted ? event.issue : await get(`issues/${number}`);
 if (!exists && !String(issue.body ?? '').startsWith(requestMarker)) return;
 const label = await request(`${api}/labels/request-approved`, { headers });
 if (label.status === 404) {
  const response = await request(`${api}/labels`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'request-approved', color: '0f766e', description: 'Published Tiệm Nhờ Vả request' }) });
  if (!response.ok && response.status !== 422) throw new Error('Cannot create request approval label');
 } else if (!label.ok) throw new Error('Cannot read request approval label');
 const comments = [];
 if (!deleted) for (let page = 1; ; page++) { const batch = await get(`issues/${number}/comments?per_page=100&page=${page}`); comments.push(...batch); if (batch.length < 100) break; }
 const previous = exists ? JSON.parse(await fs.readFile(destination, 'utf8')) : undefined;
 const archive = createRequestArchive(issue, comments, repo.split('/')[0], deleted, { previous, synchronizedAt: new Date().toISOString() });
 await fs.mkdir(directory, { recursive: true });
 await fs.writeFile(destination, JSON.stringify(archive, null, 2) + '\n');
 console.log(`Archived request ${number}; rejected owner updates: ${archive.rejectedUpdates.length}.`);
 return archive;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
 const sources=JSON.parse(await fs.readFile(new URL('../config/feature-sources.json',import.meta.url),'utf8'));
 const maintenance=JSON.parse(await fs.readFile(new URL('../config/legacy-features.json',import.meta.url),'utf8'));
 if(acceptsLegacyFeature(sources,maintenance,'requests')){
 const event = JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
 await archiveRequestEvent(event, { repo: process.env.GITHUB_REPOSITORY, eventName: process.env.GITHUB_EVENT_NAME, token: process.env.GITHUB_TOKEN });
 }else console.log('Archive requests skipped: legacy publication frozen or API source.');
}
