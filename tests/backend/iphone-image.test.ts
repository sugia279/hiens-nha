// @vitest-environment happy-dom
import {it,expect,vi,afterEach} from 'vitest';
import {preparePostImage} from '../../src/lib/api/prepare-post-image';
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

it('encodes JPEG when the requested WebP encoder silently returns PNG (Safari-style behavior)',async()=>{
 vi.stubGlobal('createImageBitmap',vi.fn().mockResolvedValue({width:4032,height:3024,close:vi.fn()}));
 const fill=vi.fn();vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:vi.fn(),fillRect:fill} as any);
 const encode=vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(function(callback,type){callback(new Blob(['encoded'],{type:type==='image/webp'?'image/png':'image/jpeg'}));});
 const file=new File(['photo'],'IMG.JPG',{type:'image/jpeg'});Object.defineProperty(file,'size',{value:50*1024*1024});
 const blob=await preparePostImage(file);
 expect(blob.type).toBe('image/jpeg');expect(encode.mock.calls.map(c=>c[1])).toEqual(['image/webp','image/jpeg']);expect(fill).toHaveBeenCalled();
});
it('reports the actual input limit before trying to decode an oversized photo',async()=>{
 const decode=vi.fn();vi.stubGlobal('createImageBitmap',decode);
 const file=new File(['photo'],'IMG.JPG',{type:'image/jpeg'});Object.defineProperty(file,'size',{value:50*1024*1024+1});
 await expect(preparePostImage(file)).rejects.toMatchObject({code:'FILE_TOO_LARGE'});expect(decode).not.toHaveBeenCalled();
});
