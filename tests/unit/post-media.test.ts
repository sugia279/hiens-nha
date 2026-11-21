import {it,expect} from 'vitest';
import {postMedia,preparePostVideo} from '../../src/lib/api/post-media';
import {postSocial,validMediaLayout} from '../../supabase/functions/_shared/post-social';
it('rejects unsupported, oversized and disguised videos before upload',async()=>{
 for(const file of [new File(['hello world bad'],'x.mp4',{type:'video/mp4'}),new File(['hello world bad'],'x.webm',{type:'video/webm'}),new File(['hello world bad'],'x.mov',{type:'video/quicktime'}),new File([new Uint8Array(20971521)],'x.mp4',{type:'video/mp4'})])await expect(preparePostVideo(file)).rejects.toThrow();
 const webm=new File([new Uint8Array([0x1a,0x45,0xdf,0xa3,0,0,0,0,0,0,0,0])],'x.webm',{type:'video/webm'});expect(await preparePostVideo(webm)).toBe(webm);
});
it('does not accept a non-auto frame for an empty gallery or duplicate resource paths',()=>{
 expect(validMediaLayout('single-square',0)).toBe(false);expect(validMediaLayout('auto',0)).toBe(true);
 const ref={resourceId:'primary-media',path:'10000000-0000-0000-0000-000000000003/20000000-0000-0000-0000-000000000001.webp',kind:'image'};
 expect(()=>postSocial({people:[],location:'',feeling:'',images:[],media:[ref,ref]})).toThrow();
});
it('accepts iPhone QuickTime and infers MOV MIME when a picker omits it',async()=>{
 const bytes=new Uint8Array(16);bytes.set([0x66,0x74,0x79,0x70],4);
 expect((await preparePostVideo(new File([bytes],'IMG_001.MOV',{type:'video/quicktime'}))).type).toBe('video/quicktime');
 expect((await preparePostVideo(new File([bytes],'IMG_001.MOV'))).type).toBe('video/quicktime');
});

it('enforces the 50 MiB video boundary and retains JPEG MIME and suffix in transport',async()=>{
 const bytes=new Uint8Array(16);bytes.set([0x66,0x74,0x79,0x70],4);
 const file=new File([bytes],'IMG.MOV',{type:'video/quicktime'});Object.defineProperty(file,'size',{value:52428800,configurable:true});expect(await preparePostVideo(file)).toBe(file);
 Object.defineProperty(file,'size',{value:52428801});await expect(preparePostVideo(file)).rejects.toThrow();
 const requests:{url:string,type:string|null}[]=[];
 const fetcher=async(input:any,options:any)=>{const url=String(input);requests.push({url,type:new Headers(options.headers).get('Content-Type')});return url.endsWith('/post_media_resources')?new Response(JSON.stringify([{id:'primary-media',bucket:'post-media',writable:true,maxBytes:52428800}])):options.method==='POST'?new Response('{}'):new Response(new Blob(['jpeg'],{type:'image/jpeg'}));};
 const api=postMedia({supabaseUrl:'https://fixture.supabase.co',publishableKey:'sb_publishable_fixture'} as any,async()=>'token',fetcher as typeof fetch);
 const ref=await api.upload('10000000-0000-0000-0000-000000000003',new Blob(['jpeg'],{type:'image/jpeg'}));expect(ref.kind).toBe('image');expect(ref.path.endsWith('.jpg')).toBe(true);expect(requests[1]!.type).toBe('image/jpeg');expect((await api.read(ref)).type).toBe('image/jpeg');
});
