import {beforeAll,afterAll,beforeEach,it,expect} from 'vitest';
import {testDatabase} from './helpers/database';
const A='10000000-0000-0000-0000-000000000001',B='10000000-0000-0000-0000-000000000002',O='10000000-0000-0000-0000-000000000003',E='20000000-0000-0000-0000-000000000001';
let db:Awaited<ReturnType<typeof testDatabase>>;
async function as(user:string|null,query:string,args:unknown[]=[]){
 await db.exec(`set role ${user?'authenticated':'anon'}`);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user??'']);
 try {return (await db.query<any>(query,args)).rows;} finally {await db.exec('reset role');}
}
const read=(user:string|null=null)=>as(user,'select public.feature_state(\'posts\')');
beforeAll(async()=>{
 db=await testDatabase();
 for(const id of [A,B,O])await db.query('insert into auth.users values($1,\'{"role":"owner"}\')',[id]);
 await db.query("insert into public.role_assignments(user_id,role) values($1,'owner')",[O]);
 await db.query("insert into public.content_entities(id,collection,legacy_key,canonical_path) values($1,'page','read-fixture','/hiens-nha/read-fixture/')",[E]);
 await db.exec("update private.backend_settings set comments_source='api',comments_epoch=1,comments_writes_enabled=true");
},30000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
 await db.exec("delete from private.read_windows; update private.read_budgets set max_per_second=300; select set_config('request.method','POST',false),set_config('request.headers','{}',false),set_config('pgrst.db_tx_end','commit',false)");
});
it('denies every old direct table/column read for anon/member/owner and unmetered private projection',async()=>{
 for(const user of [null,A,O]){
  for(const table of ['comments','content_entities','profiles','role_assignments','comment_revisions','audit_events'])
   await expect(as(user,`select * from public.${table}`)).rejects.toMatchObject({code:'42501'});
  await expect(as(user,'select private.comment_projection()')).rejects.toMatchObject({code:'42501'});
 }
 const wrappers=(await db.query<any>("select proname,provolatile,prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('comment_state','feature_state','publication_read','publication_history','request_read','request_history','request_legacy','read_comments','resolve_entity','caller_is_owner')")).rows;
 expect(wrappers).toHaveLength(10);expect(wrappers.every(r=>r.provolatile==='v'&&!r.prosecdef)).toBe(true);
});
it('shares class and global budgets across callers without trusting metadata or arguments',async()=>{
 await db.exec("update private.read_budgets set max_per_second=2 where scope='member'; insert into private.read_windows values('global',now()+interval '1 hour',1),('member',now()+interval '1 hour',1)");
 await read(A);await expect(read(B)).rejects.toMatchObject({code:'PT429'});
 await db.exec("delete from private.read_windows");expect((await as(A,'select public.caller_is_owner() as owner'))[0].owner).toBe(false);
});
it('shares the global budget across anonymous, member and owner',async()=>{
 await db.exec("update private.read_budgets set max_per_second=3 where scope='global'; insert into private.read_windows values('global',now()+interval '1 hour',1)");
 await read(A);await read(O);await expect(read()).rejects.toMatchObject({code:'PT429'});
 expect((await db.query<any>("select count from private.read_windows where scope='global'")).rows[0].count).toBe(3);
});
it('bounds storage, resets expired seconds, rejects GET/HEAD, and fails closed without configuration',async()=>{
 for(const user of [null,A,O])await read(user);
 expect((await db.query<any>('select count(*)::int n from private.read_windows')).rows[0].n).toBe(4);
 await db.exec("update private.read_windows set window_start=now()-interval '1 minute',count=300");await read();
 expect((await db.query<any>("select count from private.read_windows where scope='global'")).rows[0].count).toBe(1);
 for(const method of ['GET','HEAD']){
  await db.query("select set_config('request.method',$1,false)",[method]);await expect(read()).rejects.toMatchObject({code:'PT405'});
 }
 await db.exec("select set_config('request.method','POST',false);delete from private.read_windows;delete from private.read_budgets where scope='global'");
 await expect(read()).rejects.toMatchObject({code:'PT503'});
 await db.exec("insert into private.read_budgets values('global',300)");
});
it('preserves own pending, owner queue, public roots/replies and hides replies after parent unpublish',async()=>{
 const root=(await as(O,'select (public.create_comment($1,\'Owner root\',$2)).*',[E,crypto.randomUUID()]))[0];
 const child=(await as(A,'select (public.create_comment($1,\'Member pending\',$2,$3)).*',[E,crypto.randomUUID(),root.id]))[0];
 const list=async(user:string|null,args='')=>(await as(user,`select public.read_comments(p_entity_id=>$1${args}) as data`,[E]))[0].data;
 expect((await list(null,',p_parent_id=>\''+root.id+'\'')).length).toBe(0);
 expect((await list(A,',p_mine=>true')).map((r:any)=>r.id)).toContain(child.id);
 expect((await list(B,',p_mine=>true'))).toEqual([]);
 await expect(as(null,'select public.read_comments(p_mine=>true)')).rejects.toMatchObject({code:'PT401'});
 await expect(as(B,'select public.read_comments()')).rejects.toMatchObject({code:'PT403'});
 await as(O,'select public.moderate_comment($1,\'approved\',1,\'Reviewed\')',[child.id]);
 expect((await list(null,',p_parent_id=>\''+root.id+'\'')).length).toBe(1);
 await as(O,'select public.moderate_comment($1,\'hidden\',1,\'Hidden root\')',[root.id]);
 expect((await list(null,',p_parent_id=>\''+root.id+'\'')).length).toBe(0);
 expect((await list(A,',p_mine=>true')).map((r:any)=>r.id)).toContain(child.id);
 await expect(as(null,'select public.read_comments(p_limit=>52)')).rejects.toMatchObject({code:'PT422'});
});

it('paginates anonymous shadow projection beyond51 rows including approved replies',async()=>{
 await db.query(`insert into public.comments(entity_id,body,status) select $1,'Page '||g,'approved' from generate_series(1,60) g`,[E]);
 const first=(await as(null,'select public.read_comments(p_shadow=>true,p_limit=>51) data'))[0].data;
 expect(first).toHaveLength(51);
 const last=first.at(-1);
 const second=(await as(null,'select public.read_comments(p_shadow=>true,p_limit=>51,p_after_time=>$1,p_after_id=>$2) data',[last.created_at,last.id]))[0].data;
 expect(second).toHaveLength(9);expect(new Set([...first,...second].map(r=>r.id)).size).toBe(60);
});

it('rejects rollback preference before returning data or losing the budget charge',async()=>{
 for(const prefer of ['tx=rollback','return=representation, TX = rollback','tx=rollback,return=minimal','tx="rollback"','tx=commit']){
  await db.query("select set_config('request.headers',$1,false)",[JSON.stringify({prefer})]);
  await expect(read()).rejects.toMatchObject({code:'PT422'});
 }
 await db.exec("select set_config('request.headers','{}',false),set_config('pgrst.db_tx_end','rollback',false)");
 await expect(read()).rejects.toMatchObject({code:'PT503'});
});
