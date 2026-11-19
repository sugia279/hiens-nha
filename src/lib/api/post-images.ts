import { postImagePath } from '../../../supabase/functions/_shared/post-social';
import type { BackendConfig } from './config';
import { ApiError } from '../../../supabase/functions/_shared/contracts';
export function postImages(config: BackendConfig, token:()=>Promise<string|null>, fetcher:typeof fetch=fetch){
 async function call(path:string,method:string,body?:Blob){
  if(!postImagePath.test(path))throw Error('Invalid image path');
  const access=await token();
  const headers=new Headers({apikey:config.publishableKey,Authorization:`Bearer ${access??config.publishableKey}`});
  if(body)headers.set('Content-Type','image/webp');
  const route=method==='GET'?'object/authenticated':'object';
  if(method==='DELETE')headers.set('Content-Type','application/json');
  const url=`${config.supabaseUrl}/storage/v1/${route}/post-images${method==='DELETE'?'':'/'+path}`;
  const response=await fetcher(url,{method,headers,body:method==='DELETE'?JSON.stringify({prefixes:[path]}):body,credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new ApiError(response.status,'IMAGE_ERROR','Image request failed');
  return response;
 }
 return {
  async upload(path:string,blob:Blob){if(blob.type!=='image/webp'||blob.size>2097152||!(await token()))throw Error('Invalid image upload');await call(path,'POST',blob);},
  async read(path:string){const response=await call(path,'GET');const blob=await response.blob();if(blob.size>2097152||!blob.type.startsWith('image/'))throw Error('Invalid image response');return blob;},
  async remove(path:string){await call(path,'DELETE');},
 };
}
/** Resize and re-encode locally, stripping camera metadata before upload. */
export async function preparePostImage(file:File):Promise<Blob>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>12582912)throw Error('Choose JPEG, PNG or WebP under 12 MB');
 const bitmap=await createImageBitmap(file);
 try{
  if(bitmap.width*bitmap.height>60000000)throw Error('Image dimensions too large');
  const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image conversion unavailable');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Image conversion failed')),'image/webp',.82));
  if(blob.type!=='image/webp'||blob.size>2097152)throw Error('Image is too large after conversion');return blob;
 }finally{bitmap.close();}
}
