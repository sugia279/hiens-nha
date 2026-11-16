import { it, expect, vi } from 'vitest';
import { stagingCredentials, stagingRef, stagingUrl, stagingFetch } from '../../scripts/backend/staging-target.mjs';
const token = (ref=stagingRef, role='service_role') => 'header.'+Buffer.from(JSON.stringify({ref,role,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature';
const fixture = () => ({STAGING_DB_URL:`postgresql://postgres.${stagingRef}:private-fixture@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full`, STAGING_SERVICE_ROLE_KEY:token(), STAGING_PUBLISHABLE_KEY:'sb_publishable_fixture'});
it('pins hosted load to isolated staging before client construction with explicit bounded profiles',()=>{
  const value=stagingCredentials(fixture(),['--confirm-staging-ci']);
  expect(value.url).toBe(stagingUrl);expect(value.profile).toBe('ci');expect(new URL(value.database).search).toBe('');
  expect(stagingCredentials(fixture(),['--confirm-staging-full']).profile).toBe('full');
  for (const args of [[],['--full'],['--confirm-staging-full','https://other.test']]) expect(()=>stagingCredentials(fixture(),args)).toThrow('STAGING_CONFIRMATION_REQUIRED');
});
it('bounds Auth admin transport and rejects any other HTTP origin before sending credentials',async()=>{
  const transport=vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch',transport);
  try {
    expect(()=>stagingFetch('https://eqxlywwvchmzuyqtxexu.supabase.co/auth/v1/admin/users')).toThrow('STAGING_HTTP_TARGET_INVALID');
    expect(transport).not.toHaveBeenCalled();
    await stagingFetch(stagingUrl+'/auth/v1/admin/users',{redirect:'follow',headers:{apikey:'private-fixture'}});
    expect(transport.mock.calls[0][1].redirect).toBe('error');
    expect(transport.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  } finally {vi.unstubAllGlobals();}
});
it('rejects production, foreign admin roles/refs, alternate hosts and TLS/query option injection without echoing secrets',()=>{
  const db=fixture().STAGING_DB_URL;
  const bad=[db.replace(stagingRef,'eqxlywwvchmzuyqtxexu'),db.replace('aws-1-ap-southeast-1.pooler.supabase.com','127.0.0.1'),db.replace(':5432',':6543'),db.replace('verify-full','disable'),db+'&options=unsafe',db+'#private-fixture',db.replace('/postgres?','/other?')];
  for(const uri of bad) expect(()=>stagingCredentials({...fixture(),STAGING_DB_URL:uri},['--confirm-staging-ci'])).toThrow(/^STAGING_CREDENTIALS_INVALID$/);
  for(const key of [token('eqxlywwvchmzuyqtxexu'),token(stagingRef,'anon'),'sb_secret_private-fixture','broken-private-fixture'])
    expect(()=>stagingCredentials({...fixture(),STAGING_SERVICE_ROLE_KEY:key},['--confirm-staging-ci'])).toThrow(/^STAGING_CREDENTIALS_INVALID$/);
});
