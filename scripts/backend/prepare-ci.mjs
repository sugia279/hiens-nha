import { readFile, writeFile, mkdir } from 'node:fs/promises';
if (process.env.CI !== 'true' && process.env.LOCAL_TEST_ONLY !== 'true') throw new Error('Disposable local test configuration only');
const path='supabase/config.toml';const config=await readFile(path,'utf8');
// This temporary test-only provider obtains real local Auth JWTs. Production config stays disabled in Git.
await writeFile(path,config.replace('[auth.email]\nenabled = false','[auth.email]\nenabled = true'));
await mkdir('supabase/functions',{recursive:true});
await writeFile('supabase/functions/.env','ALLOWED_ORIGINS=http://127.0.0.1:4321,http://localhost:4321\nSITE_BASE_PATH=/hiens-nha/\n');
await mkdir('backend-test-results',{recursive:true});
console.log('Prepared disposable local Auth fixtures; no hosted resources.');
