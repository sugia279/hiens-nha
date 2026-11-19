import {beforeAll,afterAll,it,expect} from 'vitest';
import {testDatabase} from './helpers/database';
import {featurePayload} from '../../supabase/functions/_shared/features';
const owner='10000000-0000-0000-0000-000000000003',member='10000000-0000-0000-0000-000000000001';
const path=owner+'/20000000-0000-0000-0000-000000000001.webp';
let db:Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async()=>{db=await testDatabase();for(const id of [owner,member])await db.query("insert into auth.users values($1,'{}')",[id]);await db.query("insert into public.role_assignments values($1,'owner')",[owner]);await db.exec("update private.feature_controls set source='api',epoch=1,writes_enabled=true");},30000);
afterAll(async()=>{await db.close();});
async function as(actor:string|null,sql:string,args:unknown[]=[]){await db.exec(`set role ${actor?'authenticated':'anon'}`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor??'']);try{return(await db.query<{data:any}>(sql,args)).rows;}finally{await db.exec('reset role');}}
async function write(actor:string,action:string,id:string|null=null,version:number|null=null,payload:unknown=null,revision:number|null=null,key=crypto.randomUUID()){
 return(await as(actor,'select public.publication_write(p_feature=>\'posts\',p_action=>$1,p_id=>$2,p_payload=>$3::jsonb,p_expected_version=>$4,p_key=>$5,p_revision=>$6,p_reason=>\'Fixture\') as data',[action,id,JSON.stringify(payload),version,key,revision]))[0]!.data;
}
const social={people:['Hương'],location:'Đà Lạt',feeling:'grateful',images:[path]};
const post={title:'A status post',body:'Safe text <img src=x>',kind:'note',category:'Chia sẻ',tags:['chia-se'],series:'',order:1,social};
it('validates bounded inert details in the Edge normalizer',()=>{
 expect(featurePayload('posts',post).social).toEqual(social);
 for(const details of [{...social,images:['https://evil.test/x']},{...social,people:['x'.repeat(61)]},{...social,feeling:'<script>'},{...social,images:Array(5).fill(path)},{...social,owner:true}])expect(()=>featurePayload('posts',{...post,social:details})).toThrow();
});
it('restricts uploads to owner paths and gates private bytes by the exact public revision',async()=>{
 for(const actor of [null,member])await expect(as(actor,'insert into storage.objects(bucket_id,name) values(\'post-images\',$1)',[path])).rejects.toMatchObject({code:'42501'});
 await expect(as(owner,'insert into storage.objects(bucket_id,name) values(\'post-images\',$1)',[member+'/20000000-0000-0000-0000-000000000001.webp'])).rejects.toMatchObject({code:'42501'});
 await as(owner,'insert into storage.objects(bucket_id,name) values(\'post-images\',$1)',[path]);
 await expect(write(member,'create',null,null,post)).rejects.toMatchObject({code:'PT403'});
 const key=crypto.randomUUID();let row=await write(owner,'create',null,null,post,null,key);
 expect((await write(owner,'create',null,null,post,null,key)).id).toBe(row.id);
 await expect(write(owner,'create',null,null,{...post,social:{...social,location:'Other'}},null,key)).rejects.toMatchObject({code:'PT409'});
 for(const actor of [null,member])expect(await as(actor,'select name from storage.objects')).toEqual([]);
 expect(await as(owner,'select name from storage.objects')).toHaveLength(1);
 row=await write(owner,'submit',row.id,row.version);row=await write(owner,'approve',row.id,row.version,null,row.revision);
 expect(await as(null,'select name from storage.objects')).toHaveLength(1);
 const publicPost=(await as(null,'select public.publication_read(p_feature=>\'posts\',p_id=>$1) as data',[row.id]))[0]!.data;
 expect(publicPost.payload.social).toEqual(social);
 const draftPath=owner+'/20000000-0000-0000-0000-000000000002.webp';await as(owner,'insert into storage.objects(bucket_id,name) values(\'post-images\',$1)',[draftPath]);
 row=await write(owner,'save',row.id,row.version,{...post,social:{...social,images:[draftPath],location:'PRIVATE LOCATION'}});
 expect((await as(null,'select name from storage.objects')).map((x:any)=>x.name)).toEqual([path]);
 const stillPublic=(await as(null,'select public.publication_read(p_feature=>\'posts\',p_id=>$1) as data',[row.id]))[0]!.data;expect(JSON.stringify(stillPublic)).not.toContain('PRIVATE LOCATION');
 row=await write(owner,'unpublish',row.id,row.version);expect(await as(null,'select name from storage.objects')).toEqual([]);
 expect((await as(owner,'delete from storage.objects where name=$1 returning name',[path]))).toHaveLength(0);
 const unused=owner+'/20000000-0000-0000-0000-000000000003.webp';await as(owner,'insert into storage.objects(bucket_id,name) values(\'post-images\',$1)',[unused]);expect(await as(owner,'delete from storage.objects where name=$1 returning name',[unused])).toHaveLength(1);
});
it('rejects forged paths and missing uploaded files via direct RPC',async()=>{
 for(const images of [[member+'/20000000-0000-0000-0000-000000000001.webp'],[owner+'/20000000-0000-0000-0000-000000000099.webp'],[path,path]])await expect(write(owner,'create',null,null,{...post,social:{...social,images}})).rejects.toMatchObject({code:'PT422'});
});
it('stores resource-qualified media, validates layout, and revokes video bytes on unpublish',async()=>{
 const videoPath=owner+'/30000000-0000-0000-0000-000000000001.webm';
 const media=[{resourceId:'primary-media',path:videoPath,kind:'video'}];
 const details={...social,images:[],media,layout:'single-landscape',frame:'rounded'};
 await as(owner,"insert into storage.objects(bucket_id,name,metadata) values('post-media',$1,'{\"size\":1000,\"mimetype\":\"video/webm\"}')",[videoPath]);
 const catalog=(await as(null,'select public.post_media_resources() as data'))[0]!.data;
 expect(catalog.find((r:any)=>r.id==='primary-media').writable).toBe(true);
 expect(JSON.stringify(catalog)).not.toContain('credential');
 await expect(as(member,"insert into storage.objects(bucket_id,name) values('post-media',$1)",[member+'/30000000-0000-0000-0000-000000000002.webm'])).rejects.toMatchObject({code:'42501'});
 await expect(as(owner,'select * from private.media_assets')).rejects.toMatchObject({code:'42501'});
 for(const extra of [{layout:'four-grid'},{frame:'evil'},{media:[{...media[0],resourceId:'unknown'}]},{media:[{...media[0],kind:'image'}]},{media:[media[0],media[0]]},{media:[{...media[0],path:member+'/30000000-0000-0000-0000-000000000001.webm'}]}]){
  await expect(write(owner,'create',null,null,{...post,social:{...details,...extra}})).rejects.toMatchObject({code:'PT422'});
 }
 expect(featurePayload('posts',{...post,social:details}).social).toEqual(details);
 let row=await write(owner,'create',null,null,{...post,social:details});
 expect((await db.query('select resource_id,kind,byte_size from private.media_assets where path=$1',[videoPath])).rows).toEqual([{resource_id:'primary-media',kind:'video',byte_size:1000}]);
 expect(await as(null,"select name from storage.objects where bucket_id='post-media'")).toEqual([]);
 row=await write(owner,'submit',row.id,row.version);row=await write(owner,'approve',row.id,row.version,null,row.revision);
 expect(await as(null,"select name from storage.objects where bucket_id='post-media'")).toHaveLength(1);
 const published=(await as(null,"select public.publication_read(p_feature=>'posts',p_id=>$1) as data",[row.id]))[0]!.data;
 expect(published.payload.social).toEqual(details);
 row=await write(owner,'unpublish',row.id,row.version);
 expect(await as(null,"select name from storage.objects where bucket_id='post-media'")).toEqual([]);
 expect(await as(owner,'delete from storage.objects where name=$1 returning name',[videoPath])).toEqual([]);
});
