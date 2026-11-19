import { ApiError, inputObject } from './contracts.ts';
export const feelings = ['happy','grateful','loved','excited','thoughtful','sad'] as const;
export const mediaLayouts = ['auto','single-square','single-landscape','single-event','single-link','single-story','two-square','two-portrait','two-landscape','three-square','three-left','three-top','four-grid','four-left','four-top'] as const;
export type MediaLayout = typeof mediaLayouts[number];
export interface MediaReference {resourceId:string;path:string;kind:'image'|'video'}
export interface PostSocial { people:string[];location:string;feeling:string;images:string[];media?:MediaReference[];layout?:MediaLayout;frame?:'rounded'|'square'|'polaroid' }
const uuid='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export const postImagePath = new RegExp(`^${uuid}/${uuid}\\.webp$`);
export const postMediaPath = new RegExp(`^${uuid}/${uuid}\\.(webp|mp4|webm)$`);
export function mediaReferences(value:PostSocial):MediaReference[]{return [...value.images.map(path=>({resourceId:'primary-images',path,kind:'image' as const})),...(value.media??[])];}
export function validMediaLayout(value:unknown,count:number):value is MediaLayout{return typeof value==='string'&&mediaLayouts.includes(value as MediaLayout)&&(value==='auto'||count>0&&value.startsWith(['','single-','two-','three-','four-'][count]??'!'));}
export function postSocial(input:unknown):PostSocial{
 const v=inputObject(input,['people','location','feeling','images','media','layout','frame']);
 const invalid=()=>{throw new ApiError(422,'INVALID_INPUT','Invalid post details');};
 if(!Array.isArray(v.people)||v.people.length>10||v.people.some(p=>typeof p!=='string'||!p.trim()||p.length>60))invalid();
 if(typeof v.location!=='string'||v.location.length>120||typeof v.feeling!=='string'||(v.feeling!==''&&!feelings.includes(v.feeling as typeof feelings[number])))invalid();
 if(!Array.isArray(v.images)||v.images.length>4||v.images.some(p=>typeof p!=='string'||!postImagePath.test(p))||new Set(v.images).size!==v.images.length)invalid();
 const media:MediaReference[]=[];
 if(v.media!==undefined){if(!Array.isArray(v.media))invalid();for(const item of v.media as unknown[]){const m=inputObject(item,['resourceId','path','kind']);if(typeof m.resourceId!=='string'||!/^[-a-z0-9]{1,60}$/.test(m.resourceId)||typeof m.path!=='string'||!postMediaPath.test(m.path)||!['image','video'].includes(String(m.kind))||(m.kind==='image')!==m.path.endsWith('.webp'))invalid();media.push(m as unknown as MediaReference);}}
 const refs=[...(v.images as string[]).map(path=>'primary-images:'+path),...media.map(m=>m.resourceId+':'+m.path)],count=refs.length;
 if(count>4||new Set(refs).size!==count||v.layout!==undefined&&!validMediaLayout(v.layout,count)||v.frame!==undefined&&!['rounded','square','polaroid'].includes(String(v.frame)))invalid();
 return {people:[...new Set((v.people as string[]).map(p=>p.trim()))],location:(v.location as string).trim(),feeling:v.feeling as string,images:v.images as string[],...(v.media!==undefined?{media}:{}),...(v.layout!==undefined?{layout:v.layout as MediaLayout}:{}),...(v.frame!==undefined?{frame:v.frame as PostSocial['frame']}: {})};
}
