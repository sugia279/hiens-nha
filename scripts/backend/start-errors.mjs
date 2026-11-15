import { readFile } from 'node:fs/promises';
const log=await readFile('/tmp/hiens-local-start.log','utf8').catch(()=> 'Local start log unavailable');
const safe=log.split('\n').filter(line=>/error|failed|invalid|unsupported|not found/i.test(line)).slice(-25).map(line=>line
  .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g,'[redacted-jwt]')
  .replace(/sb_(secret|publishable)_[\w-]+/g,'[redacted-key]')
  .replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted-db-url]')).join('\n');
console.error(safe||'Local Supabase start failed; inspect the runner privately.');
