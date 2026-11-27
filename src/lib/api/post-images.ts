import { postImagePath } from '../../../supabase/functions/_shared/post-media-path';
import type { BackendConfig } from './config';
import { ApiError } from '../../../supabase/functions/_shared/contracts';
/** Only this reader is needed by the site-wide runtime; upload clients stay page-scoped. */
export function postImageReader(config:BackendConfig,token:()=>Promise<string|null>,fetcher:typeof fetch=fetch){
 return {async read(path:string){
  if(!postImagePath.test(path))throw Error('Invalid image path');
  const response=await fetcher(`${config.supabaseUrl}/storage/v1/object/authenticated/post-images/${path}`,{
   headers:{apikey:config.publishableKey,Authorization:`Bearer ${await token()??config.publishableKey}`},credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000),
  });
  if(!response.ok)throw new ApiError(response.status,'IMAGE_ERROR','Image request failed');
  const blob=await response.blob();if(blob.size>2097152||!blob.type.startsWith('image/'))throw Error('Invalid image response');return blob;
 }};
}
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
