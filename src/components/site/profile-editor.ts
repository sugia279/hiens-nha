import { getBackendRuntime } from '../../lib/auth/runtime';
import { onPageMount } from '../../lib/page-lifecycle';
import { homeProfile, type HomeProfile } from '../../lib/home-profile';
import { ApiError } from '../../../supabase/functions/_shared/contracts';
onPageMount(page => {
 const root=document.querySelector<HTMLElement>('[data-home-profile]');if(!root)return;
 const vi=root.dataset.locale==='vi', copy=(a:string,b:string)=>vi?a:b;
 const runtime=getBackendRuntime(), dialog=root.querySelector<HTMLDialogElement>('dialog')!, form=root.querySelector<HTMLFormElement>('form')!, edit=root.querySelector<HTMLButtonElement>('[data-edit-profile]')!;
 const status=root.querySelector<HTMLElement>('[data-profile-status]')!, message=form.querySelector<HTMLElement>('[data-dialog-status]')!;
 let value=homeProfile(JSON.parse(root.dataset.defaults!)),version=0,ready=false,saving=false;
 const field=(name:string)=>form.elements.namedItem(name) as HTMLInputElement;
 function readForm(){return homeProfile({images:[0,1,2,3].map(i=>field(`image${i}`).value.trim()).filter(Boolean),avatarUrl:field('avatarUrl').value.trim(),frame:field('frame').value,leadVi:field('leadVi').value,leadEn:field('leadEn').value,introVi:field('introVi').value,introEn:field('introEn').value});}
 function apply(p:HomeProfile){
  const gallery=root!.querySelector<HTMLElement>('.home-photos')!;
  gallery.dataset.photoCount=String(p.images.length);root!.dataset.frame=p.frame;
  gallery.replaceChildren(...p.images.map((url,i)=>{
   const a=document.createElement('a');a.className='photo-open';a.href=url;a.dataset.profilePhoto='true';a.setAttribute('data-astro-reload','');a.dataset.photoFull=url;a.dataset.photoTitle=copy(`Ảnh bìa ${i+1}`,`Cover photo ${i+1}`);a.dataset.photoDescription='';a.setAttribute('aria-label',a.dataset.photoTitle);
   const img=document.createElement('img');img.src=url;img.alt=a.dataset.photoTitle;img.loading=i?'lazy':'eager';img.decoding='async';a.append(img);return a;
  }));
  for(const img of document.querySelectorAll<HTMLImageElement>('[data-profile-avatar],[data-shared-avatar]'))img.src=p.avatarUrl;
  root!.querySelector('[data-profile-lead]')!.textContent=vi?p.leadVi:p.leadEn;
  root!.querySelector('[data-profile-intro]')!.textContent=vi?p.introVi:p.introEn;
 }
 function preview(){try {
  const p=readForm(),target=form.querySelector('[data-profile-preview]')!;target.replaceChildren();
  const images=document.createElement('div');images.className='preview-images';images.style.borderRadius=p.frame==='rounded'?'1rem':'0';
  for(const url of p.images){const img=document.createElement('img');img.src=url;img.alt=copy('Xem trước ảnh','Photo preview');if(p.frame==='polaroid')img.style.border='5px solid white';images.append(img);}
  const text=document.createElement('p');text.textContent=vi?p.leadVi:p.leadEn;target.append(images,text);
 }catch{}}
 page.cleanup(runtime.subscribe(({user,busy})=>{
  edit.hidden=user?.role!=='owner';edit.disabled=busy||!ready||saving;
  if(user?.role!=='owner'&&dialog.open&&!saving)dialog.close();
 }));
 edit.addEventListener('click',()=>{
  if(!ready||runtime.current().user?.role!=='owner')return;
  for(const key of ['avatarUrl','frame','leadVi','leadEn','introVi','introEn'] as const)field(key).value=value[key];
  [0,1,2,3].forEach(i=>field(`image${i}`).value=value.images[i]??'');message.textContent='';preview();dialog.showModal();
 },{signal:page.signal});
 form.addEventListener('input',preview,{signal:page.signal});
 form.querySelector('[data-profile-cancel]')!.addEventListener('click',()=>{if(!saving)dialog.close();},{signal:page.signal});
 dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault();},{signal:page.signal});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(saving||runtime.current().user?.role!=='owner')return;
  const actor=runtime.current().user!.id;
  try{
   const next=readForm();saving=true;form.inert=true;edit.disabled=true;
   message.textContent=copy('Đang lưu…','Saving…');
   const saved=await runtime.api.saveHomeProfile(next,version);
   if(page.signal.aborted)return;
   version=saved.version;value=homeProfile(saved.value);apply(value);
   if(runtime.current().user?.id===actor)dialog.close();
   status.textContent=copy('Đã cập nhật ảnh và lời dẫn.','Photos and introduction updated.');
  }catch(error){if(!page.signal.aborted)message.textContent=error instanceof ApiError&&error.status===409?copy('Cấu hình đã đổi ở nơi khác. Đóng và tải lại trang trước khi lưu.','Profile changed elsewhere. Close and reload before saving.'):copy('Chưa lưu được. Kiểm tra ảnh, độ dài lời dẫn và phiên owner rồi thử lại.','Could not save. Check images, text lengths and owner session.');}
  finally{saving=false;form.inert=false;edit.disabled=!ready;if(runtime.current().user?.role!=='owner'&&dialog.open)dialog.close();}
 },{signal:page.signal});
 void runtime.api.homeProfile().then(saved=>{
  if(page.signal.aborted)return;version=saved.version;if(saved.value){value=homeProfile(saved.value);apply(value);}ready=true;edit.disabled=runtime.current().busy;
 }).catch(()=>{if(!page.signal.aborted)status.textContent=copy('Chưa tải được ảnh và lời dẫn mới nhất. Vui lòng tải lại trang.','Could not load the latest photos and introduction. Please reload.');});
});
