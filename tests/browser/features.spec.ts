import { test, expect } from '@playwright/test';
import { provider, login } from './auth-helpers';
test('posts/media and requests: author saves, owner reviews and scope changes need acceptance again', async ({
  browser,
}) => {
  const ac = await browser.newContext(),
    oc = await browser.newContext(),
    vc = await browser.newContext();
  await provider(ac, 'B');
  await provider(oc, 'owner');
  const a = await ac.newPage(),
    o = await oc.newPage(),
    v = await vc.newPage();
  await a.goto('/hiens-nha/account/content/');
  await login(a);
  const editor = a.locator('[data-publications]');
  const title = 'Browser poem ' + Date.now();
  await editor.locator('[name=title]').fill(title);
  await editor
    .locator('[name=body]')
    .fill('Dòng một\nDòng hai\n<img src=x onerror=alert(1)>');
  await editor.locator('[name=kind]').selectOption('poem');
  await expect(editor.locator('[data-feature-status]')).toContainText(
    'Đã lưu nháp',
  );
  await expect(editor.locator('[data-publication-preview] img')).toHaveCount(0);
  await editor.locator('[data-submit-review]').click();
  await expect(editor.locator('[data-feature-status]')).toContainText(
    'Đã lưu thao tác',
  );
  await o.goto('/hiens-nha/admin/');
  await login(o);
  const queue = o.locator('[data-publications]');
  const card = queue.locator('.publication-card').filter({ hasText: title });
  await expect(card).toBeVisible();
  await card
    .getByRole('textbox', { name: 'Lý do duyệt nội dung' })
    .fill('Poem reviewed');
  await card.getByRole('button', { name: 'Duyệt', exact: true }).click();
  await expect(card).toHaveCount(0);
  await v.goto('/hiens-nha/en/knowledge/');
  const published = v.locator('.publication-card').filter({ hasText: title });
  await expect(published).toBeVisible();
  const href = await published.getByRole('link').getAttribute('href');
  await v.goto(href!);
  await expect(v.locator('[data-publication-preview]')).toContainText(
    'Dòng hai',
  );
  await expect(v.locator('[data-publication-preview] img')).toHaveCount(0);
  // Refresh My Content in the same memory-only session, then edit the approved revision.
  await editor.locator('[data-feature-refresh]').click();
  await editor
    .locator('.publication-card')
    .filter({ hasText: title })
    .getByRole('button', { name: 'Sửa bản của tôi' })
    .click();
  await editor.locator('[name=body]').fill('New private text');
  await expect(editor.locator('[data-feature-status]')).toContainText(
    'Đã lưu nháp',
  );
  await v.locator('[data-feature-refresh]').click();
  await expect(v.locator('[data-publication-preview]')).toContainText(
    'Dòng hai',
  );
  await expect(v.locator('[data-publication-preview]')).not.toContainText(
    'New private text',
  );
  await editor.locator('[data-feature-select]').selectOption('media');
  await editor.locator('[name=title]').fill('Browser media ' + Date.now());
  await editor.locator('[name=url]').fill('https://youtu.be/l5WuCFObGGQ');
  await editor.getByRole('button', { name: 'Lưu nháp', exact: true }).click();
  await expect(editor.locator('[data-feature-status]')).toContainText(
    'Đã lưu nháp',
  );
  await expect(
    editor.locator('[data-publication-preview] iframe'),
  ).toHaveAttribute(
    'src',
    'https://www.youtube-nocookie.com/embed/l5WuCFObGGQ',
  );
  await a.goto('/hiens-nha/requests/');
  await login(a);
  const board = a.locator('[data-api-requests]');
  await board.locator('[data-request-new]').click();
  const requestTitle = 'Browser request ' + Date.now();
  await board.locator('[name=title]').fill(requestTitle);
  await board
    .locator('[name=description]')
    .fill('Please prepare a documented local test');
  await board.locator('[name=expectedResult]').fill('A verified result');
  await board.getByRole('button', { name: 'Lưu yêu cầu', exact: true }).click();
  await expect(board.locator('[data-request-status]')).toContainText('Đã lưu');
  const requestHref = await board
    .getByRole('link', { name: 'Xem yêu cầu vừa gửi' })
    .getAttribute('href');
  const requests = o.locator('[data-api-requests]');
  await requests.locator('[data-request-refresh]').click();
  const req = requests
    .locator('.api-request-card')
    .filter({ hasText: requestTitle });
  await expect(req).toBeVisible();
  await req
    .getByRole('textbox', { name: 'Nội dung cập nhật / lý do' })
    .fill('Publish only');
  await req
    .getByRole('button', { name: 'Công khai: approved', exact: true })
    .click();
  await expect(req).toContainText('Chờ tiếp nhận');
  await req
    .getByRole('textbox', { name: 'Nội dung cập nhật / lý do' })
    .fill('Accepted scope');
  await req
    .getByRole('combobox', { name: 'Tiến độ mới' })
    .selectOption('accepted');
  await req
    .getByRole('button', { name: 'Cập nhật tiến độ', exact: true })
    .click();
  await expect(req).toContainText('Đã nhận');
  await a.goto(requestHref!);
  await login(a);
  const detail = a.locator('[data-api-requests]');
  await expect(detail.locator('[data-request-detail]')).toContainText(
    'accepted',
  );
  await detail
    .locator('[name=description]')
    .fill('Changed scope: add another substantial task');
  await detail
    .getByRole('button', { name: 'Lưu yêu cầu', exact: true })
    .click();
  await expect(detail.locator('[data-request-detail]')).toContainText(
    'scope 2',
  );
  await expect(detail.locator('[data-request-detail]')).toContainText(
    'accepted —',
  );
  await v.goto('/hiens-nha/en/requests/14/');
  await expect(v.locator('[data-request-detail]')).toContainText(
    'Ask For Help',
  );
  await Promise.all([ac.close(), oc.close(), vc.close()]);
});
