import { test, expect } from '@playwright/test';
import { defaultCategories } from '../../src/lib/content-categories';
import { homeAuthorId } from '../../src/config/home-feed';
for (const locale of ['vi', 'en'])
  test(`owner logs out on the current public Home and can explicitly sign in again (${locale})`, async ({
    page,
    context,
  }) => {
    const path = `/hiens-nha/${locale === 'en' ? 'en/' : ''}`;
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
    };
    const token = [
      'eyJhbGciOiJIUzI1NiJ9',
      Buffer.from(
        JSON.stringify({
          sub: homeAuthorId,
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString('base64url'),
      'fixture',
    ].join('.');
    let logins = 0;
    await context.route('**/auth/v1/authorize?**', async (route) => {
      logins++;
      const url = new URL(route.request().url()),
        callback = new URL(url.searchParams.get('redirect_to')!);
      callback.searchParams.set('code', 'owner-code');
      await route.fulfill({
        status: 302,
        headers: { location: callback.href },
      });
    });
    await context.route('**/auth/v1/token?grant_type=pkce', (r) =>
      r.fulfill({
        json: {
          access_token: token,
          refresh_token: 'owner-refresh',
          token_type: 'bearer',
          expires_in: 3600,
          user: { id: homeAuthorId },
        },
        headers,
      }),
    );
    await context.route('**/auth/v1/logout?**', (r) =>
      r.fulfill({ status: 204, headers }),
    );
    const post = {
      id: '20000000-0000-0000-0000-000000000031',
      entity_id: '20000000-0000-0000-0000-000000000031',
      author_id: homeAuthorId,
      feature: 'posts',
      status: 'approved',
      version: 1,
      revision: 1,
      published_revision: 1,
      created_at: '2026-11-26T10:00:00Z',
      payload: {
        title: 'Owner fixture',
        body: 'Text',
        kind: 'note',
        category: 'Test',
        tags: [],
      },
    };
    await context.route('**/rest/v1/rpc/**', (r) =>
      r.fulfill({
        json: r.request().url().endsWith('content_categories_read')
          ? defaultCategories
          : r.request().url().endsWith('post_reactions_read')
            ? []
            : { version: 0, value: null },
        headers,
      }),
    );
    await context.route('**/functions/v1/api/v1/**', (r) => {
      if (r.request().method() === 'OPTIONS')
        return r.fulfill({ status: 204, headers });
      const url = new URL(r.request().url());
      if (url.pathname.endsWith('/me'))
        return r.fulfill(
          r.request().headers().authorization === `Bearer ${token}`
            ? { json: { id: homeAuthorId, role: 'owner' }, headers }
            : { status: 401, json: { code: 'UNAUTHENTICATED' }, headers },
        );
      return r.fulfill({
        json: url.pathname.endsWith('/state')
          ? {
              source: 'api',
              epoch: 1,
              writes_enabled: true,
              writesEnabled: true,
            }
          : url.pathname.endsWith('/posts')
            ? { items: [post], nextCursor: null }
            : { items: [], nextCursor: null },
        headers,
      });
    });
    await page.goto(path);
    await page.locator('[data-inline-sign-in]').click();
    await expect(page.locator('[data-owner-sign-out]')).toBeVisible();
    await expect(page.locator('[data-home-thought]')).toBeEnabled();
    await expect(page.locator('[data-delete-post]')).toBeVisible();
    await page.locator('[data-owner-sign-out]').click();
    await expect(page.locator('[data-owner-sign-out]')).toBeHidden();
    await expect(page.locator('[data-home-thought]')).toBeDisabled();
    await expect(page.locator('[data-delete-post]')).toHaveCount(0);
    expect(page.url()).toBe(`http://127.0.0.1:4321${path}`);
    expect(logins).toBe(1);
    expect(
      await page.evaluate(() =>
        [...Object.values(localStorage), ...Object.values(sessionStorage)].join(
          '',
        ),
      ),
    ).not.toContain('owner-refresh');
    await page.reload();
    await expect(page.locator('[data-inline-sign-in]')).toBeEnabled();
    await expect(page.locator('[data-owner-sign-out]')).toBeHidden();
    expect(logins).toBe(1);
    await page.locator('[data-inline-sign-in]').click();
    await expect(page.locator('[data-owner-sign-out]')).toBeVisible();
    expect(logins).toBe(2);
  });
