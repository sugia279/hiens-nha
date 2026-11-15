import { test, expect } from '@playwright/test';
// UI-only session continuity regression. DB/JWT/OAuth authority is exercised separately
// by the existing disposable-stack browser/integration suites, not by these stubs.
test('same-tab navigation retains memory-only login, remounts UI and logout survives history', async ({ page, context }) => {
  const token = ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ sub: '10000000-0000-0000-0000-000000000003', exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url'), 'local_ui_fixture'].join('.');
  await context.route('**/auth/v1/authorize?**', async route => {
    const url = new URL(route.request().url()); expect(url.searchParams.has('code_challenge')).toBe(true);
    const callback = new URL(url.searchParams.get('redirect_to')!); callback.searchParams.set('code','local-ui-code');
    await route.fulfill({ status:302,headers:{location:callback.href} });
  });
  await context.route('**/auth/v1/token?grant_type=pkce', route => route.fulfill({ json: {access_token:token,refresh_token:'local_ui_refresh',token_type:'bearer',expires_in:3600,user:{id:'10000000-0000-0000-0000-000000000003'}},headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'} }));
  await context.route('**/functions/v1/api/v1/**', route => {
    const url = new URL(route.request().url());
    if (route.request().method()==='OPTIONS') return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'}});
    const data = url.pathname.endsWith('/me') ? {id:'10000000-0000-0000-0000-000000000003',role:'owner'}
      : url.pathname.endsWith('/state') ? {source:'api',epoch:1,writesEnabled:false}
      : {items:[],nextCursor:null};
    return route.fulfill({json:data,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'}});
  });
  await context.route('**/auth/v1/logout?**', route => route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,OPTIONS'}}));
  await page.goto('/hiens-nha/account/');
  await page.locator('[data-sign-in]').click();
  await expect(page.locator('[data-auth-status]')).toContainText('Đã xác minh');
  expect(await page.evaluate(() => [...Object.values(localStorage),...Object.values(sessionStorage)].some(v => /access_token|refresh_token|local_ui_refresh/.test(v)))).toBe(false);
  await page.evaluate(() => { (window as any).__navigationProbe='same-realm'; });
  await page.locator('a[href="/hiens-nha/account/content/"]').click();
  await expect(page).toHaveURL(/account\/content\/$/);
  await expect(page.locator('[data-auth-status]')).toContainText('Đã xác minh');
  await page.locator('a[data-locale-link][lang="en"]').click();
  await expect(page.locator('html')).toHaveAttribute('lang','en');
  await expect(page.locator('[data-auth-status]')).toContainText('Owner verified');
  expect(await page.evaluate(() => (window as any).__navigationProbe)).toBe('same-realm');
  await page.locator('[data-sign-out]').click();
  await expect(page.locator('[data-sign-in]')).toBeVisible();
  await page.goBack();
  await expect(page.locator('[data-sign-in]')).toBeVisible();
  expect(await page.evaluate(() => [...Object.values(localStorage),...Object.values(sessionStorage)].some(v => /access_token|refresh_token|local_ui_refresh/.test(v)))).toBe(false);
  await page.reload();
  await expect(page.locator('[data-sign-in]')).toBeVisible();
});

test('menu, photo viewer and search remount after internal navigation', async ({ page }) => {
  page.setDefaultTimeout(10000);
  console.log('navigation-stage: photos-vi');
  await page.goto('/hiens-nha/');
  await page.evaluate(() => { (window as any).__navigationProbe='widgets'; });
  await page.locator('#sidebar a[href="/hiens-nha/photos/"]').first().click();
  await expect(page).toHaveURL(/\/photos\/$/);
  await page.locator('a[data-photo-full]').first().click();
  await expect(page.locator('#photo-viewer')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#photo-viewer')).not.toBeVisible();
  console.log('navigation-stage: photos-en');
  await page.locator('a[data-locale-link][lang="en"]').click();
  await page.locator('a[data-photo-full]').first().click();
  await expect(page.locator('#photo-viewer')).toBeVisible();
  await page.keyboard.press('Escape');
  console.log('navigation-stage: mobile-menu');
  await page.setViewportSize({width:390,height:844});
  await page.locator('#sidebar-toggle').click();
  await expect(page.locator('.app-shell')).not.toHaveClass(/is-collapsed/);
  const main = await page.locator('#main-content').boundingBox();
  expect(main).not.toBeNull();
  await page.mouse.click(main!.x + main!.width - 8, main!.y + 20);
  await expect(page.locator('.app-shell')).toHaveClass(/is-collapsed/);
  console.log('navigation-stage: search');
  const search=page.locator('header input[name="q"]');
  await search.fill('Playwright'); await search.press('Enter');
  await expect(page).toHaveURL(/\/search\/\?q=Playwright/);
  await expect(page.locator('#search-result-list li').first()).toBeVisible();
  console.log('navigation-stage: search-history');
  await expect(page.locator('#sidebar-toggle')).toHaveAttribute('aria-expanded','false');
  await page.locator('#sidebar-toggle').click();
  await expect(page.locator('#sidebar-toggle')).toHaveAttribute('aria-expanded','true');
  await page.locator('#sidebar a[href$="/photos/"]').first().click();
  await expect(page).toHaveURL(/\/photos\/$/);
  await page.goBack();
  await expect(page.locator('#search-result-list li').first()).toBeVisible();
  expect(await page.evaluate(() => (window as any).__navigationProbe)).toBe('widgets');
});
