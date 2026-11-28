import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

export const oldBase='/hiens-nha/';
export const newOrigin='https://suduyhien.github.io';
export function redirectDestination(pathname,search='',hash='') {
  if(!pathname.startsWith(oldBase)||/[\\\r\n]/.test(pathname)) return undefined;
  const target=new URL(newOrigin);
  target.pathname='/'+pathname.slice(oldBase.length);
  target.search=search;target.hash=hash;
  return target.href;
}
export async function buildRedirects(directory) {
  const callbacks=await Promise.all(['','en/'].map(async locale=>{
    const name=locale+'account/callback/index.html';
    const html=await readFile(join(directory,name),'utf8');
    if(!html.includes('<html')) throw Error('Old callback artifact missing');
    return {name,html};
  }));
  let count=0;
  for(const file of await readdir(directory,{recursive:true})) {
    const name=file.replaceAll('\\','/');
    if(!name.endsWith('.html')||/^(?:en\/)?account\/callback\/index\.html$/.test(name)) continue;
    const logical=name==='index.html'?'':name.endsWith('/index.html')?name.slice(0,-10):name;
    const target=new URL(logical,newOrigin+'/').href;
    const escaped=target.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
    const script=`const destination=(${redirectDestination.toString()})(location.pathname,location.search,location.hash);if(destination)location.replace(destination);`;
    // The generated function uses only these fixed public constants, never a supplied target.
    const code=`const oldBase=${JSON.stringify(oldBase)},newOrigin=${JSON.stringify(newOrigin)};${script}`.replaceAll('<','\\u003c');
    await writeFile(join(directory,file),`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="description" content="Hiên Nhà đã chuyển địa chỉ. Hien’s Nha has moved."><title>Hiên Nhà — Địa chỉ mới</title><link rel="canonical" href="${escaped}"><script>${code}</script></head><body><main><h1>Hiên Nhà đã chuyển địa chỉ</h1><p>Hien’s Nha has moved.</p><a href="${escaped}">Mở Hiên Nhà / Open Hien’s Nha</a></main></body></html>`);
    count++;
  }
  // Both old callbacks must retain the reviewed exchange/runtime, including their assets.
  for(const {name,html} of callbacks) if(await readFile(join(directory,name),'utf8')!==html) throw Error('Old callback artifact changed');
  return count;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  if(process.env.GITHUB_REPOSITORY!=='sugia279/hiens-nha'||process.env.ROOT_PAGES_REDIRECT!=='true') throw Error('Redirect delivery is not enabled for this source');
  console.log(`Prepared ${await buildRedirects(resolve('dist'))} fixed-destination redirects; old Auth callbacks retained.`);
}
