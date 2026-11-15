import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDatabase } from './helpers/database';
import { planCommentsImport, applyCommentsPlan, reconcileComments, entityForPath } from '../../scripts/migration/comments-model.mjs';
const base = '/hiens-nha/';
const A = '10000000-0000-0000-0000-000000000001';
const legacy = { version:1, number:100, body:'', contextPath:base+'en/music', message:'Legacy <script>plain</script>', approved:true, deleted:false, createdAt:'2026-11-14T00:00:00Z', updatedAt:'2026-11-14T01:00:00Z', author:{login:'same-as-member'}, htmlUrl:'https://github.com/example/issues/100', comments:[{id:101,body:'Trusted old reply',trusted:true,createdAt:'2026-11-14T01:00:00Z',author:{login:'collaborator'}},{id:102,body:'Untrusted reply',trusted:false,createdAt:'2026-11-14T01:00:00Z',author:{login:'stranger'}}] };
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async()=>{db=await testDatabase();await db.query("insert into auth.users values($1,'{\"role\":\"owner\",\"user_name\":\"same-as-member\"}')",[A]);},30000);
afterAll(async()=>{await db.close();});
const plan = () => planCommentsImport({paths:[base+'music/',base+'en/music/',base+'guestbook/'],archives:[legacy,{...legacy,number:103,approved:false,comments:[]},{...legacy,number:104,deleted:true,message:'',comments:[]}],base,sourceCommit:'fixture-commit'});
describe('pilot import without author claims or dual writes',()=>{
  it('VI/EN/encoding normalization yields the same registered entity',()=>{
    expect(entityForPath(base+'en/music?x=1#c',base)).toEqual(entityForPath(base+'music/',base));
    expect(entityForPath(base+'articles/Ch%C6%B0%C6%A1ng/',base)).toEqual(entityForPath(base+'en/articles/Chương',base));
  });
  it('dry plan rejects unmatched routes/identities/text instead of losing records',()=>{
    expect(()=>planCommentsImport({paths:[base+'guestbook/'],archives:[legacy],base,sourceCommit:'x'})).toThrow('Unregistered');
    expect(()=>planCommentsImport({paths:[base+'music/'],archives:[legacy,legacy],base,sourceCommit:'x'})).toThrow('Duplicate');
    expect(()=>planCommentsImport({paths:[base+'music/'],archives:[{...legacy,message:'x'.repeat(4001)}],base,sourceCommit:'x'})).toThrow('without loss');
    expect(()=>planCommentsImport({paths:[base+'guestbook/'],archives:[{...legacy,deleted:true,contextPath:undefined,body:''}],base,sourceCommit:'x'})).toThrow('explicit retained context');
  });
  it('imports then reruns idempotently and shadow-compares public visibility with RLS',async()=>{
    const p=plan(); expect((await applyCommentsPlan(db,p)).changed).toBe(5);
    expect((await applyCommentsPlan(db,p)).changed).toBe(0);
    expect(await reconcileComments(db,p)).toEqual({publicRecords:2,matches:true});
    expect((await db.query<{n:number}>('select count(*)::int as n from public.comment_revisions')).rows[0]?.n).toBe(5);
    expect((await db.query('select distinct author_id from public.comments')).rows).toEqual([{author_id:null}]);
    expect((await db.query('select * from public.role_assignments')).rows).toEqual([]);
  });
  it('null legacy ownership cannot be claimed by matching metadata or forged direct RPC',async()=>{
    await db.exec("update private.backend_settings set comments_source='api',comments_epoch=1,comments_writes_enabled=true; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[A]);
    try {
      await expect(db.query('select public.edit_comment($1,$2,1)',[plan().records[0]!.id,'forged'])).rejects.toMatchObject({code:'PT403'});
      await expect(db.query('select public.delete_comment($1,1)',[plan().records[0]!.id])).rejects.toMatchObject({code:'PT403'});
    }finally{await db.exec('reset role');}
  });
  it('refuses imports once API is the active source',async()=>{
    await expect(applyCommentsPlan(db,plan())).rejects.toThrow('frozen Git source');
    expect((await db.query<{n:number}>('select count(*)::int as n from public.comments')).rows[0]?.n).toBe(5);
  });
});
