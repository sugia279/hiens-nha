import { it,expect } from 'vitest';
import { homeProfile,validProfileImage } from '../../src/lib/home-profile';
it('accepts public image paths and HTTPS but rejects executable/credential URLs',()=>{
 for(const url of ['/hiens-nha/image.webp','https://example.com/photo.jpg'])expect(validProfileImage(url)).toBe(true);
 for(const url of ['//evil.test/image','javascript:alert(1)','data:image/png,abc','https://user:pass@evil.test/x','/bad\\url','/bad\nurl'])expect(validProfileImage(url)).toBe(false);
});
it('supports all three frames and one to four photos without treating text as HTML',()=>{
 for(const frame of ['rounded','square','polaroid'])for(const count of [1,2,3,4])expect(homeProfile({images:Array(count).fill('/image.webp'),avatarUrl:'/avatar.png',frame,leadVi:'<script>literal</script>',leadEn:'Hello',introVi:'Xin chào',introEn:'Welcome'}).images).toHaveLength(count);
 expect(()=>homeProfile({images:[]})).toThrow();
});

it('keeps legacy profiles and validates every layout against its photo count', async()=>{
 const {coverLayouts}=await import('../../src/lib/cover-layout');
 const base={avatarUrl:'/avatar.png',frame:'rounded',leadVi:'Xin chào',leadEn:'Hello',introVi:'Giới thiệu',introEn:'Welcome'};
 expect(homeProfile({...base,images:['/1.webp']})).not.toHaveProperty('layout');
 for(const layout of coverLayouts){
  const value={...base,images:Array(layout.count||4).fill('/image.webp'),layout:layout.id};
  expect(homeProfile(value).layout).toBe(layout.id);
  if(layout.count)expect(()=>homeProfile({...value,images:Array(layout.count===1?2:1).fill('/image.webp')})).toThrow('Invalid layout');
 }
 for(const layout of [null,7,'unknown','auto; color:red'])expect(()=>homeProfile({...base,images:['/1.webp'],layout})).toThrow();
});
