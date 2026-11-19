import {test,expect} from '@playwright/test';
import {defaultCategories} from '../../src/lib/content-categories';
test('category menu and upload pickers share persistent folders across navigation and locales',async({page,context})=>{
 const categories=[...defaultCategories],saved:Record<string,unknown>[]=[];
 const owner='10000000-0000-0000-0000-000000000003';
 const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:owner,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),'local_category_fixture'].join('.');
 const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'};
 await context.route('**/auth/v1/authorize?**',async route=>{
  const url=new URL(route.request().url()),callback=new URL(url.searchParams.get('redirect_to')!);callback.searchParams.set('code','local-category-code');
  await route.fulfill({status:302,headers:{location:callback.href}});
 });
 await context.route('**/auth/v1/token?grant_type=pkce',route=>route.fulfill({json:{access_token:token,refresh_token:'local_category_refresh',token_type:'bearer',expires_in:3600,user:{id:owner}},headers}));
 await context.route('**/rest/v1/rpc/**',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  const name=new URL(route.request().url()).pathname.split('/').at(-1);
  if(name==='content_category_create'){
   const body=route.request().postDataJSON();const row={id:'cat-'+crypto.randomUUID(),scope:body.p_scope,label:body.p_label,label_en:null};categories.push(row);return route.fulfill({json:row,headers});
  }
  return route.fulfill({json:name==='content_categories_read'?categories:{version:0,value:null},headers});
 });
 await context.route('**/functions/v1/api/v1/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(request.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(request.method()==='POST'&&/\/(posts|media)$/.test(url.pathname)){
   const payload=request.postDataJSON();saved.push(payload);
   return route.fulfill({json:{id:crypto.randomUUID(),feature:url.pathname.endsWith('/posts')?'posts':'media',author_id:owner,entity_id:crypto.randomUUID(),version:1,revision:1,published_revision:null,status:'draft',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),payload},headers});
  }
  const json=url.pathname.endsWith('/me')?{id:owner,role:'owner'}
   :url.pathname.endsWith('/state')?{source:'api',epoch:1,writes_enabled:true}
   :url.pathname.includes('/entities/resolve')?{id:'20000000-0000-0000-0000-000000000001'}:{items:[],nextCursor:null};
  return route.fulfill({json,headers});
 });
 await page.goto('/hiens-nha/account/');await page.locator('[data-sign-in]').click();
 await expect(page.locator('[data-auth-status]')).toContainText('Đã xác minh');
 for(const [scope,label,key] of [['photos','Du lịch','Enter'],['media','Phim tài liệu','Tab'],['posts','Nhật ký','Enter']] as const){
  const branch=page.locator(`.sidebar__desktop-nav [data-category-scope="${scope}"]`);
  await branch.locator('..').locator(':scope > summary').click();
  await branch.locator('[data-category-open]').click();
  const input=branch.locator('[data-category-new]');await expect(input).toBeVisible();await input.fill(label);await input.press(key);
  await expect(branch.getByRole('link',{name:label,exact:true})).toBeVisible();await expect(input).toBeHidden();
 }
 expect(categories).toHaveLength(defaultCategories.length+3);
 await page.goto('/hiens-nha/photos/upload/');await expect(page.locator('#photo-album-options option[value="Du lịch"]')).toHaveCount(1);
 await page.goto('/hiens-nha/account/content/');
 await expect(page.locator('[data-publication-form]')).toBeVisible();
 await page.locator('[name="title"]').fill('A categorized post');await page.locator('[name="body"]').fill('A local UI fixture only.');
 await page.locator('#post-category').fill('Nhật ký');await page.locator('[data-publication-form] button[type="submit"]').click();
 await expect.poll(()=>saved.some(payload=>payload.category==='Nhật ký'&&Array.isArray(payload.tags)&&payload.tags.includes('Nhật ký'))).toBe(true);
 await page.reload();await expect(page.locator('.sidebar__desktop-nav [data-category-scope="posts"] a').filter({hasText:'Nhật ký'})).toHaveCount(1);
 await page.locator('a[data-locale-link][lang="en"]').click();await expect(page.locator('html')).toHaveAttribute('lang','en');
 await expect(page.locator('.sidebar__desktop-nav [data-category-scope="posts"] a').filter({hasText:'Nhật ký'})).toHaveCount(1);
 await expect(page.locator('#post-category-options option[value="Nhật ký"]')).toHaveCount(1);
});
