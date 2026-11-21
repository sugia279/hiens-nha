import { maxPostFileBytes } from '../../../supabase/functions/_shared/post-social';
export class ImagePreparationError extends Error {
 constructor(readonly code:'FILE_TOO_LARGE'|'UNSUPPORTED_IMAGE'|'IMAGE_DECODE'|'IMAGE_DIMENSIONS'|'IMAGE_ENCODE'){super(code);}
}
/** Resize and re-encode locally, stripping camera metadata before upload. */
export async function preparePostImage(file:File):Promise<Blob>{
 if(file.size>maxPostFileBytes)throw new ImagePreparationError('FILE_TOO_LARGE');
 if(!(['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(file.type)||!file.type&&/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)))throw new ImagePreparationError('UNSUPPORTED_IMAGE');
 let bitmap:ImageBitmap|HTMLImageElement;
 let sourceUrl:string|undefined;
 try{bitmap=await createImageBitmap(file);}catch{
  sourceUrl=URL.createObjectURL(file);
  try{bitmap=await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('IMAGE_DECODE'));img.src=sourceUrl!;});}
  catch{URL.revokeObjectURL(sourceUrl);throw new ImagePreparationError('IMAGE_DECODE');}
 }
 try{
  const width=bitmap instanceof HTMLImageElement?bitmap.naturalWidth:bitmap.width,height=bitmap instanceof HTMLImageElement?bitmap.naturalHeight:bitmap.height;
  if(!width||!height||width*height>60000000)throw new ImagePreparationError('IMAGE_DIMENSIONS');
  const scale=Math.min(1,1600/Math.max(width,height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw new ImagePreparationError('IMAGE_ENCODE');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const encode=(type:string,quality:number)=>new Promise<Blob|null>(resolve=>{try{canvas.toBlob(resolve,type,quality);}catch{resolve(null);}});
  let blob=await encode('image/webp',.82);
  if(blob?.type==='image/webp'&&blob.size>0&&blob.size<=2097152)return blob;
  // Unsupported requested encoders can silently produce PNG. Use the real MIME.
  ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.globalCompositeOperation='source-over';
  for(const quality of [.85,.65,.45]){blob=await encode('image/jpeg',quality);if(blob?.type==='image/jpeg'&&blob.size>0&&blob.size<=2097152)return blob;}
  throw new ImagePreparationError('IMAGE_ENCODE');
 }finally{if('close' in bitmap)bitmap.close();if(sourceUrl)URL.revokeObjectURL(sourceUrl);}
}
