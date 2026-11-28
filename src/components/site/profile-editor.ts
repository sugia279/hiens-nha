import { getBackendRuntime } from '../../lib/auth/runtime';
import { onPageMount } from '../../lib/page-lifecycle';
import { homeProfile, type HomeProfile } from '../../lib/home-profile';
import { validCoverLayout } from '../../lib/cover-layout';
import { ApiError } from '../../../supabase/functions/_shared/contracts';
import { categoryCatalogue } from '../../lib/category-catalogue';
import { findCategory } from '../../lib/content-categories';
import { profileImageForBase } from '../../lib/profile-image';
onPageMount(page => {
 const root=document.querySelector<HTMLElement>('[data-home-profile]');if(!root)return;
 const vi=root.dataset.locale==='vi', copy=(a:string,b:string)=>vi?a:b;
 const imageUrl=(url:string)=>profileImageForBase(url,root.dataset.base!);
 const runtime=getBackendRuntime(), dialog=root.querySelector<HTMLDialogElement>('dialog')!, form=root.querySelector<HTMLFormElement>('form')!, edit=root.querySelector<HTMLButtonElement>('[data-edit-profile]')!;
 const status=root.querySelector<HTMLElement>('[data-profile-status]')!, message=form.querySelector<HTMLElement>('[data-dialog-status]')!;
 let value=homeProfile(JSON.parse(root.dataset.defaults!)),version=0,ready=false,saving=false;
 const field=(name:string)=>form.elements.namedItem(name) as HTMLInputElement;
 const imageOptions=Array.from(form.querySelectorAll<HTMLOptionElement>('#profile-images option'));
 field('coverAlbum')?.addEventListener('change',()=>{
  const album=findCategory(categoryCatalogue(runtime).items(),'photos',field('coverAlbum').value);
  form.querySelector('#profile-images')!.replaceChildren(...imageOptions.filter(option=>!option.dataset.photoAlbum||option.dataset.photoAlbum===album?.id));
 },{signal:page.signal});
 function readForm(){return homeProfile({images:[0,1,2,3].map(i=>field(`image${i}`).value.trim()).filter(Boolean),avatarUrl:field('avatarUrl').value.trim(),frame:field('frame').value,layout:field('layout').value,leadVi:field('leadVi').value,leadEn:field('leadEn').value,introVi:field('introVi').value,introEn:field('introEn').value});}
 function apply(p:HomeProfile){
  const gallery=root!.querySelector<HTMLElement>('.home-photos')!;
  gallery.dataset.photoCount=String(p.images.length);gallery.dataset.frame=p.frame;gallery.dataset.layout=p.layout??'auto';
  gallery.replaceChildren(...p.images.map((stored,i)=>{const url=imageUrl(stored);
   const a=document.createElement('a');a.className='photo-open';a.href=url;a.dataset.profilePhoto='true';a.setAttribute('data-astro-reload','');a.dataset.photoFull=url;a.dataset.photoTitle=copy(`Ảnh bìa ${i+1}`,`Cover photo ${i+1}`);a.dataset.photoDescription='';a.setAttribute('aria-label',a.dataset.photoTitle);
   const img=document.createElement('img');img.src=url;img.alt=a.dataset.photoTitle;img.loading=i?'lazy':'eager';img.decoding='async';a.append(img);return a;
  }));
  for(const img of document.querySelectorAll<HTMLImageElement>('[data-profile-avatar],[data-shared-avatar]'))img.src=imageUrl(p.avatarUrl);
  root!.querySelector('[data-profile-lead]')!.textContent=vi?p.leadVi:p.leadEn;
  root!.querySelector('[data-profile-intro]')!.textContent=vi?p.introVi:p.introEn;
 }
 function syncLayouts(announce=false){
  const count=[0,1,2,3].filter(i=>field(`image${i}`).value.trim()).length;
  const select=field('layout') as unknown as HTMLSelectElement;
  for(const option of select.options)option.disabled=option.dataset.count!=='0'&&Number(option.dataset.count)!==count;
  if(!validCoverLayout(select.value,count)){
   select.value='auto';
   if(announce)form.querySelector('[data-layout-status]')!.textContent=copy('Đã chuyển sang khung tự động cho số ảnh mới.','Switched to automatic layout for the new photo count.');
  }
 }
 function preview(){
  const target=form.querySelector('[data-profile-preview]')!;
  try {
   const p=readForm();target.replaceChildren();
   const images=document.createElement('div');images.className='profile-photo-grid';
   images.dataset.layout=p.layout??'auto';images.dataset.frame=p.frame;images.dataset.photoCount=String(p.images.length);
   for(const url of p.images){const cell=document.createElement('div');cell.className='preview-photo';const img=document.createElement('img');img.src=imageUrl(url);img.alt=copy('Xem trước ảnh','Photo preview');cell.append(img);images.append(cell);}
   const text=document.createElement('p');text.textContent=vi?p.leadVi:p.leadEn;target.append(images,text);
  }catch{target.textContent=copy('Chọn 1–4 URL ảnh hợp lệ để xem trước.','Choose 1–4 valid image URLs to preview.');}
 }
 page.cleanup(runtime.subscribe(({user,busy})=>{
  edit.hidden=user?.role!=='owner';edit.disabled=busy||!ready||saving;
  if(user?.role!=='owner'&&dialog.open&&!saving)dialog.close();
 }));
 edit.addEventListener('click',()=>{
  if(!ready||runtime.current().user?.role!=='owner')return;
  for(const key of ['avatarUrl','frame','leadVi','leadEn','introVi','introEn'] as const)field(key).value=value[key];
  [0,1,2,3].forEach(i=>field(`image${i}`).value=value.images[i]??'');field('layout').value=value.layout??'auto';syncLayouts();form.querySelector('[data-layout-status]')!.textContent='';message.textContent='';preview();dialog.showModal();
 },{signal:page.signal});
 form.addEventListener('input',()=>{syncLayouts(true);preview();},{signal:page.signal});
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
   status.textContent='';
  }catch(error){if(!page.signal.aborted)message.textContent=error instanceof ApiError&&error.status===409?copy('Cấu hình đã đổi ở nơi khác. Đóng và tải lại trang trước khi lưu.','Profile changed elsewhere. Close and reload before saving.'):copy('Chưa lưu được. Kiểm tra ảnh, độ dài lời dẫn và phiên owner rồi thử lại.','Could not save. Check images, text lengths and owner session.');}
  finally{saving=false;form.inert=false;edit.disabled=!ready;if(runtime.current().user?.role!=='owner'&&dialog.open)dialog.close();}
 },{signal:page.signal});
 void runtime.api.homeProfile().then(saved=>{
  if(page.signal.aborted)return;version=saved.version;if(saved.value){value=homeProfile(saved.value);apply(value);}ready=true;edit.disabled=runtime.current().busy;
 }).catch(()=>{if(!page.signal.aborted)status.textContent=copy('Chưa tải được ảnh và lời dẫn mới nhất. Vui lòng tải lại trang.','Could not load the latest photos and introduction. Please reload.');});
});
