import { postMediaFor, preparePostVideo } from '../../lib/api/post-media';
import type { BackendRuntime } from '../../lib/auth/runtime';
import type { Publication } from '../../../supabase/functions/_shared/features';
import { featurePayload } from '../../../supabase/functions/_shared/features';
import { mediaReferences, validMediaLayout, type MediaReference, postSocial, type PostSocial } from '../../../supabase/functions/_shared/post-social';
import { preparePostImage } from '../../lib/api/post-images';
import { ApiError } from '../../../supabase/functions/_shared/contracts';
import { categoryCatalogue } from '../../lib/category-catalogue';
import { categoryTags, categoryLabel, findCategory } from '../../lib/content-categories';
export function mountSocialComposer(root:HTMLElement,runtime:Pick<BackendRuntime,'api'|'current'|'subscribe'>){
 const vi=root.dataset.locale==='vi',copy=(a:string,b:string)=>vi?a:b;
 const dialog=root.querySelector<HTMLDialogElement>('[data-status-dialog]')!,form=root.querySelector<HTMLFormElement>('form')!,thought=root.querySelector<HTMLTextAreaElement>('[data-home-thought]')!;
 const status=root.querySelector<HTMLElement>('[data-status-message]')!,photos=root.querySelector<HTMLElement>('[data-status-photos]')!,submit=form.querySelector<HTMLButtonElement>('[type="submit"]')!,files=root.querySelector<HTMLInputElement>('[data-status-files]')!;
 const field=(name:string)=>form.elements.namedItem(name) as HTMLInputElement;
 const events=new AbortController(),signal=events.signal;
 let row:Publication|null=null,lastSaved='',dirty=false,busy=false,uploading=false,loadFailed=false,live=true,generation=0;
 let images:(MediaReference&{url:string})[]=[];
 let previousOverflow:string|null=null;
 const unlock=()=>{if(previousOverflow!==null){document.body.style.overflow=previousOverflow;previousOverflow=null;}};
 const keys=new Map<string,string>();
 const key=(signature:string)=>{if(!keys.has(signature))keys.set(signature,crypto.randomUUID());return keys.get(signature)!;};
 const tell=(text:string)=>{status.textContent=text;};
 function controls(){submit.disabled=loadFailed||busy||uploading||!field('body').value.trim()||runtime.current().user?.role!=='owner';submit.textContent=busy?copy('Đang lưu…','Saving…'):field('visibility').value==='hidden'?copy('Lưu ẩn','Save privately'):copy('Đăng bài','Post');form.inert=busy;dialog.setAttribute('aria-busy',String(busy||uploading));root.querySelector<HTMLButtonElement>('[data-status-library]')!.disabled=uploading||busy||images.length>=4;root.querySelector('[data-status-count]')!.textContent=`${field('body').value.length} / 12000`;}
 function revoke(){for(const image of images)URL.revokeObjectURL(image.url);images=[];photos.replaceChildren();}
 function drawPhotos(){photos.replaceChildren();images.forEach((image,index)=>{const figure=document.createElement('div'),img=document.createElement(image.kind==='video'?'video':'img'),remove=document.createElement('button');figure.className='preview-photo';img.src=image.url;if(img instanceof HTMLVideoElement){img.controls=true;img.preload='metadata';img.playsInline=true;img.setAttribute('aria-label',copy(`Video ${index+1}`,`Video ${index+1}`));}else img.alt=copy(`Ảnh đính kèm ${index+1}`,`Attached photo ${index+1}`);remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',copy(`Bỏ ảnh ${index+1}`,`Remove photo ${index+1}`));remove.addEventListener('click',()=>{images=images.filter(i=>i!==image);URL.revokeObjectURL(image.url);dirty=true;drawPhotos();controls();});figure.append(img,remove);photos.append(figure);});syncLayout();}
 function syncLayout(){const layout=field('layout');for(const option of form.querySelectorAll<HTMLOptionElement>('[data-status-layout] option')){const count=Number(option.dataset.count);option.disabled=count!==0&&count!==images.length;option.hidden=option.disabled;}if(!validMediaLayout(layout.value,images.length))layout.value='auto';photos.dataset.layout=layout.value;photos.dataset.frame=field('frame').value;photos.dataset.photoCount=String(images.length);root.querySelector<HTMLElement>('[data-media-empty]')!.hidden=images.length>0;}
 function reset(){row=null;lastSaved='';dirty=false;loadFailed=false;keys.clear();form.reset();revoke();syncLayout();tell('');root.querySelectorAll<HTMLElement>('[data-social-field]').forEach(el=>el.hidden=true);root.querySelectorAll('[data-social-toggle]').forEach(el=>el.setAttribute('aria-expanded','false'));controls();}
 function open(){if(runtime.current().user?.role!=='owner')return;if(!dialog.open){previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';dialog.showModal();}field('body').focus();}
 function social():PostSocial{return postSocial({people:field('people').value.split(',').map(p=>p.trim()).filter(Boolean),location:field('location').value,feeling:field('feeling').value,images:images.filter(i=>i.resourceId==='primary-images').map(i=>i.path),media:images.filter(i=>i.resourceId!=='primary-images').map(({resourceId,path,kind})=>({resourceId,path,kind})),layout:field('layout').value,frame:field('frame').value});}
 function payload(){
  const text=field('body').value.trim(),title=Array.from(text.split('\n')[0]!).slice(0,60).join('');
  const legacyCategory=field('category')?.value===row?.payload.category && field('category').value.length>40;
  const category=legacyCategory ? String(row!.payload.category) : field('category') ? findCategory(categoryCatalogue(runtime).items(),'posts',field('category').value)?.label ?? categoryLabel(field('category').value) : String(row?.payload.category??'Chia sẻ');
  let tags=legacyCategory ? (row!.payload.tags as string[]) : categoryTags(row?.payload.tags??['chia-se'],category);
  if(images.length&&field('attachmentAlbum')) tags=categoryTags(tags,field('attachmentAlbum').value);
  return featurePayload('posts',{title:row?.payload.title??(title.length>=3?title:copy('Chia sẻ của Hiển','A note from Hien')),body:text,kind:row?.payload.kind??'note',category,tags,series:row?.payload.series??'',order:row?.payload.order??1,social:social()});
 }
 for(const toggle of root.querySelectorAll<HTMLButtonElement>('[data-social-toggle]')){toggle.setAttribute('aria-expanded','false');toggle.addEventListener('click',()=>{const label=root.querySelector<HTMLElement>(`[data-social-field="${toggle.dataset.socialToggle}"]`)!;label.hidden=!label.hidden;toggle.setAttribute('aria-expanded',String(!label.hidden));if(!label.hidden)label.querySelector<HTMLInputElement>('input,select')?.focus();},{signal});}
 thought.addEventListener('click',open,{signal});thought.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}},{signal});
 root.querySelector('[data-status-close]')!.addEventListener('click',()=>{if(!busy&&!uploading)dialog.close();},{signal});
 dialog.addEventListener('close',unlock,{signal});
 dialog.addEventListener('cancel',event=>{if(busy||uploading)event.preventDefault();},{signal});
 form.addEventListener('input',()=>{dirty=true;controls();},{signal});form.addEventListener('change',()=>{dirty=true;syncLayout();controls();},{signal});
 root.querySelector('[data-status-library]')!.addEventListener('click',()=>files.click(),{signal});
 files.addEventListener('change',async()=>{
  const selected=[...(files.files??[])];files.value='';if(!selected.length)return;
  if(selected.length+images.length>4){tell(copy('Mỗi bài tối đa 4 ảnh/video.','Choose at most four attachments per post.'));return;}
  const actor=runtime.current().user;if(actor?.role!=='owner')return;
  const tag=generation;uploading=true;controls();tell(copy('Đang chuẩn bị và tải ảnh/video…','Preparing and uploading media…'));
  try{
   for(const file of selected){const blob=await (file.type.startsWith('video/')?preparePostVideo(file):preparePostImage(file));if(!live||tag!==generation||runtime.current().user?.id!==actor.id)return;
    const ref=await postMediaFor(runtime.api).upload(actor.id,blob);
    if(!live||tag!==generation||runtime.current().user?.id!==actor.id)return;
    images.push({...ref,url:URL.createObjectURL(blob)});dirty=true;drawPhotos();
   }
   tell(copy('Ảnh/video đã sẵn sàng. Chọn người xem rồi đăng bài.','Media is ready. Choose an audience and post.'));
  }catch{if(live&&tag===generation)tell(copy('Chưa tải được. Chọn ảnh JPEG/PNG/WebP dưới 12 MB hoặc video MP4/WebM dưới 20 MB rồi thử lại.','Could not upload. Choose JPEG/PNG/WebP under 12 MB or MP4/WebM under 20 MB and retry.'));}
  finally{uploading=false;if(live)controls();}
 },{signal});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy||uploading||runtime.current().user?.role!=='owner')return;
  const actor=runtime.current().user!.id,tag=generation,valid=()=>live&&tag===generation&&runtime.current().user?.id===actor&&runtime.current().user?.role==='owner';
  busy=true;controls();
  try{
   const state=await runtime.api.featureState('posts');if(!valid())return;
   if(state.source!=='api'||state.epoch!==Number(root.dataset.epoch)||!state.writes_enabled){tell(copy('Chức năng đăng bài đang bảo trì.','Posting is in maintenance.'));return;}
   if(field('category') && field('category').value!==row?.payload.category) await categoryCatalogue(runtime).ensure('posts',field('category').value);
   if(images.length&&field('attachmentAlbum')) await categoryCatalogue(runtime).ensure('photos',field('attachmentAlbum').value);
   if(!valid())return;
   const normalized=payload(),signature=JSON.stringify(normalized),visibility=field('visibility').value;
   busy=true;controls();tell(copy('Đang lưu bài viết…','Saving your post…'));
   if(!row||signature!==lastSaved){const saved=await runtime.api.savePublication('posts',normalized,key(`save:${row?.id??'new'}:${row?.version??0}:${signature}`),row);if(!valid())return;row=saved;lastSaved=signature;}
   if(visibility==='hidden'){
    if(row!.published_revision){const saved=await runtime.api.publicationAction('posts',row!.id,'unpublish',{expectedVersion:row!.version,reason:'Owner selected Only me'},key(`hide:${row!.id}:${row!.version}`));if(!valid())return;row=saved;}
   }else{
    if(row!.status==='approved'&&row!.published_revision!==row!.revision){const saved=await runtime.api.savePublication('posts',normalized,key(`republish:${row!.id}:${row!.version}`),row);if(!valid())return;row=saved;}
    if(row!.status!=='approved'||row!.published_revision!==row!.revision){
     if(row!.status!=='pending'){const saved=await runtime.api.publicationAction('posts',row!.id,'submit',{expectedVersion:row!.version},key(`submit:${row!.id}:${row!.version}`));if(!valid())return;row=saved;}
     const saved=await runtime.api.publicationAction('posts',row!.id,'moderate',{expectedVersion:row!.version,revision:row!.revision,decision:'approve',reason:'Owner published status from Home'},key(`approve:${row!.id}:${row!.version}`));if(!valid())return;row=saved;
    }
   }
   if(!valid())return;dirty=false;dialog.close();reset();window.dispatchEvent(new Event('home-publication-published'));
  }catch(error){if(valid())tell(error instanceof ApiError&&error.status===409?copy('Bài đã đổi ở nơi khác. Nội dung đang soạn được giữ; mở lại bản mới trước khi lưu.','Post changed elsewhere. Draft kept; reopen the latest revision before saving.'):copy('Chưa lưu được. Nội dung đang soạn được giữ, anh có thể thử lại.','Could not save. Your text is kept; please retry.'));}
  finally{busy=false;if(live)controls();}
 },{signal});
 const edit=async(event:Event)=>{
  if(runtime.current().user?.role!=='owner'||busy||uploading)return;
  const id=(event as CustomEvent<{id:string}>).detail?.id;if(!id)return;
  if(dirty&&!window.confirm(copy('Bỏ bản đang soạn để sửa bài này?','Discard the current text to edit this post?')))return;
  const tag=++generation;reset();busy=true;controls();
  try{
   const saved=await runtime.api.publication('posts',id,true);if(!live||tag!==generation||runtime.current().user?.id!==saved.author_id)return;
   row=saved;field('body').value=String(saved.payload.body);field('visibility').value=saved.published_revision?'public':'hidden';
   if(field('category')){field('category').value=String(saved.payload.category);field('category').maxLength=Math.max(40,field('category').value.length);}
   if(field('attachmentAlbum'))field('attachmentAlbum').value=categoryCatalogue(runtime).items().find(c=>c.scope==='photos'&&Array.isArray(saved.payload.tags)&&saved.payload.tags.includes(c.label))?.label??'Gia Đình';
   const details=saved.payload.social?postSocial(saved.payload.social):{people:[],location:'',feeling:'',images:[]};field('people').value=details.people.join(', ');field('location').value=details.location;field('feeling').value=details.feeling;
   field('layout').value=details.layout??'auto';field('frame').value=details.frame??'rounded';
   for(const name of ['people','location','feeling'])if(field(name).value){root.querySelector<HTMLElement>(`[data-social-field="${name}"]`)!.hidden=false;root.querySelector(`[data-social-toggle="${name}"]`)!.setAttribute('aria-expanded','true');}
   open();
   for(const ref of mediaReferences(details)){const blob=ref.resourceId==='primary-images'?await runtime.api.postImages.read(ref.path):await postMediaFor(runtime.api).read(ref);if(!live||tag!==generation)return;images.push({...ref,url:URL.createObjectURL(blob)});}
   lastSaved=JSON.stringify(payload());drawPhotos();controls();
  }catch{if(live&&tag===generation){open();tell(copy('Chưa tải được đầy đủ bài và ảnh. Đóng và mở lại bài từ bảng tin trước khi sửa.','Could not load the full post and photos. Close and reopen it from the feed before editing.'));loadFailed=true;}}
  finally{busy=false;if(live)controls();}
 };
 window.addEventListener('home-post-edit',edit,{signal});
 window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}},{signal});
 let identity:string|null=null;
 const unsubscribe=runtime.subscribe(({user})=>{thought.disabled=user?.role!=='owner';root.querySelector<HTMLElement>('[data-composer-note]')!.hidden=user?.role==='owner';const id=user?.role==='owner'?user.id:null;if(identity!==id){identity=id;generation++;reset();if(dialog.open)dialog.close();}controls();});
 return()=>{live=false;generation++;events.abort();unsubscribe();revoke();if(dialog.open)dialog.close();unlock();};
}
