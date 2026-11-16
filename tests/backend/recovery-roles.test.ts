import { expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureRecoveryRoles } from '../../scripts/backend/hosted-recovery-engine.mjs';

it('creates only missing ACL names through the container administrator; quotes names and preserves existing roles', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'hn-recovery-roles-'));
  const log = join(directory, 'commands.jsonl');
  const quoted = 'acl"; grant postgres to anon;--';
  await writeFile(join(directory, 'docker'), `#!${process.execPath}\n` +
    `const fs=require('fs');const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify(args)+'\\n');` +
    `if(args.at(-1).startsWith('select '))process.stdout.write(JSON.stringify(['postgres','anon','supabase_admin']));` +
    `else if(!args.includes('supabase_admin'))process.exit(1);\n`, { mode: 0o700 });
  const previousPath = process.env.PATH, previousDesignation = process.env.ALLOW_LOCAL_REHEARSAL;
  process.env.PATH = directory + ':' + previousPath;
  process.env.ALLOW_LOCAL_REHEARSAL = 'hiens-nha-disposable';
  const target = {url:'postgres://postgres:private-fixture@127.0.0.1:54322/postgres',container:'supabase_db_fixture'};
  try {
    expect(await ensureRecoveryRoles(target, ['anon', quoted, quoted])).toBe(1);
    expect(await ensureRecoveryRoles(target, ['anon','postgres'])).toBe(0);
    const commands = (await readFile(log,'utf8')).trim().split('\n').map(line => JSON.parse(line));
    expect(commands).toHaveLength(3);
    for (const args of commands) {
      expect(args.slice(0,8)).toEqual(['exec','-i','supabase_db_fixture','psql','-U','supabase_admin','-d','postgres']);
      expect(args).toContain('-X'); expect(args).toContain('--set=ON_ERROR_STOP=1');
    }
    expect(commands[1].at(-1)).toBe('begin;create role "acl""; grant postgres to anon;--" nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;commit;');
    expect(JSON.stringify(commands)).not.toContain('private-fixture');
    for (const bad of [{...target,url:'postgres://untrusted.invalid/postgres'},{...target,container:'production'}])
      await expect(ensureRecoveryRoles(bad,['missing'])).rejects.toThrow();
    for (const roles of [['pg_monitor'],[''],['x'.repeat(64)],['bad\0name']])
      await expect(ensureRecoveryRoles(target,roles)).rejects.toThrow('DISPOSABLE_TARGET_REQUIRED');
    expect((await readFile(log,'utf8')).trim().split('\n')).toHaveLength(3);
    await writeFile(join(directory,'docker'), `#!${process.execPath}\nprocess.stderr.write('private-fixture');process.exit(1);\n`, {mode:0o700});
    await expect(ensureRecoveryRoles(target,['missing'])).rejects.toThrow(/^OPERATOR_COMMAND_FAILED$/);
  } finally {
    process.env.PATH = previousPath;
    if(previousDesignation === undefined) delete process.env.ALLOW_LOCAL_REHEARSAL; else process.env.ALLOW_LOCAL_REHEARSAL = previousDesignation;
    await rm(directory,{recursive:true,force:true});
  }
});
