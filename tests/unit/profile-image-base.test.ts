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
