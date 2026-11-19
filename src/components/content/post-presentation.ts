import type { BackendRuntime } from '../../lib/auth/runtime';
import { postSocial } from '../../../supabase/functions/_shared/post-social';
export function renderPostDetails(target:HTMLElement,payload:Record<string,unknown>,vi:boolean){
 if(!payload.social)return;
 try{const p=postSocial(payload.social);const parts=[];
  if(p.people.length)parts.push(`${vi?'Cùng':'With'} ${p.people.join(', ')}`);
  if(p.location)parts.push(`📍 ${p.location}`);
  const feeling:Record<string,string>={happy:vi?'vui vẻ':'happy',grateful:vi?'biết ơn':'grateful',loved:vi?'yêu thương':'loved',excited:vi?'hào hứng':'excited',thoughtful:vi?'suy tư':'thoughtful',sad:vi?'buồn':'sad'};
  if(p.feeling)parts.push(`☺ ${feeling[p.feeling]}`);
  if(parts.length){const text=document.createElement('p');text.className='post-social-details';text.textContent=parts.join(' · ');target.append(text);}
 }catch{}
}
export function renderPostImages(target:HTMLElement,payload:Record<string,unknown>,runtime:Pick<BackendRuntime,'api'>,vi:boolean){
 const urls:string[]=[];let live=true;
 const cleanup=()=>{live=false;observer?.disconnect();urls.forEach(url=>URL.revokeObjectURL(url));};
 let observer:IntersectionObserver|null=null;
 let paths:string[]=[];try{if(payload.social)paths=postSocial(payload.social).images;}catch{}
 if(!paths.length)return cleanup;
 const gallery=document.createElement('div');gallery.className='post-photo-grid';gallery.dataset.count=String(paths.length);target.append(gallery);
 const loaders=new Map<Element,()=>void>();
 if(typeof IntersectionObserver!=='undefined')observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer!.unobserve(e.target);loaders.get(e.target)?.();}}, {rootMargin:'300px'});
 paths.forEach((path,index)=>{
  const frame=document.createElement('div');frame.className='post-photo';gallery.append(frame);
  const load=async()=>{frame.textContent=vi?'Đang tải ảnh…':'Loading photo…';try{const blob=await runtime.api.postImages.read(path);if(!live)return;const url=URL.createObjectURL(blob);urls.push(url);const a=document.createElement('a'),img=document.createElement('img');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('data-astro-reload','');a.setAttribute('aria-label',vi?'Mở ảnh đầy đủ':'Open full photo');img.src=url;img.alt=vi?`Ảnh đính kèm ${index+1}`:`Attached photo ${index+1}`;img.decoding='async';a.append(img);frame.replaceChildren(a);}catch{if(!live)return;const retry=document.createElement('button');retry.type='button';retry.textContent=vi?'Thử tải lại ảnh':'Retry photo';retry.addEventListener('click',()=>void load());frame.replaceChildren(retry);}};
  loaders.set(frame,()=>void load());if(observer)observer.observe(frame);else void load();
 });return cleanup;
}
