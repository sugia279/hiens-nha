/** Resize and re-encode locally, stripping camera metadata before upload. */
export async function preparePostImage(file:File):Promise<Blob>{
 if(!(['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(file.type)||!file.type&&/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name))||file.size>12582912)throw Error('Choose JPEG, PNG or WebP under 12 MB');
 let bitmap:ImageBitmap|HTMLImageElement;
 let sourceUrl:string|undefined;
 try{bitmap=await createImageBitmap(file);}catch{
  sourceUrl=URL.createObjectURL(file);
  try{bitmap=await new Promise<HTMLImageElement>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('IMAGE_DECODE'));img.src=sourceUrl!;});}
  catch(error){URL.revokeObjectURL(sourceUrl);throw error;}
 }
 try{
  const width=bitmap instanceof HTMLImageElement?bitmap.naturalWidth:bitmap.width,height=bitmap instanceof HTMLImageElement?bitmap.naturalHeight:bitmap.height;
  if(!width||!height||width*height>60000000)throw Error('Image dimensions too large');
  const scale=Math.min(1,1600/Math.max(width,height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image conversion unavailable');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Image conversion failed')),'image/webp',.82));
  if(blob.type!=='image/webp'||blob.size>2097152)throw Error('Image is too large after conversion');return blob;
 }finally{if('close' in bitmap)bitmap.close();if(sourceUrl)URL.revokeObjectURL(sourceUrl);}
}
