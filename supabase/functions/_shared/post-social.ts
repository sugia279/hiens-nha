import { ApiError, inputObject } from './contracts.ts';
export const feelings = ['happy','grateful','loved','excited','thoughtful','sad'] as const;
export interface PostSocial { people: string[]; location: string; feeling: string; images: string[] }
export const postImagePath = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;
export function postSocial(input: unknown): PostSocial {
  const v=inputObject(input,['people','location','feeling','images']);
  const invalid=()=>{throw new ApiError(422,'INVALID_INPUT','Invalid post details');};
  if(!Array.isArray(v.people)||v.people.length>10||v.people.some(p=>typeof p!=='string'||!p.trim()||p.length>60))invalid();
  if(typeof v.location!=='string'||v.location.length>120||typeof v.feeling!=='string'||(v.feeling!==''&&!feelings.includes(v.feeling as typeof feelings[number])))invalid();
  if(!Array.isArray(v.images)||v.images.length>4||v.images.some(p=>typeof p!=='string'||!postImagePath.test(p))||new Set(v.images).size!==v.images.length)invalid();
  return {people:[...new Set((v.people as string[]).map(p=>p.trim()))],location:(v.location as string).trim(),feeling:v.feeling as string,images:v.images as string[]};
}
