export interface HomeProfile { images: string[]; avatarUrl: string; frame: 'rounded' | 'square' | 'polaroid'; leadVi: string; leadEn: string; introVi: string; introEn: string }
export interface HomeProfileVersion { version: number; value: HomeProfile | null }
export function validProfileImage(value: unknown): value is string {
 if (typeof value !== 'string' || !value || value.length>2048 || /[\s\\\x00-\x1f]/.test(value)) return false;
 if(value.startsWith('/')&&!value.startsWith('//')) return true;
 try {const url=new URL(value);return url.protocol==='https:' && !url.username && !url.password;}catch{return false;}
}
export function homeProfile(value: unknown): HomeProfile {
 const p=value as HomeProfile;
 if(!p||typeof p!=='object'||Object.keys(p).some(k=>!['images','avatarUrl','frame','leadVi','leadEn','introVi','introEn'].includes(k))||!Array.isArray(p.images)||p.images.length<1||p.images.length>4||!p.images.every(validProfileImage)||!validProfileImage(p.avatarUrl)||!['rounded','square','polaroid'].includes(p.frame))throw Error('Invalid profile');
 for(const [key,max] of [['leadVi',160],['leadEn',160],['introVi',600],['introEn',600]] as const)if(typeof p[key]!=='string'||!p[key].trim()||p[key].length>max)throw Error('Invalid introduction');
 return {...p,images:[...p.images]};
}
