import { test, expect, type Page } from '@playwright/test';
import { provider, login } from './auth-helpers';
const comments=(page:Page)=>page.locator('[data-api-comments]');
const reload=(page:Page)=>page.locator('[data-comments-refresh]').click();
const rootFor=(page:Page,text:string)=>comments(page).locator('[data-comment-list] > .api-comment').filter({has:page.locator('.comment-text').filter({hasText:text})}).first();
const options=async(row:ReturnType<typeof rootFor>)=>{await row.locator(':scope > .comment-content > .comment-line > .comment-menu > summary').click();};

test('comments publish immediately, preserve owner hiding, share the locale thread and clear drafts on logout',async({browser})=>{
  const aContext=await browser.newContext(),oContext=await browser.newContext(),publicContext=await browser.newContext();
  await provider(aContext,'A');await provider(oContext,'owner');
  const a=await aContext.newPage(),owner=await oContext.newPage(),visitor=await publicContext.newPage();
  await a.goto('/hiens-nha/music/');await login(a);
  const text='Social <img src=x onerror=alert(1)> '+Date.now();
  await a.locator('#comment-body').fill(text);await a.locator('[data-comment-save]').click();
  await expect(a.locator('[data-comments-status]')).toContainText('Đã gửi');
  await expect(comments(a).locator('.comment-text img')).toHaveCount(0);
  await visitor.goto('/hiens-nha/music/');await expect(comments(visitor)).toContainText(text);
  const root=rootFor(a,text);
  await root.getByRole('button',{name:'Trả lời',exact:true}).click();
  const replyText='Immediate reply '+Date.now();
  await a.locator('#comment-body').fill(replyText);await a.locator('[data-comment-save]').click();
  await expect(root.locator('.comment-replies')).toContainText(replyText);
  await visitor.goto('/hiens-nha/en/music/');
  await rootFor(visitor,text).getByRole('button',{name:'Show replies',exact:true}).click();
  await expect(comments(visitor)).toContainText(replyText);
  await options(root);await root.getByRole('button',{name:'Sửa',exact:true}).first().click();
  const edited='Edited visible '+Date.now();await a.locator('#comment-body').fill(edited);await a.locator('[data-comment-save]').click();
  await expect(a.locator('[data-comments-status]')).toContainText('Đã gửi');
  await reload(visitor);await expect(comments(visitor)).toContainText(edited);
  await owner.goto('/hiens-nha/music/');await login(owner);
  const ownerRoot=rootFor(owner,edited);await options(ownerRoot);
  await ownerRoot.getByRole('textbox',{name:'Lý do duyệt/ẩn'}).first().fill('Hide disposable test comment');
  await ownerRoot.getByRole('button',{name:'Ẩn',exact:true}).first().click();
  await expect(owner.locator('[data-comments-status]')).toContainText('Đã cập nhật');
  await reload(visitor);await expect(comments(visitor)).not.toContainText(edited);await expect(comments(visitor)).not.toContainText(replyText);
  await reload(a);const hiddenRoot=rootFor(a,edited);await options(hiddenRoot);
  await hiddenRoot.getByRole('button',{name:'Sửa',exact:true}).first().click();
  const hiddenEdit='Hidden edit '+Date.now();await a.locator('#comment-body').fill(hiddenEdit);await a.locator('[data-comment-save]').click();
  await expect(a.locator('[data-comments-status]')).toContainText('vẫn đang ẩn');
  await reload(visitor);await expect(comments(visitor)).not.toContainText(hiddenEdit);
  await reload(owner);const deletable=rootFor(owner,hiddenEdit);await options(deletable);
  await expect(deletable.getByRole('button',{name:'Sửa',exact:true})).toHaveCount(0);
  owner.once('dialog',dialog=>dialog.accept());await deletable.getByRole('button',{name:'Xóa',exact:true}).first().click();
  await expect(owner.locator('[data-comments-status]')).toContainText('Đã xóa');await expect(comments(owner)).not.toContainText(hiddenEdit);
  await a.locator('#comment-body').fill('unsaved private draft');
  await a.goto('/hiens-nha/account/');await a.getByRole('button',{name:'Đăng xuất',exact:true}).click();
  await a.goto('/hiens-nha/music/');await expect(comments(a)).not.toContainText(hiddenEdit);await expect(a.locator('#comment-body')).toHaveValue('');
  expect(await a.evaluate(()=>[...Object.values(localStorage),...Object.values(sessionStorage)].some(v=>v.includes('access_token')||v.includes('refresh_token')))).toBe(false);
  await Promise.all([aContext.close(),oContext.close(),publicContext.close()]);
});

test('Home displays one discussion and expands its composer without navigation',async({page})=>{
  for(const prefix of ['', 'en/']){
    await page.goto(`/hiens-nha/${prefix}`);
    await expect(comments(page)).toHaveCount(1);
    await expect(page.locator('main .room-card, main .house-note, main .home-feed-title')).toHaveCount(0);
    const composer=page.locator('#home-comments-composer');await expect(composer).toBeHidden();
    const url=page.url();await page.locator('[data-open-home-comments]').click();
    await expect(composer).toBeVisible();expect(page.url()).toBe(url);
    await expect(composer.locator('[data-sign-in]')).toBeVisible();
    await expect(page.locator('[data-open-home-comments]')).toHaveAttribute('aria-expanded','true');
  }
});
