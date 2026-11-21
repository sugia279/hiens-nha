import type { BackendConfig } from './config';
import { postMediaPath, type MediaReference } from '../../../supabase/functions/_shared/post-social';
interface Resource {id:string;bucket:string;maxBytes:number;writable:boolean}
/** Catalog has public routing fields only. Remote secret/broker support is deliberately disabled. */
export function postMedia(config:BackendConfig,token:()=>Promise<string|null>,fetcher:typeof fetch=fetch){
 let pending:Promise<Resource[]>|null=null;
 const headers=async()=>new Headers({apikey:config.publishableKey,Authorization:`Bearer ${await token()??config.publishableKey}`});
 async function catalog(){
  if(!pending)pending=(async()=>{const response=await fetcher(`${config.supabaseUrl}/rest/v1/rpc/post_media_resources`,{method:'POST',headers:await headers(),credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Media resources unavailable');const rows=await response.json();if(!Array.isArray(rows)||rows.some(r=>typeof r.id!=='string'||!/^[-a-z0-9]{1,63}$/.test(r.bucket)||!Number.isSafeInteger(r.maxBytes)))throw Error('Invalid resource catalog');return rows as Resource[];})();
  try{return await pending;}catch(e){pending=null;throw e;}
 }
 async function transfer(ref:MediaReference,blob?:Blob){
  if(!postMediaPath.test(ref.path))throw Error('Invalid media path');
  const resource=(await catalog()).find(r=>r.id===ref.resourceId);if(!resource)throw Error('Unknown media resource');
  const h=await headers();if(blob){if(!resource.writable||blob.size>resource.maxBytes||!await token())throw Error('Upload unavailable');h.set('Content-Type',blob.type);}
  const response=await fetcher(`${config.supabaseUrl}/storage/v1/${blob?'object':'object/authenticated'}/${resource.bucket}/${ref.path}`,{method:blob?'POST':'GET',headers:h,body:blob,credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw Error('Media transfer failed');if(blob)return blob;
  const body=await response.blob();const mime=ref.kind==='image'?'image/webp':ref.path.endsWith('.mp4')?'video/mp4':'video/webm';if(body.size>resource.maxBytes||body.type!==mime)throw Error('Invalid media response');return body;
 }
 return {
  async upload(owner:string,blob:Blob):Promise<MediaReference>{
   const ext=({'image/webp':'webp','video/mp4':'mp4','video/webm':'webm'} as Record<string,string>)[blob.type];if(!ext||blob.size<1||blob.size>(ext==='webp'?2097152:20971520))throw Error('Invalid upload');
   const resource=(await catalog()).find(r=>r.writable&&r.maxBytes>=blob.size);if(!resource)throw Error('No writable media resource');
   const ref:MediaReference={resourceId:resource.id,path:`${owner}/${crypto.randomUUID()}.${ext}`,kind:ext==='webp'?'image':'video'};await transfer(ref,blob);return ref;
  },
  read:(ref:MediaReference)=>transfer(ref),
 };
}
/** Bound videos and reject renamed arbitrary files before sending them to Storage. */
export async function preparePostVideo(file:File):Promise<Blob>{
 if(!['video/mp4','video/webm'].includes(file.type)||file.size<12||file.size>20971520)throw Error('Choose MP4/WebM under 20 MB');
 const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
 const valid=file.type==='video/mp4'?String.fromCharCode(...bytes.slice(4,8))==='ftyp':bytes[0]===0x1a&&bytes[1]===0x45&&bytes[2]===0xdf&&bytes[3]===0xa3;
 if(!valid)throw Error('Invalid video header');return file;
}

const clients=new WeakMap<object,ReturnType<typeof postMedia>>();
export function postMediaFor(api:{mediaContext:{config:BackendConfig;token:()=>Promise<string|null>;fetcher:typeof fetch}}){let client=clients.get(api);if(!client){const c=api.mediaContext;client=postMedia(c.config,c.token,c.fetcher);clients.set(api,client);}return client;}
