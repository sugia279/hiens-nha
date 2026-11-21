import {readFileSync} from 'node:fs';
import {test,expect} from '@playwright/test';
import {provider} from './auth-helpers';
for(const prefix of ['','en/'])test(`status dialog: private photo, publish, hide and persistent login ${prefix||'vi'}`,async({page,context,browser})=>{
 await page.setViewportSize({width:390,height:844});await provider(context,'owner');await page.goto(`/hiens-nha/${prefix}`);await page.locator('[data-inline-sign-in]').click();await expect(page.locator('[data-home-thought]')).toBeEnabled();
 await page.locator('[data-home-thought]').click();const dialog=page.locator('[data-status-dialog]');await expect(dialog).toBeVisible();await expect(dialog.locator('.status-author')).toContainText('Hiển');
 await dialog.locator('textarea[name="body"]').fill('Unpublished status '+crypto.randomUUID());const body=await dialog.locator('textarea[name="body"]').inputValue();
 await dialog.locator('[data-social-toggle="people"]').click();await dialog.locator('[name="people"]').fill('Hương');await dialog.locator('[data-social-toggle="location"]').click();await dialog.locator('[name="location"]').fill('Đà Lạt');await dialog.locator('[data-social-toggle="feeling"]').click();await dialog.locator('[name="feeling"]').selectOption('grateful');
 await dialog.locator('[data-status-close]').click();await expect(dialog).not.toBeVisible();await page.locator('[data-home-thought]').click();await expect(dialog.locator('[name="body"]')).toHaveValue(body);
 // A valid one-pixel PNG is converted by the browser to WebP and uploaded to local Storage.
 const pickerPromise=page.waitForEvent('filechooser');await dialog.locator('[data-status-library]').click();const picker=await pickerPromise;await picker.setFiles({name:'fixture.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGPkL8tjYGBgYmBgYGBgAAALLwD3EqPsIgAAAABJRU5ErkJggg==','base64')});
 await expect(dialog.locator('[data-status-photos] img')).toHaveCount(1);await expect(dialog.locator('.media-state')).toHaveCount(0);
 await dialog.locator('[data-status-files]').setInputFiles({name:'fixture.webm',mimeType:'video/webm',buffer:Buffer.from(readFileSync('tests/fixtures/status-video.base64','utf8'),'base64')});
 await expect(dialog.locator('[data-status-photos] video')).toBeVisible();await expect(dialog.locator('.media-state')).toHaveCount(0);await dialog.locator('[name="layout"]').selectOption('two-square');await dialog.locator('[name="frame"]').selectOption('square');
 await expect(dialog.locator('[data-status-photos]')).toHaveAttribute('data-layout','two-square');
 await dialog.locator('[name="visibility"]').selectOption('hidden');await dialog.locator('[type="submit"]').click();await expect(dialog).not.toBeVisible();
 const card=page.locator('.social-post-card').filter({hasText:body});await expect(card).toBeVisible();await expect(card.locator('.post-photo-grid')).toHaveAttribute('data-layout','two-square');await expect(card.locator('video')).toBeVisible();await expect(card).toContainText(/Chỉ mình tôi|Only me/);const id=await card.getAttribute('data-publication-id');
 await page.reload();await expect(page.locator('[data-home-thought]')).toBeEnabled();await expect(card).toBeVisible();
 const guest=await browser.newContext();try{const visitor=await guest.newPage();await visitor.goto(`http://127.0.0.1:4321/hiens-nha/${prefix}community/post/?id=${id}`);await expect(visitor.locator('[data-publication-preview]')).not.toContainText(body);
  await card.getByRole('button',{name:/Sửa|Edit/}).click();await expect(dialog).toBeVisible();await expect(dialog.locator('[data-status-photos] img')).toHaveCount(1);await dialog.locator('[data-status-files]').setInputFiles({name:'IMG_001.MOV',mimeType:'video/quicktime',buffer:Buffer.from(readFileSync('tests/fixtures/status-video-mov.base64','utf8'),'base64')});
  await expect(dialog.locator('[data-status-photos] video')).toHaveCount(2);await expect(dialog.locator('.media-state')).toHaveCount(0);await dialog.locator('[name="layout"]').selectOption('three-top');
  await dialog.locator('[name="visibility"]').selectOption('public');await dialog.locator('[type="submit"]').click();await expect(dialog).not.toBeVisible();
  await visitor.reload();await expect(visitor.locator('[data-publication-preview]')).toContainText(body);await expect(visitor.locator('[data-publication-preview]')).toContainText('Đà Lạt');await expect(visitor.locator('.post-photo img')).toBeVisible();await expect(visitor.locator('.post-photo video')).toHaveCount(2);await expect(visitor.locator('.post-photo video').first()).toBeVisible();await expect(visitor.locator('.post-photo-grid')).toHaveAttribute('data-layout','three-top');
  await card.getByRole('button',{name:/Sửa|Edit/}).click();await expect(dialog.locator('[data-status-photos] img')).toHaveCount(1);await dialog.locator('[name="visibility"]').selectOption('hidden');await dialog.locator('[type="submit"]').click();await expect(dialog).not.toBeVisible();await visitor.reload();await expect(visitor.locator('[data-publication-preview]')).not.toContainText(body);
 }finally{await guest.close();}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
