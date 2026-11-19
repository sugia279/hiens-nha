import { beforeAll,afterAll,it,expect } from 'vitest';
import { testDatabase } from './helpers/database';
const member='10000000-0000-0000-0000-000000000001',owner='10000000-0000-0000-0000-000000000003';
let db:Awaited<ReturnType<typeof testDatabase>>;
const profile={images:['/hiens-nha/example.webp'],avatarUrl:'/hiens-nha/avatar.png',frame:'rounded',leadVi:'Lời dẫn',leadEn:'Headline',introVi:'Giới thiệu',introEn:'Introduction'};
async function as(id:string|null,sql:string,args:unknown[]=[]){await db.exec(`set role ${id?'authenticated':'anon'}`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);try{return (await db.query<{data:any}>(sql,args)).rows[0]?.data;}finally{await db.exec('reset role');}}
const read=()=>as(null,'select public.home_profile_read() as data');
const save=(id:string|null,value:unknown,version:number)=>as(id,'select public.home_profile_save($1::jsonb,$2) as data',[JSON.stringify(value),version]);
beforeAll(async()=>{db=await testDatabase();for(const id of [member,owner])await db.query('insert into auth.users values($1,\'{}\')',[id]);await db.query("insert into public.role_assignments(user_id,role) values($1,'owner')",[owner]);},30000);
afterAll(async()=>{await db.close();});
it('exposes only public profile via invoker RPC and denies private tables',async()=>{
 expect(await read()).toEqual({version:0,value:null});
 await expect(as(member,'select * from private.home_profile')).rejects.toMatchObject({code:'42501'});
 await expect(save(null,profile,0)).rejects.toMatchObject({code:'42501'});
 await expect(save(member,profile,0)).rejects.toMatchObject({code:'PT403'});
});
it('enforces owner version binding and immutable audit history',async()=>{
 expect(await save(owner,profile,0)).toEqual({version:1,value:profile});
 await expect(save(owner,{...profile,frame:'square'},0)).rejects.toMatchObject({code:'PT409'});
 expect(await read()).toEqual({version:1,value:profile});
 expect((await db.query('select count(*)::int as n from private.home_profile_audit')).rows[0]).toEqual({n:1});
});
it('rejects executable schemes, missing text, unknown styles and too many images',async()=>{
 for(const value of [{...profile,images:['javascript:alert(1)']},{...profile,avatarUrl:'data:image/svg+xml,bad'},{...profile,frame:'evil'},{...profile,images:Array(5).fill('/image.png')},{...profile,leadVi:null},{...profile,extra:'bad'}])await expect(save(owner,value,1)).rejects.toMatchObject({code:'PT422'});
 expect((await read()).version).toBe(1);
});
