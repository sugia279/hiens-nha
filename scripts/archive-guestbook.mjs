import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const marker = '<!-- hiens-nha:guestbook:v1 -->';
export function createArchive(issue, comments, deleted = false) {
  const active = !deleted && String(issue.body ?? '').includes(marker);
  const body = deleted ? '' : (issue.body ?? '');
  return {
    version: 1, number: issue.number, title: issue.title,
    contextPath: deleted ? undefined : body.match(/(?:^|\r?\n)### Page\r?\n([^\r\n]*)/)?.[1]?.trim(),
    body, message: body.match(/### Message\r?\n([\s\S]*?)(?:\r?\n### Page\r?\n|$)/)?.[1]?.trim() ?? body,
    htmlUrl: issue.html_url, createdAt: issue.created_at, updatedAt: issue.updated_at,
    author: { login: issue.user.login, htmlUrl: issue.user.html_url },
    approved: active && issue.labels.some((label) => (typeof label === 'string' ? label : label.name) === 'guestbook-approved'),
    deleted,
    comments: deleted ? [] : comments.map((comment) => ({
      id: comment.id, body: comment.body ?? '', htmlUrl: comment.html_url, createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      author: { login: comment.user.login, htmlUrl: comment.user.html_url },
      trusted: ['OWNER', 'MEMBER', 'COLLABORATOR'].includes(comment.author_association),
    })).sort((a, b) => a.id - b.id),
  };
}

export function usesGitComments(marker) {
  if (marker.version !== 1 || !['git', 'api'].includes(marker.source) || !Number.isSafeInteger(marker.epoch) || marker.epoch < 0 || (marker.source === 'api' && marker.epoch < 1)) throw new Error('Invalid comments source marker');
  return marker.source === 'git';
}

async function main() {
  const source = JSON.parse(await fs.readFile(new URL('../config/comments-source.json', import.meta.url), 'utf8'));
  if (!usesGitComments(source)) { console.log('Guestbook archiver skipped: comments use API source.'); return; }
  const event = JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const repo = process.env.GITHUB_REPOSITORY;
  const number = Number(event.issue?.number ?? event.inputs?.issue_number);
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !Number.isSafeInteger(number) || number < 1) throw new Error('Invalid repository or issue number');
  const headers = { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  const labelUrl = `https://api.github.com/repos/${repo}/labels`;
  const label = await fetch(`${labelUrl}/guestbook-approved`, { headers });
  if (label.status === 404) {
    const created = await fetch(labelUrl, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'guestbook-approved', color: '0f766e', description: 'Approved for publication on Hien’s Nha' }) });
    if (!created.ok && created.status !== 422) throw new Error(`Cannot create moderation label (${created.status})`);
  } else if (!label.ok) throw new Error(`Cannot read moderation label (${label.status})`);
  const directory = path.resolve('data/guestbook');
  const destination = path.join(directory, `issue-${number}.json`);
  const exists = await fs.access(destination).then(() => true, () => false);
  if (!exists && event.issue && !String(event.issue.body ?? '').includes(marker)) return;
  async function get(resource) {
    const response = await fetch(`https://api.github.com/repos/${repo}/${resource}`, {
      headers,
    });
    if (!response.ok) throw new Error(`GitHub archive request failed (${response.status})`);
    return response.json();
  }
  const deleted = process.env.GITHUB_EVENT_NAME === 'issues' && event.action === 'deleted';
  const issue = deleted ? event.issue : await get(`issues/${number}`);
  if (!exists && !String(issue.body ?? '').includes(marker)) return;
  const comments = [];
  if (!deleted) {
    for (let page = 1; ; page++) {
      const batch = await get(`issues/${number}/comments?per_page=100&page=${page}`);
      comments.push(...batch);
      if (batch.length < 100) break;
    }
  }
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(destination, JSON.stringify(createArchive(issue, comments, deleted), null, 2) + '\n');
  console.log(`Archived guestbook issue ${number}; ${comments.length} comments.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
