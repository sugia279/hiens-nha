import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
export function loopback(value) {
  const url = new URL(value);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw new Error('Loopback disposable environment required');
  return url;
}
export async function localEnvironment() {
  if (
    process.env.CI !== 'true' &&
    process.env.ALLOW_LOCAL_REHEARSAL !== 'hiens-nha-disposable'
  )
    throw new Error(
      'Set ALLOW_LOCAL_REHEARSAL=hiens-nha-disposable for the disposable local stack',
    );
  const status = JSON.parse(
    await readFile('backend-test-results/stack.json', 'utf8'),
  );
  const sessions = JSON.parse(
    await readFile('backend-test-results/sessions.json', 'utf8'),
  );
  const database = status.DB_URL ?? status.db_url;
  loopback(database);
  loopback(sessions.url);
  return {
    database,
    fixture: sessions,
    sql: postgres(database, { max: 1 }),
    status,
  };
}
