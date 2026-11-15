import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createServer, connect } from 'node:tls';
import { loadRecoveryCa, validateRecoveryCa, recoveryTlsOptions } from '../../scripts/backend/recovery-ca.mjs';
import { hostedDump } from '../../scripts/backend/hosted-recovery-engine.mjs';

let directory: string, fixtureCa: string, key: string, cert: string;
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hn-ca-test-'));
  const run = (args: string[]) => execFileSync('openssl', args, { cwd: directory, stdio: 'ignore' });
  run(['req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.crt','-days','1','-subj','/CN=Local recovery test CA','-addext','basicConstraints=critical,CA:TRUE']);
  run(['req','-new','-newkey','rsa:2048','-nodes','-keyout','server.key','-out','server.csr','-subj','/CN=localhost']);
  await writeFile(join(directory, 'server.ext'), 'subjectAltName=DNS:localhost\nextendedKeyUsage=serverAuth\n');
  run(['x509','-req','-in','server.csr','-CA','ca.crt','-CAkey','ca.key','-CAcreateserial','-out','server.crt','-days','1','-extfile','server.ext']);
  [fixtureCa,key,cert] = await Promise.all(['ca.crt','server.key','server.crt'].map(p=>readFile(join(directory,p),'utf8')));
}, 20000);
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

it('requires the official pinned CA and refuses replacement, malformed or expired certificates', async () => {
  const ca = await loadRecoveryCa();
  expect(validateRecoveryCa(ca.pem)).toBe(ca.pem);
  expect(() => validateRecoveryCa('not a certificate')).toThrow('HOSTED_CA_INVALID');
  expect(() => validateRecoveryCa(fixtureCa)).toThrow('HOSTED_CA_INVALID');
  expect(() => validateRecoveryCa(ca.pem + fixtureCa)).toThrow('HOSTED_CA_INVALID');
  expect(() => validateRecoveryCa(ca.pem, Date.UTC(2032,0,1))).toThrow('HOSTED_CA_EXPIRED');
});

it('actually verifies both trust chain and hostname during TLS handshakes', async () => {
  const server = createServer({ key, cert }, socket => socket.end());
  server.on('tlsClientError', () => {}); // Expected negative handshakes below.
  await new Promise<void>((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture listener missing');
  const handshake = (host: string, ca: string) => new Promise<void>((resolve,reject) => {
    const socket = connect({ host:'127.0.0.1', port:address.port, ...recoveryTlsOptions(host,ca) });
    socket.setTimeout(3000,()=>socket.destroy(new Error('Fixture TLS deadline')));
    socket.once('secureConnect',()=>{socket.destroy();resolve();});
    socket.once('error',error=>{socket.destroy();reject(error);});
  });
  try {
    await handshake('localhost',fixtureCa);
    await expect(handshake('wrong-host.invalid',fixtureCa)).rejects.toMatchObject({code:'ERR_TLS_CERT_ALTNAME_INVALID'});
    await expect(handshake('localhost',(await loadRecoveryCa()).pem)).rejects.toThrow();
  } finally { await new Promise<void>(resolve=>server.close(()=>resolve())); }
}, 15000);

it('passes the pinned CA to native pg_dump and cleans its disposable copy even on failure', async () => {
  const log = join(directory,'docker.jsonl'), copy = join(directory,'copied-ca.crt');
  const executable = join(directory,'docker');
  await writeFile(executable, `#!${process.execPath}\n` +
    `const fs=require('fs');const args=process.argv.slice(2);fs.appendFileSync(${JSON.stringify(log)},JSON.stringify({args,root:process.env.PGSSLROOTCERT})+'\\n');` +
    `if(args[0]==='cp')fs.copyFileSync(args[1],${JSON.stringify(copy)});` +
    `else if(args.includes('pg_dump')){if(process.env.PGDATABASE==='fail'){process.stderr.write('private-password-fixture');process.exit(1);}process.stdout.write('fixture dump');}` +
    `else if(args.includes('rm'))fs.unlinkSync(${JSON.stringify(copy)});\n`, {mode:0o700});
  await chmod(executable,0o700);
  const previousPath = process.env.PATH;
  process.env.PATH = directory + ':' + previousPath;
  const ca = await loadRecoveryCa();
  const config = {host:'approved-pooler.invalid',username:'fixture-user',password:'private-password-fixture',database:'postgres'};
  try {
    await hostedDump(config,'supabase_db_fixture',ca.path)('0001-0002-1',join(directory,'dump.bin'));
    await expect(readFile(copy)).rejects.toMatchObject({code:'ENOENT'});
    await expect(hostedDump({...config,database:'fail'},'supabase_db_fixture',ca.path)('0001-0002-1',join(directory,'failure.bin')))
      .rejects.toThrow(/^OPERATOR_COMMAND_FAILED$/);
    await expect(readFile(copy)).rejects.toMatchObject({code:'ENOENT'});
    const rows = (await readFile(log,'utf8')).trim().split('\n').map(line=>JSON.parse(line));
    const dumps = rows.filter(row=>row.args.includes('pg_dump'));
    expect(dumps).toHaveLength(2);
    for (const row of dumps) expect(row.root).toMatch(/^\/tmp\/hn_recovery_ca_[a-f0-9]{32}\.crt$/);
    expect(rows.filter(row=>row.args[0]==='cp').every(row=>row.args[1]===ca.path)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain(config.password);
  } finally { process.env.PATH=previousPath; }
});
