import { test,expect } from '@playwright/test';
import { provider } from './auth-helpers';
test('owner signs in from Home without leaving it and opens the profile dialog',async({page,context})=>{
 await provider(context,'owner');
 await page.goto('/hiens-nha/');
 await page.locator('[data-inline-sign-in]').click();
 await expect(page.locator('[data-home-thought]')).toBeEnabled();
 await expect(page).toHaveURL(/\/hiens-nha\/$/);
 await expect(page.locator('[data-edit-profile]')).toBeVisible();
 await page.locator('[data-edit-profile]').click();
 await expect(page.locator('[data-profile-dialog]')).toBeVisible();
 await expect(page.locator('[data-profile-form] select[name="frame"] option')).toHaveCount(3);
 await page.locator('[data-profile-form] [name="frame"]').selectOption('polaroid');
 await page.locator('[data-profile-form] [name="layout"]').selectOption('four-left');
 await expect(page.locator('[data-profile-preview] .profile-photo-grid')).toHaveAttribute('data-layout','four-left');
 // Preview and the published banner must share fill/spacing for every border.
 for(const frame of ['rounded','square','polaroid']){
  await page.locator('[data-profile-form] [name="frame"]').selectOption(frame);
  const preview=page.locator('[data-profile-preview] .profile-photo-grid');
  expect(await preview.evaluate(el=>getComputedStyle(el).gap)).toBe(frame==='square'?'0px':'2px');
  for(const image of await preview.locator('img').all()){
   expect(await image.evaluate(el=>getComputedStyle(el).objectFit)).toBe('cover');
  }
 }
 const fourth=page.locator('[data-profile-form] [name="image3"]');
 const originalFourth=await fourth.inputValue();
 await fourth.fill('');
 await expect(page.locator('[data-profile-form] [name="layout"]')).toHaveValue('auto');
 await expect(page.locator('[data-layout-status]')).toContainText('tự động');
 await expect(page.locator('[data-profile-form] option[value="four-left"]')).toBeDisabled();
 await expect(page.locator('.home-photos img')).toHaveCount(4);
 await fourth.fill(originalFourth);
 await page.locator('[data-profile-form] [name="leadVi"]').fill('Xem trước, không lưu');
 await page.locator('[data-profile-cancel]').click();
 await expect(page.locator('[data-profile-dialog]')).not.toBeVisible();
 await expect(page.locator('[data-profile-lead]')).not.toContainText('Xem trước, không lưu');
 await page.locator('[data-edit-profile]').click();
 await expect(page.locator('[data-profile-form] [name="layout"]')).toHaveValue('auto');
 await page.locator('[data-profile-form] [name="layout"]').selectOption('four-top');
 await page.locator('[data-profile-form] [name="leadVi"]').fill('Lời dẫn lưu trên local CI');
 await page.locator('[data-profile-form] button[type="submit"]').click();
 await expect(page.locator('[data-profile-dialog]')).not.toBeVisible();
 await expect(page.locator('[data-profile-lead]')).toHaveText('Lời dẫn lưu trên local CI');
 await page.reload();
 await expect(page.locator('[data-profile-lead]')).toHaveText('Lời dẫn lưu trên local CI');
 await expect(page.locator('.home-photos')).toHaveAttribute('data-layout','four-top');
 await expect(page.locator('[data-edit-profile]')).not.toBeVisible();
});
