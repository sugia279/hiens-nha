export function validProfileImage(value: unknown): value is string {
 if (typeof value !== 'string' || !value || value.length>2048 || /[\s\\\x00-\x1f]/.test(value)) return false;
 if(value.startsWith('/')&&!value.startsWith('//')) return true;
 try {const url=new URL(value);return url.protocol==='https:' && !url.username && !url.password;}catch{return false;}
}
/** Display existing stored local assets at either Pages base without rewriting saved data. */
export function profileImageForBase(value: string, base: string, assets: readonly {source:string;url:string}[] = []): string {
 const relative=value.startsWith('/hiens-nha/')?value.slice('/hiens-nha/'.length):/^\/(?:_astro|resume)\//.test(value)?value.slice(1):null;
 if(relative?.startsWith('_astro/')) {
  const filename=relative.slice('_astro/'.length);
  for(const asset of assets) {
   const source=asset.source.slice(asset.source.lastIndexOf('/')+1).replace(/\.[^.]+$/,'');
   if(filename.startsWith(source+'_')&&/^_[A-Za-z\d_-]+\.(?:avif|webp|png|jpe?g)$/i.test(filename.slice(source.length)))return asset.url;
  }
 }
 return relative===null?value:base+relative;
}
