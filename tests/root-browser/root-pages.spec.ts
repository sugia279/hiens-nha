import { expect,test } from '@playwright/test';

// Root artifact behavior only. All HTTP calls are stubbed; never a hosted write/OAuth test.
for(const width of [1280,390]) test(`root VI/EN contexts and navigation at ${width}px`,async({page,context})=>{
  await page.setViewportSize({width,height:844});
  const contexts:string[]=[];
  await context.route('**/rest/v1/rpc/home_profile_read',route=>route.fulfill({json:{version:1,value:{images:['/hiens-nha/resume/SuDuyHien_Profile.png'],avatarUrl:'/hiens-nha/resume/SuDuyHien_Profile.png',frame:'rounded',layout:'auto',leadVi:'Nội dung gốc',leadEn:'Original content',introVi:'Giữ nguyên',introEn:'Preserved'}}}));
  await context.route('**/auth/v1/settings',route=>route.fulfill({json:{external:{github:true,google:true,facebook:false}}}));
  await context.route('**/functions/v1/api/v1/**',route=>{
    const url=new URL(route.request().url());
    if(url.pathname.endsWith('/entities/resolve')) contexts.push(url.searchParams.get('path')!);
    const data=url.pathname.endsWith('/entities/resolve')?{id:'10000000-0000-0000-0000-000000000001',canonical_path:'/hiens-nha/music/'}
      :url.pathname.endsWith('/state')?{source:'api',epoch:1,writes_enabled:true}
      :url.pathname.endsWith('/home-profile')?null
      :{items:[],nextCursor:null};
    return route.fulfill({json:data,headers:{'access-control-allow-origin':'*'}});
  });
  await page.goto('/music/?category=instrumental#listen');
  await expect.poll(()=>contexts).toContain('/hiens-nha/music/');
  await page.locator('a[data-locale-link][lang="en"]').click();
  await expect(page).toHaveURL('/en/music/?category=instrumental#listen');
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  expect(await page.locator('[data-api-comments]').getAttribute('data-context')).toBe('/hiens-nha/music/');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.goto('/en/requests/');
  await expect(page.locator('a[href="https://github.com/sugia279/hiens-nha/blob/main/docs/project/requests.md"]')).toBeVisible();
  await page.goto('/');
  await expect(page.locator('[data-profile-avatar]')).toHaveAttribute('src','/resume/SuDuyHien_Profile.png');
  await expect(page.locator('.home-photos img')).toHaveAttribute('src','/resume/SuDuyHien_Profile.png');
  expect(await page.locator('[data-api-comments]').getAttribute('data-context')).toBe('/hiens-nha/');
  const authorize=context.waitForEvent('request',req=>new URL(req.url()).pathname.endsWith('/auth/v1/authorize'));
  await context.route('**/auth/v1/authorize?**',route=>route.fulfill({status:400,body:'Stubbed cancellation'}));
  await page.locator('[data-inline-sign-in]').click();
  const url=new URL((await authorize).url());
  expect(url.searchParams.get('redirect_to')).toBe('http://127.0.0.1:4321/account/callback/');
  expect(url.searchParams.get('provider')).toBe('github');
});
