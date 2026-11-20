import { test, expect } from '@playwright/test';
import { defaultCategories } from '../../src/lib/content-categories';
import { homeAuthorId } from '../../src/config/home-feed';

for (const locale of ['vi', 'en'])
  test(`inline reactions, comments, OAuth and copy link (${locale})`, async ({
    page,
    context,
  }) => {
    const path = `/hiens-nha/${locale === 'en' ? 'en/' : ''}`;
    const actor = '10000000-0000-0000-0000-000000000001';
    const postId = '20000000-0000-0000-0000-000000000001';
    const otherId = '20000000-0000-0000-0000-000000000002';
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
    };
    const token = [
      'eyJhbGciOiJIUzI1NiJ9',
      Buffer.from(
        JSON.stringify({
          sub: actor,
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ).toString('base64url'),
      'fixture',
    ].join('.');
    let mine: string | null = null;
    const writes: unknown[] = [];
    const counts = (id = postId) => ({
      post_id: id,
      heart: mine === 'heart' ? 1 : 0,
      laugh: mine === 'laugh' ? 1 : 0,
      wow: mine === 'wow' ? 1 : 0,
      mine: id === postId ? mine : null,
    });
    await context.route('**/auth/v1/settings', (r) =>
      r.fulfill({
        json: { external: { github: true, google: true, facebook: false } },
        headers,
      }),
    );
    await context.route('**/auth/v1/authorize?**', async (r) => {
      const url = new URL(r.request().url());
      expect(url.searchParams.get('provider')).toBe('google');
      expect(url.searchParams.has('code_challenge')).toBe(true);
      const callback = new URL(url.searchParams.get('redirect_to')!);
      expect(callback.pathname).toBe(`${path}account/callback/`);
      callback.searchParams.set('code', 'fixture-code');
      await r.fulfill({ status: 302, headers: { location: callback.href } });
    });
    await context.route('**/auth/v1/token?grant_type=pkce', (r) =>
      r.fulfill({
        json: {
          access_token: token,
          refresh_token: 'fixture-refresh',
          provider_token: 'never-store-provider-token',
          token_type: 'bearer',
          expires_in: 3600,
          user: { id: actor },
        },
        headers,
      }),
    );
    await context.route('**/rest/v1/rpc/**', async (r) => {
      if (r.request().method() === 'OPTIONS')
        return r.fulfill({ status: 204, headers });
      const name = new URL(r.request().url()).pathname.split('/').at(-1);
      if (name === 'post_reaction_set') {
        expect(r.request().headers().authorization).toBe(`Bearer ${token}`);
        const body = r.request().postDataJSON();
        writes.push(body);
        mine = body.p_reaction;
        return r.fulfill({ json: counts(), headers });
      }
      const json =
        name === 'post_reactions_read'
          ? r
              .request()
              .postDataJSON()
              .p_ids.map((id: string) => counts(id))
          : name === 'content_categories_read'
            ? defaultCategories
            : { version: 0, value: null };
      return r.fulfill({ json, headers });
    });
    const posts = [postId, otherId].map((id) => ({
      id,
      entity_id: id,
      author_id: homeAuthorId,
      feature: 'posts',
      status: 'approved',
      version: 1,
      revision: 1,
      published_revision: 1,
      created_at: '2026-11-20T10:00:00Z',
      payload: {
        title: 'Một ngày bình yên',
        body: 'Hôm nay trời đẹp.\n<img src=x onerror=alert(1)>',
        category: 'Nhật ký',
        tags: ['cuoc-song'],
        kind: 'note',
      },
    }));
    const comment = {
      id: '30000000-0000-0000-0000-000000000001',
      entity_id: postId,
      author_id: actor,
      parent_id: null,
      body: 'Bình luận ngay dưới bài viết <script>unsafe</script>',
      status: 'approved',
      version: 1,
      created_at: '2026-11-20T10:00:00Z',
    };
    await context.route('**/functions/v1/api/v1/**', async (r) => {
      if (r.request().method() === 'OPTIONS')
        return r.fulfill({ status: 204, headers });
      const url = new URL(r.request().url());
      const json = url.pathname.endsWith('/me')
        ? { id: actor, role: 'member' }
        : url.pathname.endsWith('/state')
          ? { source: 'api', epoch: 1, writes_enabled: true }
          : url.pathname.endsWith('/posts')
            ? { items: posts, nextCursor: null }
            : url.pathname.includes('/comments')
              ? {
                  items: [
                    {
                      ...comment,
                      entity_id: url.pathname.includes(otherId)
                        ? otherId
                        : postId,
                    },
                  ],
                  nextCursor: null,
                }
              : url.pathname.includes('/entities/resolve')
                ? { id: postId }
                : { items: [], nextCursor: null };
      return r.fulfill({ json, headers });
    });
    await page.goto(path);
    const card = page.locator(`[data-publication-id="${postId}"]`);
    await expect(card).toBeVisible();
    await card.locator('[data-reaction="heart"]').click();
    await expect(page.locator('[data-login-dialog]')).toBeVisible();
    await expect(
      page.locator('[data-login-provider="facebook"]'),
    ).toBeDisabled();
    expect(writes).toEqual([]);
    await page.keyboard.press('Escape');
    await card.locator('[data-post-comments]').click();
    await expect(page.locator('[data-login-dialog]')).toBeVisible();
    await expect(card.locator('.comment-text')).toContainText(
      'Bình luận ngay dưới bài viết',
    );
    expect(page.url()).toBe(`http://127.0.0.1:4321${path}`);
    await page.keyboard.press('Escape');
    await card
      .getByRole('button', {
        name: locale === 'vi' ? 'Trả lời' : 'Reply',
        exact: true,
      })
      .click();
    await expect(page.locator('[data-login-dialog]')).toBeVisible();
    await page.locator('[data-login-provider="google"]').click();
    await expect(page.locator('[data-login-dialog]')).toHaveCount(0);
    await expect(card.locator('[data-comment-form]')).toBeVisible();
    await expect(card.locator('[data-compose-context]')).toContainText(
      locale === 'vi' ? 'Trả lời' : 'Reply to',
    );
    await card.locator('[data-reaction="heart"]').click();
    await expect(card.locator('[data-reaction="heart"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await card.locator('[data-reaction="laugh"]').click();
    await expect(card.locator('[data-reaction="laugh"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await card.locator('[data-reaction="laugh"]').click();
    await expect(card.locator('[data-reaction="laugh"]')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await page
      .locator(`[data-publication-id="${otherId}"] [data-post-comments]`)
      .click();
    expect(
      await page
        .locator('[data-home-feed] .post-inline-comments textarea')
        .evaluateAll((nodes) => new Set(nodes.map((n) => n.id)).size),
    ).toBe(2);
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (value: string) => {
            (window as any).__copied = value;
          },
        },
      }),
    );
    await card.locator('[data-post-share]').click();
    expect(await page.evaluate(() => (window as any).__copied)).toBe(
      `http://127.0.0.1:4321${path}community/post/?id=${postId}#post-comments`,
    );
    expect(
      await page.evaluate(() => Object.values(localStorage).join('')),
    ).not.toContain('never-store-provider-token');
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await card
        .locator('.post-card-footer')
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    if (locale === 'vi')
      await card.screenshot({
        path: 'backend-test-results/inline-post-mobile.png',
      });
    await page.reload();
    await expect(card).toBeVisible();
    await card.locator('[data-reaction="wow"]').click();
    await expect(card.locator('[data-reaction="wow"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(writes).toHaveLength(4);
  });
