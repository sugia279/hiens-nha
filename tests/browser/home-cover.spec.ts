import { test, expect } from '@playwright/test';

for (const width of [390, 820, 1440]) {
  test(`one to four cover photos fill the banner at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/hiens-nha/');
    // Exercise each layout with the same build-selected count/anchors. Selection
    // from photo metadata is covered separately by unit and built-page smoke tests.
    for (const count of [4, 3, 2, 1]) {
      await page.locator('.home-photos').evaluate((gallery, count) => {
        const photos = [...gallery.querySelectorAll('a[data-photo-full]')];
        photos.slice(count).forEach(photo => photo.remove());
        gallery.setAttribute('data-photo-count', String(count));
      }, count);
      const gallery = page.locator('.home-photos');
      await expect(gallery.locator('img')).toHaveCount(count);
      const frame = (await gallery.boundingBox())!;
      let filledArea = 0;
      for (const photo of await gallery.locator('a[data-photo-full]').all()) {
        const rect = (await photo.boundingBox())!;
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.height).toBeGreaterThan(0);
        expect(rect.x).toBeGreaterThanOrEqual(frame.x - 1);
        expect(rect.y).toBeGreaterThanOrEqual(frame.y - 1);
        expect(rect.x + rect.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
        expect(rect.y + rect.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
        filledArea += rect.width * rect.height;
      }
      expect(filledArea / (frame.width * frame.height)).toBeGreaterThan(.94);
      expect(filledArea / (frame.width * frame.height)).toBeLessThanOrEqual(1.01);
    }
  });
}

for (const prefix of ['', 'en/']) {
  for (const width of [390, 820, 1440]) {
    test(`cover search and photo viewer: ${prefix || 'vi/'} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/hiens-nha/${prefix}`);
      const cover = page.locator('.home-cover');
      await expect(page.locator('.topbar #topbar-search-input')).toBeVisible();
      await expect(page.locator('.topbar .site-identity')).toContainText('Hiên Nhà');
      await expect(page.locator('.home-composer [data-home-thought]')).toBeVisible();
      const intro = (await page.locator('[data-profile-intro]').boundingBox())!;
      const avatar = (await page.locator('.home-avatar').boundingBox())!;
      if (width >= 768) expect(intro.x).toBeGreaterThan(avatar.x + avatar.width);
      await expect(page.locator('[data-edit-profile]')).not.toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await cover.locator('a[data-photo-full]').first().focus();
      expect(await cover.locator('a[data-photo-full]').first().evaluate(el=>getComputedStyle(el).outlineOffset)).toBe('-4px');
      await cover.locator('a[data-photo-full]').first().click();
      await expect(page.locator('#photo-viewer')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#photo-viewer')).not.toBeVisible();
      const input = page.locator('#topbar-search-input');
      await input.fill('Playwright');
      await input.press('Enter');
      await expect(page).toHaveURL(new RegExp(`/hiens-nha/${prefix}search/\\?q=Playwright$`));
      await expect(page.locator('#search-result-list li').first()).toBeVisible();
      await page.goBack();
      await expect(page.locator('#topbar-search-input')).toBeVisible();
    });
  }
  test(`cover search remains usable without JavaScript: ${prefix || 'vi/'}`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: 'http://127.0.0.1:4321' });
    try {
      const page = await context.newPage();
      await page.goto(`/hiens-nha/${prefix}`);
      await page.locator('#topbar-search-input').fill('Playwright');
      await page.locator('.topbar button[type="submit"]').click();
      await expect(page).toHaveURL(new RegExp(`/hiens-nha/${prefix}search/\\?q=Playwright$`));
    } finally { await context.close(); }
  });
}
