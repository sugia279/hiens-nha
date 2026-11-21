import {beforeAll,beforeEach,afterAll,it,expect} from 'vitest';
import {testDatabase} from './helpers/database';
const A='10000000-0000-0000-0000-000000000001';
let db:Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async()=>{db=await testDatabase();await db.query("insert into auth.users values($1,'{\"role\":\"owner\"}')",[A]);},30000);
beforeEach(async()=>{await db.exec('delete from private.read_windows');});
afterAll(async()=>{await db?.close();});
async function as(actor:string|null,sql:string,args:unknown[]=[]){
 await db.exec(`set role ${actor?'authenticated':'anon'}`);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor??'']);
 try{return(await db.query<any>(sql,args)).rows;}finally{await db.exec('reset role');}
}
const create=(label:string,scope='photos')=>as(A,'select public.content_category_create($1,$2) as item',[scope,label]).then(rows=>rows[0].item);
it('exposes only public vocabulary and permits no anonymous or direct-table writes',async()=>{
 const rows=await as(null,'select public.content_categories_read() as items');
 expect(rows[0].items).toHaveLength(8);
 expect(Object.keys(rows[0].items[0]).sort()).toEqual(['id','label','label_en','scope']);
 await expect(as(null,"select public.content_category_create('photos','No')")).rejects.toMatchObject({code:'42501'});
 await expect(as(A,'select * from private.content_categories')).rejects.toMatchObject({code:'42501'});
 await expect(as(A,"insert into private.content_categories(scope,label) values('photos','Direct')")).rejects.toMatchObject({code:'42501'});
});
it('deduplicates across Enter/blur/retries and English aliases; keeps each scope independent',async()=>{
 const a=await create('  Du lịch   hè  '),b=await create('DU LỊCH HÈ');
 expect(a.id).toBe(b.id);expect(a.label).toBe('Du lịch hè');
 expect((await create('Family')).id).toBe('family');
 expect((await create('Du lịch hè','posts')).id).not.toBe(a.id);
 expect((await as(A,'select public.caller_is_owner() as owner'))[0].owner).toBe(false);
});
it('validates direct RPC, counts shared admission and bounds category growth',async()=>{
 for(const [scope,label] of [['other','Label'],['photos',''],['photos','x'.repeat(41)],['photos','bad\nlabel']])await expect(create(label,scope)).rejects.toMatchObject({code:'PT422'});
 await db.exec("update private.read_budgets set max_per_second=1 where scope='member';delete from private.read_windows");
 await as(A,'select public.content_categories_read()');
 await db.exec("update private.read_windows set window_start=clock_timestamp()+interval '1 minute'");
 await expect(as(A,'select public.content_categories_read()')).rejects.toMatchObject({code:'PT429'});
 await db.exec("update private.read_budgets set max_per_second=240 where scope='member';delete from private.read_windows");
 await db.query("insert into private.content_categories(id,scope,label) select 'fixture-'||i,'media','Fixture '||i from generate_series(1,98) i");
 await expect(create('Over limit','media')).rejects.toMatchObject({code:'PT429'});
});
it('limits successful creations per actor even when the scope changes',async()=>{
 await db.exec("update private.content_categories set created_at=now()-interval '2 minute' where created_by is not null");
 for(let i=0;i<10;i++)await create('Rate '+i,i%2?'photos':'posts');
 await expect(create('Rate overflow','posts')).rejects.toMatchObject({code:'PT429'});
 expect((await create('Rate 0','posts')).label).toBe('Rate 0');
});
