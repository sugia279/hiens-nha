import { test, expect } from '@playwright/test';

for (const prefix of ['', 'en/']) {
  for (const width of [390, 820, 1440]) {
    test(`cover search and photo viewer: ${prefix || 'vi/'} at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/hiens-nha/${prefix}`);
      const cover = page.locator('.home-cover');
      const search = page.locator('[data-cover-search]');
      const trigger = search.locator('summary');
      const input = search.locator('input[name="q"]');
      await expect(input).not.toBeVisible();
      await trigger.focus();
      await page.keyboard.press('Enter');
      await expect(input).toBeFocused();
      const coverBox = (await cover.boundingBox())!;
      const formBox = (await search.locator('form').boundingBox())!;
      expect(formBox.x).toBeGreaterThanOrEqual(coverBox.x);
      expect(formBox.x + formBox.width).toBeLessThanOrEqual(coverBox.x + coverBox.width + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.keyboard.press('Escape');
      await expect(input).not.toBeVisible();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await page.locator('.house-lead').click();
      await expect(input).not.toBeVisible();
      await cover.locator('a[data-photo-full]').first().click();
      await expect(page.locator('#photo-viewer')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#photo-viewer')).not.toBeVisible();
      await trigger.click();
      await input.fill('Playwright');
      await input.press('Enter');
      await expect(page).toHaveURL(new RegExp(`/hiens-nha/${prefix}search/\\?q=Playwright$`));
      await expect(page.locator('#search-result-list li').first()).toBeVisible();
      await page.goBack();
      await expect(page.locator('[data-cover-search] input')).not.toBeVisible();
      await page.locator('[data-cover-search] summary').click();
      await expect(page.locator('#home-search-input')).toBeFocused();
    });
  }
  test(`cover search remains usable without JavaScript: ${prefix || 'vi/'}`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL: 'http://127.0.0.1:4321' });
    try {
      const page = await context.newPage();
      await page.goto(`/hiens-nha/${prefix}`);
      await page.locator('[data-cover-search] summary').click();
      await page.locator('#home-search-input').fill('Playwright');
      await page.locator('[data-cover-search] button[type="submit"]').click();
      await expect(page).toHaveURL(new RegExp(`/hiens-nha/${prefix}search/\\?q=Playwright$`));
    } finally { await context.close(); }
  });
}
