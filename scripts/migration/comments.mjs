import {postgresAdapter} from '../backend/postgres-adapter.mjs';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { base } from '../../site-settings.mjs';
import { planCommentsImport, applyCommentsPlan, reconcileComments } from './comments-model.mjs';
async function walk(dir) { return (await Promise.all((await readdir(dir,{withFileTypes:true})).filter(e => !e.name.startsWith('.')).map(e => e.isDirectory() ? walk(resolve(dir,e.name)) : [resolve(dir,e.name)]))).flat(); }
const dist = resolve('dist'); const paths = [];
for (const file of await walk(dist)) {
  if (!file.endsWith('.html')) continue;
  const logical = relative(dist,file).replaceAll('\\','/');
  const html = await readFile(file,'utf8');
  if (!html.includes('page-comments-heading') && !html.includes('data-api-comments') && !/^(en\/)?guestbook\/index.html$/.test(logical)) continue;
  if (logical === 'index.html') paths.push(base);
  else if (logical.endsWith('/index.html')) paths.push(base + logical.slice(0,-10));
}
const archives = await Promise.all((await readdir('data/guestbook')).filter(f=>f.endsWith('.json')).sort().map(async f=>JSON.parse(await readFile(`data/guestbook/${f}`,'utf8'))));
const plan = planCommentsImport({paths,archives,base,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()});
let report = { mode: 'dry-run', sourceCommit: plan.sourceCommit, entities: plan.entities.length, records: plan.records.length, checksum: plan.checksum };
if (process.argv.includes('--apply') || process.argv.includes('--compare')) {
  const url = process.env.LOCAL_DATABASE_URL;
  if (!url || !['127.0.0.1','localhost','[::1]'].includes(new URL(url).hostname)) throw new Error('Explicit loopback LOCAL_DATABASE_URL required; remote imports are not enabled');
  const { default: postgres } = await import('postgres'); const sql = postgres(url,{max:1});
  const db = postgresAdapter(sql);
  try { if (process.argv.includes('--apply')) report = {...report,mode:'local-apply',...await applyCommentsPlan(db,plan)};
    report = {...report,shadow:await reconcileComments(db,plan)};
  } finally { await sql.end(); }
}
// Report counts/checksum only. Never write pending bodies, raw records or DB credentials to source/logs.
console.log(JSON.stringify(report,null,2));
