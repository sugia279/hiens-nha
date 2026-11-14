import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const env = { ...process.env };
const fixture = await readFile('backend-test-results/sessions.json','utf8').then(JSON.parse,()=>null);
if (fixture) Object.assign(env,{ LOCAL_SUPABASE_URL:fixture.url,LOCAL_PUBLISHABLE_KEY:fixture.key,LOCAL_ENTITY_ID:fixture.entityId,LOCAL_MEMBER_A_JWT:fixture.sessions.A.access_token,LOCAL_MEMBER_B_JWT:fixture.sessions.B.access_token,LOCAL_OWNER_JWT:fixture.sessions.owner.access_token });
const base = env.LOCAL_SUPABASE_URL;
if (!base || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) throw new Error('A loopback-only local Supabase URL is required');
for (const name of ['LOCAL_PUBLISHABLE_KEY', 'LOCAL_ENTITY_ID', 'LOCAL_MEMBER_A_JWT', 'LOCAL_MEMBER_B_JWT', 'LOCAL_OWNER_JWT']) if (!env[name]) throw new Error(`Missing ${name}`);
const A = env.LOCAL_MEMBER_A_JWT, B = env.LOCAL_MEMBER_B_JWT, O = env.LOCAL_OWNER_JWT;
const entity = env.LOCAL_ENTITY_ID;
async function call(path, token, method = 'GET', body, extra = {}) {
  const r = await fetch(base + path, { method, headers: { apikey: env.LOCAL_PUBLISHABLE_KEY, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined, redirect: 'error' });
  return { status: r.status, data: await r.json() };
}
const api = '/functions/v1/api/v1';
assert.equal((await call(api + '/me', A)).data.role, 'member');
assert.equal((await call(api + '/me', B)).data.role, 'member');
assert.equal((await call(api + '/me', O)).data.role, 'owner');
assert.equal((await call(api + '/me')).status, 401);
assert.equal((await call(api + '/me', 'invalid')).status, 401);
const key = crypto.randomUUID(); const payload = { body: 'Isolated local permission fixture' };
const created = await call(`${api}/entities/${entity}/comments`, A, 'POST', payload, { 'idempotency-key': key });
assert.equal(created.status, 200); assert.equal(created.data.status, 'pending'); const id = created.data.id; assert.ok(id);
assert.equal((await call(`${api}/entities/${entity}/comments`, A, 'POST', payload, { 'idempotency-key': key })).data.id, id);
for (const token of [undefined, B]) {
  const read = await call(`/rest/v1/comments?id=eq.${id}`, token);
  assert.equal(read.status, 200); assert.deepEqual(read.data, []);
}
assert.equal((await call(`/rest/v1/comments?id=eq.${id}`, A, 'PATCH', { status: 'approved' })).status, 403);
assert.equal((await call('/rest/v1/role_assignments', A, 'POST', { user_id: id, role: 'owner' })).status, 403);
assert.equal((await call('/rest/v1/rpc/moderate_comment', A, 'POST', { p_id: id, p_status: 'approved', p_expected_version: 1, p_reason: 'forged' })).status, 403);
assert.equal((await call(`${api}/comments/${id}`, B, 'PATCH', { body: 'forged', expectedVersion: 1 })).status, 403);
const approved = await call(`${api}/comments/${id}/moderate`, O, 'POST', { status: 'approved', expectedVersion: 1, reason: 'local test' });
assert.equal(approved.status, 200); assert.equal(approved.data.version, 2);
assert.equal((await call(`/rest/v1/comments?id=eq.${id}`)).data.length, 1);
const edited = await call(`${api}/comments/${id}`, A, 'PATCH', { body: 'Changed text', expectedVersion: 2 });
assert.equal(edited.status, 200); assert.equal(edited.data.status, 'pending');
assert.deepEqual((await call(`/rest/v1/comments?id=eq.${id}`)).data, []);
assert.equal((await call(`${api}/comments/${id}/moderate`, O, 'POST', { status: 'approved', expectedVersion: 2, reason: 'stale' })).status, 409);
assert.equal((await call(`${api}/comments/${id}`, A, 'DELETE', { expectedVersion: 3 })).status, 200);
console.log('Local Supabase JWT / Edge / PostgREST permission assertions passed; fixture soft-deleted.');

const parallelKey = crypto.randomUUID();
const duplicates = await Promise.all([1,2].map(()=>call(`${api}/entities/${entity}/comments`,A,'POST',{body:'Concurrent retry fixture'},{'idempotency-key':parallelKey})));
assert.ok(duplicates.every(x=>x.status===200),'Concurrent create should commit/replay');
assert.equal(duplicates[0].data.id,duplicates[1].data.id);
const raceId=duplicates[0].data.id;
const edits=await Promise.all(['first','second'].map(body=>call(`${api}/comments/${raceId}`,A,'PATCH',{body,expectedVersion:1})));
assert.deepEqual(edits.map(x=>x.status).sort(),[200,409]);
assert.equal((await call(`${api}/comments/${raceId}`,A,'DELETE',{expectedVersion:2})).status,200);
const canonical=await call(`${api}/entities/resolve?path=${encodeURIComponent('/hiens-nha/en/music?x=1')}`);
assert.equal(canonical.status,200);assert.equal(canonical.data.id,entity);
const mine=await call(`${api}/entities/${entity}/comments?view=mine`,A);assert.equal(mine.status,200);
assert.equal((await call(`${api}/entities/${entity}/comments?view=mine`)).status,401);
// Refresh uses the actual local Auth service, independently of the browser's mocked provider handoff.
if(fixture){
  const response=await fetch(base+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:env.LOCAL_PUBLISHABLE_KEY,'content-type':'application/json'},body:JSON.stringify({refresh_token:fixture.sessions.B.refresh_token})});
  assert.equal(response.status,200);const refreshed=await response.json();assert.ok(refreshed.access_token&&refreshed.refresh_token,'Local Auth refresh succeeds');
  fixture.sessions.B=refreshed;await (await import('node:fs/promises')).writeFile('backend-test-results/sessions.json',JSON.stringify(fixture),{mode:0o600});
}
console.log('Real local JWT canonical identity, own-view, concurrent idempotency/version and Auth refresh assertions passed.');

const legacy=await call('/rest/v1/comments?author_id=is.null&limit=1');
assert.equal(legacy.status,200);assert.ok(legacy.data.length>0,'Imported legacy fixture exists');
for(const token of [A,O]) assert.equal((await call(`${api}/comments/${legacy.data[0].id}`,token,'PATCH',{body:'unverified claim',expectedVersion:legacy.data[0].version})).status,403);
console.log('Real JWT legacy username collision grants no edit ownership, including owner.');

// Phase 3: actual caller JWTs, JSONB RPC projection and exact-revision moderation.
const postPayload={title:'Real stack poem',body:'Line one\nLine two',kind:'poem',category:'Poetry',tags:['local'],series:'',order:1};
const writeFeature=(path,token,body,method='POST',key=crypto.randomUUID())=>call(api+path,token,method,body,{'idempotency-key':key});
const must=(response,status=200)=>{assert.equal(response.status,status,JSON.stringify(response.data));return response.data;};
const postKey=crypto.randomUUID();let publication=must(await writeFeature('/posts',A,postPayload,'POST',postKey));
assert.equal(must(await writeFeature('/posts',A,postPayload,'POST',postKey)).id,publication.id);
assert.equal((await call(api+'/posts/'+publication.id)).status,404);
assert.equal((await call(api+'/posts/'+publication.id+'?view=working',B)).status,403);
must(await writeFeature('/posts/'+publication.id,B,{payload:postPayload,expectedVersion:1},'PATCH'),403);
publication=must(await writeFeature('/posts/'+publication.id+'/submit',A,{expectedVersion:1}));
must(await writeFeature('/posts/'+publication.id+'/moderate',A,{decision:'approve',revision:1,expectedVersion:publication.version,reason:'forged'}),403);
publication=must(await writeFeature('/posts/'+publication.id+'/moderate',O,{decision:'approve',revision:1,expectedVersion:publication.version,reason:'Local review'}));
publication=must(await writeFeature('/posts/'+publication.id,A,{payload:{...postPayload,body:'Private changed text'},expectedVersion:publication.version},'PATCH'));
assert.equal(must(await call(api+'/posts/'+publication.id)).payload.body,postPayload.body);
const forged=await call('/rest/v1/rpc/publication_write',B,'POST',{p_feature:'posts',p_action:'save',p_id:publication.id,p_payload:postPayload,p_expected_version:publication.version,p_key:crypto.randomUUID()});must(forged,403);
const media=must(await writeFeature('/media',A,{title:'Media local fixture',description:'Provider fallback',url:'https://youtu.be/l5WuCFObGGQ',category:'video',tags:['local']}));assert.equal(media.payload.url,'https://www.youtube.com/watch?v=l5WuCFObGGQ');
console.log('Real JWT posts/media drafts, old-public projection, exact moderation and direct RPC ownership assertions passed.');

// Phase 4: edit-vs-complete must lock the same row and admit exactly one CAS winner.
const scope={title:'Local race request',description:'Initial scope for concurrency verification',expectedResult:'Documented output',category:'technology',priority:'normal',tags:['local']};
let help=must(await writeFeature('/requests',A,scope));const requestId=help.id;
assert.equal((await call(api+'/requests/'+requestId,B)).status,404);
must(await writeFeature('/requests/'+requestId+'/transitions',A,{expectedVersion:help.version,scopeRevision:1,status:'accepted',message:'forged'}),403);
help=must(await writeFeature('/requests/'+requestId+'/moderate',O,{expectedVersion:help.version,scopeRevision:1,decision:'approved',reason:'Local publication'}));assert.equal(help.status,'new');
help=must(await writeFeature('/requests/'+requestId+'/transitions',O,{expectedVersion:help.version,scopeRevision:1,status:'accepted',message:'Accept scope'}));
must(await writeFeature('/requests/'+requestId+'/transitions',O,{expectedVersion:help.version,scopeRevision:1,status:'completed',message:'Empty output',result:''}),422);
const race=await Promise.all([
 writeFeature('/requests/'+requestId+'/scope',A,{expectedVersion:help.version,scopeRevision:1,payload:{...scope,description:'Changed scope requiring another acceptance'}},'PATCH'),
 writeFeature('/requests/'+requestId+'/transitions',O,{expectedVersion:help.version,scopeRevision:1,status:'completed',message:'Complete accepted scope',result:'Verified output'})
]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
const winner=must(await call(api+'/requests/'+requestId,A));assert.ok(winner.status==='completed'?winner.accepted_scope_revision===winner.scope_revision:winner.status==='new'&&winner.accepted_scope_revision===null&&winner.result==='');
const history=must(await call(api+'/requests/'+requestId+'/events',A));assert.equal(history.items.length,4);
const event=history.items[0];const correction=must(await writeFeature('/requests/'+requestId+'/corrections',O,{expectedVersion:winner.version,scopeRevision:winner.scope_revision,eventId:event.id,message:'Correction evidence'}));assert.equal(correction.status,winner.status);
const after=must(await call(api+'/requests/'+requestId+'/events'));assert.deepEqual(after.items.find(e=>e.id===event.id),event);
const legacyRequest=must(await call(api+'/requests/legacy/14'));assert.equal(legacyRequest.legacy_number,14);assert.equal(legacyRequest.author_id,null);
const legacyEntity=must(await call(`${api}/entities/resolve?path=${encodeURIComponent('/hiens-nha/en/requests/14/')}`));assert.equal(legacyRequest.entity_id,legacyEntity.id);
console.log('Real JWT requests publication/acceptance, result, scope-vs-complete race, immutable correction and legacy VI/EN mapping assertions passed.');
