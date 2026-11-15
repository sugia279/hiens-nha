import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
export async function testDatabase(stopBefore?: string) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
  for (const file of readdirSync('supabase/migrations').filter(f=>f.endsWith('.sql')&&(!stopBefore||f<stopBefore)).sort()) await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'));
  return db;
}
