import { expect,it } from 'vitest';
import { redirectDestination } from '../../scripts/pages/redirects.mjs';
import { buildRedirects } from '../../scripts/pages/redirects.mjs';
import { mkdtemp,mkdir,writeFile,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
it('preserves original VI/EN paths, query and fragment across the origin/base move',()=>{
  expect(redirectDestination('/hiens-nha/en/music/','?category=one%26two','#listen')).toBe('https://suduyhien.github.io/en/music/?category=one%26two#listen');
  expect(redirectDestination('/hiens-nha/')).toBe('https://suduyhien.github.io/');
  expect(redirectDestination('/hiens-nha/articles/Ch%C6%B0%C6%A1ng/')).toBe('https://suduyhien.github.io/articles/Ch%C6%B0%C6%A1ng/');
});
it('never accepts another destination or redirects an unrelated prefix',()=>{
  for(const path of ['/elsewhere/','//evil.test/','/hiens-nha','/hiens-nha/evil\\path']) expect(redirectDestination(path)).toBeUndefined();
  expect(new URL(redirectDestination('/hiens-nha//evil.test/','?next=https://evil.test')!).origin).toBe('https://suduyhien.github.io');
});
it('preserves old callbacks byte for byte and keeps file routes in redirect fallbacks',async()=>{
  const root=await mkdtemp(join(tmpdir(),'hiens-pages-redirect-'));
  try {
    for(const name of ['index.html','en/music/index.html','resume/profile.html','404.html','account/callback/index.html','en/account/callback/index.html']){
      await mkdir(join(root,name,'..'),{recursive:true});await writeFile(join(root,name),'<html><body>original callback/assets</body></html>');
    }
    expect(await buildRedirects(root)).toBe(4);
    expect(await readFile(join(root,'account/callback/index.html'),'utf8')).toBe('<html><body>original callback/assets</body></html>');
    expect(await readFile(join(root,'en/account/callback/index.html'),'utf8')).toBe('<html><body>original callback/assets</body></html>');
    expect(await readFile(join(root,'resume/profile.html'),'utf8')).toContain('href="https://suduyhien.github.io/resume/profile.html"');
    expect(await readFile(join(root,'en/music/index.html'),'utf8')).toContain('location.search,location.hash');
  } finally {await rm(root,{recursive:true,force:true});}
});
