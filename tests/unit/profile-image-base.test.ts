import {expect,it} from 'vitest';
import {profileImageForBase} from '../../src/lib/profile-image';
it('renders both old and new stored local profile paths on either presentation base',()=>{
 for(const base of ['/','/hiens-nha/']) for(const suffix of ['_astro/cover.hash.webp','resume/portrait.png']) {
  expect(profileImageForBase('/hiens-nha/'+suffix,base)).toBe(base+suffix);
  expect(profileImageForBase('/'+suffix,base)).toBe(base+suffix);
 }
 expect(profileImageForBase('https://images.example/profile.jpg','/')).toBe('https://images.example/profile.jpg');
 expect(profileImageForBase('/other/image.jpg','/hiens-nha/')).toBe('/other/image.jpg');
});
it('resolves old optimized filenames only through the matching bundled source asset',()=>{
 for(const base of ['/','/hiens-nha/']) {
  const current=base+'_astro/cafe.contentHash_current.webp';
  const assets=[{source:base+'_astro/cafe.contentHash.jpg',url:current}];
  for(const prefix of ['/','/hiens-nha/'])expect(profileImageForBase(prefix+'_astro/cafe.contentHash_oldTransform.webp',base,assets)).toBe(current);
  expect(profileImageForBase('/hiens-nha/_astro/cafe.contentHash.jpg',base,assets)).toBe(base+'_astro/cafe.contentHash.jpg');
  for(const file of ['cafe.otherHash_oldTransform.webp','cafe.contentHashExtra_oldTransform.webp','cafe.contentHash_oldTransform.svg','unknown.contentHash_oldTransform.webp'])expect(profileImageForBase('/hiens-nha/_astro/'+file,base,assets)).toBe(base+'_astro/'+file);
  expect(profileImageForBase('https://images.example/_astro/cafe.contentHash_oldTransform.webp',base,assets)).toBe('https://images.example/_astro/cafe.contentHash_oldTransform.webp');
 }
});
