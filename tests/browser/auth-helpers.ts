import { expect, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(
  readFileSync('backend-test-results/sessions.json', 'utf8'),
);
export async function provider(
  context: BrowserContext,
  role: 'A' | 'B' | 'owner',
) {
  // Only provider/code exchange is mocked. Sessions are real local Auth-issued tokens;
  // every comments/role/moderation request goes through real Edge + Auth + PostgREST + PostgreSQL.
  await context.route('**/auth/v1/authorize?**', async (route) => {
    const url = new URL(route.request().url());
    expect(!!url.searchParams.get('code_challenge')).toBe(true);
    const callback = new URL(url.searchParams.get('redirect_to')!);
    callback.searchParams.set('code', 'local-test-provider-code');
    await route.fulfill({ status: 302, headers: { location: callback.href } });
  });
  await context.route('**/auth/v1/token?grant_type=pkce', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': 'http://127.0.0.1:4321',
          'access-control-allow-methods': 'POST,OPTIONS',
          'access-control-allow-headers':
            'authorization,apikey,content-type,x-client-info,x-supabase-api-version',
        },
      });
      return;
    }
    expect(!!route.request().postDataJSON().code_verifier).toBe(true);
    await route.fulfill({
      json: fixture.sessions[role],
      headers: { 'access-control-allow-origin': 'http://127.0.0.1:4321' },
    });
  });
}
export async function login(page: Page) {
  await page
    .getByRole('button', { name: /Đăng nhập bằng GitHub|Sign in with GitHub/ })
    .click();
  await expect(page.locator('[data-auth-status]')).toContainText(
    /Đã đăng nhập|Đã xác minh|Signed in|Owner verified/,
  );
}
