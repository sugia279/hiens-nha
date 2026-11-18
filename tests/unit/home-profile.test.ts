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
