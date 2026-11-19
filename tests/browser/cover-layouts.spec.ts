import { test,expect } from '@playwright/test';
import { coverLayouts } from '../../src/lib/cover-layout';

for(const prefix of ['', 'en/'])for(const width of [375,390,820,1440]){
 test(`cover layouts preserve all cells and full mobile photos: ${prefix||'vi/'} ${width}`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto(`/hiens-nha/${prefix}`);
  const gallery=page.locator('.home-photos');
  const original=await gallery.innerHTML();
  for(const layout of coverLayouts){
   const count=layout.count||4;
   await gallery.evaluate((el,{original,layout,count})=>{
    el.innerHTML=original;
    [...el.children].slice(count).forEach(child=>child.remove());
    el.setAttribute('data-layout',layout);el.setAttribute('data-photo-count',String(count));
   },{original,layout:layout.id,count});
   const rect=(await gallery.boundingBox())!;
   const cells=await gallery.locator('a').all();
   expect(cells).toHaveLength(count);
   for(const cell of cells){
    const r=(await cell.boundingBox())!;
    expect(r.width).toBeGreaterThan(0);expect(r.height).toBeGreaterThan(0);
    expect(r.x).toBeGreaterThanOrEqual(rect.x-1);expect(r.y).toBeGreaterThanOrEqual(rect.y-1);
    expect(r.x+r.width).toBeLessThanOrEqual(rect.x+rect.width+1);expect(r.y+r.height).toBeLessThanOrEqual(rect.y+rect.height+1);
    if(width<768)expect(await cell.locator('img').evaluate(img=>getComputedStyle(img).objectFit)).toBe('contain');
   }
   if(width<768){
    const avatar=(await page.locator('.home-avatar').boundingBox())!;
    expect(avatar.y).toBeGreaterThanOrEqual(rect.y+rect.height);
   }
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
   if(['three-left','four-left'].includes(layout.id)){
    const a=(await cells[0].boundingBox())!,b=(await cells[1].boundingBox())!;
    expect(a.height).toBeGreaterThan(b.height*1.8);expect(b.x).toBeGreaterThan(a.x);
   }
   if(['three-top','four-top'].includes(layout.id)){
    const a=(await cells[0].boundingBox())!,b=(await cells[1].boundingBox())!;
    expect(a.width).toBeGreaterThan(b.width*1.8);expect(b.y).toBeGreaterThan(a.y);
   }
  }
 });
}
