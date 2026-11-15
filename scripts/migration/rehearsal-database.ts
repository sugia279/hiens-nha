import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';

export function migrationFiles(stopBefore?: string) {
  return readdirSync('supabase/migrations').filter(f => f.endsWith('.sql') && (!stopBefore || f < stopBefore)).sort();
}
/** Disposable local schema only: no real Auth accounts, credentials or hosted connections. */
export async function initializeRehearsalSchema(db: { exec: (sql: string) => Promise<unknown>; query: (sql: string, args?: any[]) => Promise<any> }, stopBefore?: string) {
  await db.exec(`do $$ begin
    if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    end $$;
    create schema auth;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key,name text);`);
  for (const file of migrationFiles(stopBefore)) {
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'));
    const match = file.match(/^(\d+)_(.+)\.sql$/)!;
    await db.query('insert into supabase_migrations.schema_migrations(version,name) values($1,$2)', [match[1], match[2]]);
  }
}
export async function rehearsalDatabase(stopBefore?: string) {
  const db = new PGlite();
  try { await initializeRehearsalSchema(db, stopBefore); return db; }
  catch (error) { await db.close(); throw error; }
}
