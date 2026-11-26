import { validCoverLayout, type CoverLayout } from './cover-layout';
export interface HomeProfile { images: string[]; avatarUrl: string; frame: 'rounded' | 'square' | 'polaroid'; layout?: CoverLayout; leadVi: string; leadEn: string; introVi: string; introEn: string }
export interface HomeProfileVersion { version: number; value: HomeProfile | null }
import {validProfileImage} from './profile-image';
export {validProfileImage} from './profile-image';
export function homeProfile(value: unknown): HomeProfile {
 const p=value as HomeProfile;
 if(!p||typeof p!=='object'||Object.keys(p).some(k=>!['images','avatarUrl','frame','layout','leadVi','leadEn','introVi','introEn'].includes(k))||!Array.isArray(p.images)||p.images.length<1||p.images.length>4||!p.images.every(validProfileImage)||!validProfileImage(p.avatarUrl)||!['rounded','square','polaroid'].includes(p.frame))throw Error('Invalid profile');
 if(Object.hasOwn(p,'layout')&&!validCoverLayout(p.layout,p.images.length))throw Error('Invalid layout for photo count');
 for(const [key,max] of [['leadVi',160],['leadEn',160],['introVi',600],['introEn',600]] as const)if(typeof p[key]!=='string'||!p[key].trim()||p[key].length>max)throw Error('Invalid introduction');
 return {...p,images:[...p.images]};
}
