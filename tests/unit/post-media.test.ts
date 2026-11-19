import {it,expect} from 'vitest';
import {preparePostVideo} from '../../src/lib/api/post-media';
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
