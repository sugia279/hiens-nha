export function validProfileImage(value: unknown): value is string {
 if (typeof value !== 'string' || !value || value.length>2048 || /[\s\\\x00-\x1f]/.test(value)) return false;
 if(value.startsWith('/')&&!value.startsWith('//')) return true;
 try {const url=new URL(value);return url.protocol==='https:' && !url.username && !url.password;}catch{return false;}
}
/** Display existing stored local assets at either Pages base without rewriting saved data. */
export function profileImageForBase(value: string, base: string): string {
 const relative=value.startsWith('/hiens-nha/')?value.slice('/hiens-nha/'.length):/^\/(?:_astro|resume)\//.test(value)?value.slice(1):null;
 return relative===null?value:base+relative;
}
