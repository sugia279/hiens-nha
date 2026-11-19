import type { BackendRuntime } from '../../lib/auth/runtime';
import '../site/cover-layout.css';
import { mediaReferences, type MediaReference, postSocial } from '../../../supabase/functions/_shared/post-social';
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
 let paths:MediaReference[]=[];let layout='auto',frameStyle='rounded';try{if(payload.social){const social=postSocial(payload.social);paths=mediaReferences(social);layout=social.layout??'auto';frameStyle=social.frame??'rounded';}}catch{}
 if(!paths.length)return cleanup;
 const gallery=document.createElement('div');gallery.className='post-photo-grid profile-photo-grid';gallery.dataset.count=String(paths.length);gallery.dataset.photoCount=String(paths.length);gallery.dataset.layout=layout;gallery.dataset.frame=frameStyle;target.append(gallery);
 const loaders=new Map<Element,()=>void>();
 if(typeof IntersectionObserver!=='undefined')observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer!.unobserve(e.target);loaders.get(e.target)?.();}}, {rootMargin:'300px'});
 paths.forEach((ref,index)=>{
  const frame=document.createElement('div');frame.className='post-photo preview-photo';gallery.append(frame);
  const load=async()=>{frame.textContent=vi?'Đang tải ảnh…':'Loading photo…';try{const blob=ref.resourceId==='primary-images'?await runtime.api.postImages.read(ref.path):await runtime.api.postMedia.read(ref);if(!live)return;const url=URL.createObjectURL(blob);urls.push(url);if(ref.kind==='video'){const video=document.createElement('video');video.src=url;video.controls=true;video.playsInline=true;video.preload='metadata';video.setAttribute('aria-label',vi?`Video đính kèm ${index+1}`:`Attached video ${index+1}`);frame.replaceChildren(video);return;}const a=document.createElement('a'),img=document.createElement('img');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('data-astro-reload','');a.setAttribute('aria-label',vi?'Mở ảnh đầy đủ':'Open full photo');img.src=url;img.alt=vi?`Ảnh đính kèm ${index+1}`:`Attached photo ${index+1}`;img.decoding='async';a.append(img);frame.replaceChildren(a);}catch{if(!live)return;const retry=document.createElement('button');retry.type='button';retry.textContent=vi?'Thử tải lại ảnh':'Retry photo';retry.addEventListener('click',()=>void load());frame.replaceChildren(retry);}};
  loaders.set(frame,()=>void load());if(observer)observer.observe(frame);else void load();
 });return cleanup;
}
