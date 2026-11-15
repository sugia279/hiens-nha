import { readFile } from 'node:fs/promises';
import { localEnvironment } from './local-environment.mjs';
import { controls, changeControl } from './control-model.mjs';
const env = await localEnvironment(),
  db = {
    query: async (q, args = []) => ({ rows: await env.sql.unsafe(q, args) }),
  };
try {
  if (process.argv.includes('--apply')) {
    const path = process.argv[process.argv.indexOf('--apply') + 1];
    if (!path) throw new Error('Explicit control JSON file required');
    const value = JSON.parse(await readFile(path, 'utf8'));
    console.log(JSON.stringify(await changeControl(db, value)));
  } else console.log(JSON.stringify(await controls(db)));
} finally {
  await env.sql.end();
}
