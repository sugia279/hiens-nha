export function validProfileImage(value: unknown): value is string {
 if (typeof value !== 'string' || !value || value.length>2048 || /[\s\\\x00-\x1f]/.test(value)) return false;
 if(value.startsWith('/')&&!value.startsWith('//')) return true;
 try {const url=new URL(value);return url.protocol==='https:' && !url.username && !url.password;}catch{return false;}
}
