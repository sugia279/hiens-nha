import { test, expect } from '@playwright/test';

test('API submission pages use on-site auth and omit GitHub continuation buttons in VI/EN', async ({ page }) => {
  for (const prefix of ['', 'en/']) {
    for (const route of ['guestbook', 'knowledge', 'music', 'requests']) {
      await page.goto(`/hiens-nha/${prefix}${route}/`);
      if (route === 'knowledge' || route === 'music') {
        await expect(page.locator(`[data-publications] a[href="/hiens-nha/${prefix}account/content/"]`)).toBeVisible();
      } else {
        await expect(page.locator('[data-sign-in]').first()).toBeVisible();
      }
      await expect(page.getByRole('button', { name: /Tiếp tục trên GitHub|Continue on GitHub/ })).toHaveCount(0);
      await expect(page.locator('#guestbook-form, #knowledge-form, #media-form, #request-form')).toHaveCount(0);
    }
    await page.goto(`/hiens-nha/${prefix}account/content/`);
    await expect(page.locator('[data-sign-in]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Tiếp tục trên GitHub|Continue on GitHub/ })).toHaveCount(0);
  }
});
