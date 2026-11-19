import { test,expect } from '@playwright/test';
import { coverLayouts } from '../../src/lib/cover-layout';

for(const prefix of ['', 'en/'])for(const width of [375,390,820,1440]){
 test(`cover layouts fill every cell with tight borders: ${prefix||'vi/'} ${width}`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto(`/hiens-nha/${prefix}`);
  const gallery=page.locator('.home-photos');
  const original=await gallery.innerHTML();
  for(const frame of ['rounded','square','polaroid'])for(const layout of coverLayouts){
   const count=layout.count||4;
   await gallery.evaluate((el,{original,layout,count,frame})=>{
    el.innerHTML=original;
    [...el.children].slice(count).forEach(child=>child.remove());
    el.setAttribute('data-frame',frame);el.setAttribute('data-layout',layout);el.setAttribute('data-photo-count',String(count));
   },{original,layout:layout.id,count,frame});
   const rect=(await gallery.boundingBox())!;
   const cells=await gallery.locator('a').all();
   expect(cells).toHaveLength(count);
   expect(await cells[0].evaluate(el=>getComputedStyle(el).borderRadius)).toBe('0px');
   const gridStyle=await gallery.evaluate(el=>({gap:getComputedStyle(el).gap,radius:getComputedStyle(el).borderRadius,overflow:getComputedStyle(el).overflow}));
   expect(gridStyle.gap).toBe(frame==='square'?'0px':'2px');
   expect(gridStyle.radius).toBe(frame==='square'?'0px':'20px');
   expect(gridStyle.overflow).toBe('hidden');
   for(const cell of cells){
    const r=(await cell.boundingBox())!;
    expect(r.width).toBeGreaterThan(0);expect(r.height).toBeGreaterThan(0);
    expect(r.x).toBeGreaterThanOrEqual(rect.x-1);expect(r.y).toBeGreaterThanOrEqual(rect.y-1);
    expect(r.x+r.width).toBeLessThanOrEqual(rect.x+rect.width+1);expect(r.y+r.height).toBeLessThanOrEqual(rect.y+rect.height+1);
    const image=cell.locator('img');
    expect(await image.evaluate(img=>getComputedStyle(img).objectFit)).toBe('cover');
    const picture=(await image.boundingBox())!;
    const border=frame==='polaroid'?2:0;
    expect(picture.x).toBeCloseTo(r.x+border,0);expect(picture.y).toBeCloseTo(r.y+border,0);
    expect(picture.width).toBeCloseTo(r.width-border*2,0);
    expect(picture.height).toBeCloseTo(r.height-border*2,0);
   }
   const bounds=await Promise.all(cells.map(cell=>cell.boundingBox()));
   const inset=frame==='polaroid'?2:0;
   expect(Math.min(...bounds.map(r=>r!.x))).toBeCloseTo(rect.x+inset,0);
   expect(Math.min(...bounds.map(r=>r!.y))).toBeCloseTo(rect.y+inset,0);
   expect(Math.max(...bounds.map(r=>r!.x+r!.width))).toBeCloseTo(rect.x+rect.width-inset,0);
   expect(Math.max(...bounds.map(r=>r!.y+r!.height))).toBeCloseTo(rect.y+rect.height-inset,0);
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
