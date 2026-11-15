import { readFile, appendFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
export function selectLoadProfile(paths) {
  return paths.length &&
    paths.every(
      (path) =>
        !/^(supabase\/|scripts\/(?:backend|migration)\/|tests\/(?:backend|load)\/|package(?:-lock)?\.json$|\.github\/workflows\/backend-foundation\.yml$)/.test(
          path,
        ),
    )
    ? 'ci'
    : 'full';
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  let profile = 'full';
  try {
    const event = JSON.parse(
      await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'),
    );
    const sha = event.pull_request?.head?.sha ?? process.env.GITHUB_SHA;
    if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Missing source commit');
    const paths = execFileSync('git', ['diff', '--name-only', sha + '^', sha], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n')
      .filter(Boolean);
    profile = selectLoadProfile(paths);
  } catch {}
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, 'profile=' + profile + '\n');
  console.log('Local load profile: ' + profile);
}
