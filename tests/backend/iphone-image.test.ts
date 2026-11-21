// @vitest-environment happy-dom
import {it,expect,vi,afterEach} from 'vitest';
import {preparePostImage} from '../../src/lib/api/post-images';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('falls back to native image decoding when createImageBitmap cannot read iPhone HEIC',async()=>{
 vi.stubGlobal('createImageBitmap',vi.fn().mockRejectedValue(Error('HEIC unsupported by bitmap')));
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:heic');const revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
 vi.stubGlobal('Image',function(){const img=document.createElement('img');Object.defineProperties(img,{naturalWidth:{value:4032},naturalHeight:{value:3024},src:{set(){queueMicrotask(()=>img.onload?.(new Event('load')));}}});return img;});
 const draw=vi.fn();vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:draw} as any);
 vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(function(callback){callback(new Blob(['converted'],{type:'image/webp'}));});
 const blob=await preparePostImage(new File(['native HEIC fixture'],'IMG_001.HEIC',{type:'image/heic'}));
 expect(blob.type).toBe('image/webp');expect(draw).toHaveBeenCalledWith(expect.anything(),0,0,1600,1200);expect(revoke).toHaveBeenCalledWith('blob:heic');
});
