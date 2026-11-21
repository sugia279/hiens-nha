import {expect,it} from 'vitest';
import {categoryLabel,categoryIdentity,categoryTags,categoryDestination,defaultCategories,findCategory,matchesCategory} from '../../src/lib/content-categories';
import {photoRecordSchema} from '../../src/lib/photo-record';
import {primaryNavigation} from '../../src/config/navigation';

it('defines the five requested destinations, independently scoped add actions and original URLs',()=>{
 expect(primaryNavigation.map(n=>n.label)).toEqual(['Home','Photos','Video','Writing','About']);
 expect(primaryNavigation.filter(n=>n.categoryScope).map(n=>n.children?.at(-1)?.addCategory)).toEqual(['photos','media','posts']);
 expect(primaryNavigation.find(n=>n.label==='Writing')!.children!.slice(0,3).map(n=>n.href)).toEqual(['/projects/','/series/','/novels/']);
 expect(primaryNavigation.at(-1)!.children!.map(n=>n.href)).toEqual(['/about/','/resume/']);
});
it('normalizes Unicode and repeated spaces, rejects empty/oversize/control text, and scopes duplicates',()=>{
 expect(categoryLabel('  Du lịch   hè  ')).toBe('Du lịch hè');
 expect(categoryIdentity('GIA ĐÌNH')).toBe(categoryIdentity('Gia Đình'));
 expect(findCategory(defaultCategories,'photos','Family')?.id).toBe('family');
 expect(findCategory(defaultCategories,'posts','Family')).toBeUndefined();
 for(const label of ['', '   ', 'x'.repeat(41), 'bad\nlabel', 'bad\u0000label'])expect(()=>categoryLabel(label)).toThrow();
});
it('adds the category as an ordinary tag without dropping other tags or exceeding contract limits',()=>{
 expect(categoryTags('piano, chill','Nhạc yêu thích')).toEqual(['piano','chill','Nhạc yêu thích']);
 expect(categoryTags(['Gia Đình'],'Gia Đình')).toEqual(['Gia Đình']);
 expect(()=>categoryTags(Array.from({length:12},(_,i)=>`tag-${i}`),'New')).toThrow();
 const music=defaultCategories.find(c=>c.id==='music')!;
 expect(matchesCategory({category:'music',tags:[]},music)).toBe(true);
 expect(matchesCategory({category:'video',tags:['Nhạc yêu thích']},music)).toBe(true);
 expect(matchesCategory({category:'video',tags:[]},music)).toBe(false);
 expect(matchesCategory({category:'video',tags:['bad\nlabel',null,7]},music)).toBe(false);
 expect(categoryDestination({...music,id:'cat-10000000-0000-0000-0000-000000000001'})).toContain('?category=cat-');
});
it('keeps legacy photo metadata valid and round-trips a tagged custom album without unsafe IDs',()=>{
 const old={id:'test-photo',title:'Photo',description:'A photo',album:'family',image:'src/assets/gallery/test-photo.webp'};
 expect(photoRecordSchema.parse(old).album).toBe('family');
 const custom={...old,album:'cat-10000000-0000-0000-0000-000000000001',albumLabel:'Du lịch',tags:['Du lịch']};
 expect(photoRecordSchema.parse(custom)).toEqual(custom);
 expect(photoRecordSchema.safeParse({...custom,albumLabel:undefined}).success).toBe(false);
 expect(photoRecordSchema.safeParse({...custom,album:'../../outside'}).success).toBe(false);
});
