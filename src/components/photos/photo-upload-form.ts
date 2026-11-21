import { GitHubPhotoUpload, PhotoUploadError } from '../../lib/photo-upload';
import { MAX_PHOTO_BYTES, imageExtension, type PhotoRecord } from '../../lib/photo-record';
import { onPageMount } from '../../lib/page-lifecycle';
onPageMount((page) => {
const root = document.getElementById('photo-upload');
if (root) {
 const vi = document.documentElement.lang === 'vi';
 const text = (vn: string, en: string) => vi ? vn : en;
 const connect = document.querySelector<HTMLFormElement>('#photo-connect')!;
 const form = document.querySelector<HTMLFormElement>('#photo-upload-form')!;
 const tokenInput = document.querySelector<HTMLInputElement>('#photo-token')!;
 const fields = document.querySelector<HTMLFieldSetElement>('#photo-content-fields')!;
 const authFields = document.querySelector<HTMLFieldSetElement>('#photo-auth-fields')!;
 const disconnect = document.querySelector<HTMLButtonElement>('#photo-disconnect')!;
 const fileInput = document.querySelector<HTMLInputElement>('#photo-file')!;
 const preview = document.querySelector<HTMLImageElement>('#photo-preview')!;
 const account = document.getElementById('photo-account')!;
 const status = document.getElementById('photo-upload-status')!;
 const result = document.getElementById('photo-upload-result')!;
 let client: GitHubPhotoUpload | undefined;
 let previewUrl = '';
 let pending: { id: string; date: string } | undefined;
 const errors: Record<string, [string,string]> = {
  category: ['Đăng nhập trên website để thêm album mới, hoặc chọn một album có sẵn.', 'Sign in on this website to add a new album, or choose an existing album.'],
  metadata: ['Tiêu đề và mô tả cần có nội dung; kiểm tra album đã chọn.', 'Enter a title and description, and check the selected album.'],
  owner: ['Token này không thuộc tài khoản chủ nhà.', 'This token does not belong to the site owner.'],
  permission: ['Chưa có quyền ghi Contents vào đúng repository. Kiểm tra quyền token và quy tắc bảo vệ nhánh.', 'No Contents write access to this repository. Check token permissions and branch rules.'],
  authentication: ['Token không hợp lệ hoặc đã hết hạn. Hãy kết nối lại.', 'The token is invalid or expired. Please reconnect.'],
  file: ['Chọn ảnh JPG, PNG hoặc WebP hợp lệ, tối đa 15 MB.', 'Choose a valid JPG, PNG or WebP photo up to 15 MB.'],
  conflict: ['Repository đang có nhiều cập nhật. Hãy thử lại; ảnh và mô tả vẫn được giữ.', 'The repository is busy. Try again; your photo and description remain here.'],
  github: ['GitHub chưa lưu được ảnh. Kiểm tra quyền ghi vào nhánh và thử lại.', 'GitHub could not save the photo. Check branch write access and try again.'],
 };
 function report(error: unknown): void { const code = error instanceof PhotoUploadError ? error.code : 'network'; const message = errors[code]; status.textContent = message ? text(...message) : text('Không hoàn tất được thao tác. Kiểm tra kết nối rồi thử lại; nội dung đang nhập vẫn được giữ.', 'The operation could not complete. Check your connection and retry; your form has been preserved.'); }
 function clearPreview(): void { if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = ''; preview.removeAttribute('src'); preview.hidden = true; }
 function disconnectSession(): void { client = undefined; tokenInput.value = ''; authFields.disabled = false; fields.disabled = true; account.hidden = true; disconnect.hidden = true; }
 connect.addEventListener('submit', async (event) => {
  event.preventDefault(); if (!connect.reportValidity()) return;
  authFields.disabled = true; status.textContent = text('Đang kiểm tra quyền chủ nhà…', 'Checking owner access…');
  try { const candidate = new GitHubPhotoUpload(root.dataset.repository!, tokenInput.value.trim()); tokenInput.value = ''; const login = await candidate.connect(); if (page.signal.aborted) return; client = candidate; fields.disabled = false; disconnect.hidden = false; account.hidden = false; account.textContent = text(`Đã kết nối: @${login}`, `Connected: @${login}`); status.textContent = text('Sẵn sàng thêm ảnh.', 'Ready to add a photograph.'); }
  catch (error) { disconnectSession(); report(error); }
 });
 disconnect.addEventListener('click', () => { disconnectSession(); status.textContent = text('Đã ngắt kết nối GitHub.', 'Disconnected from GitHub.'); });
 fileInput.addEventListener('change', () => { clearPreview(); pending = undefined; result.hidden = true; const file = fileInput.files?.[0]; if (!file) return; if (!file.size || file.size > MAX_PHOTO_BYTES) { status.textContent = text(...errors.file!); return; } previewUrl = URL.createObjectURL(file); preview.src = previewUrl; preview.hidden = false; });
 form.addEventListener('submit', async (event) => {
  event.preventDefault(); if (!form.reportValidity() || !client) return;
  const file = fileInput.files?.[0]; if (!file || !file.size || file.size > MAX_PHOTO_BYTES) { status.textContent = text(...errors.file!); return; }
  fields.disabled = true; disconnect.disabled = true; result.hidden = true;
  try {
   const bytes = new Uint8Array(await file.arrayBuffer()); const extension = imageExtension(bytes); if (!extension) throw new PhotoUploadError('file');
   let decoded: ImageBitmap; try { decoded = await createImageBitmap(file); } catch { throw new PhotoUploadError('file'); }
   const valid = decoded.width > 0 && decoded.height > 0 && decoded.width * decoded.height <= 60_000_000; decoded.close(); if (!valid) throw new PhotoUploadError('file');
   pending ??= { id: crypto.randomUUID(), date: new Date().toISOString() };
   const { categoryCatalogue } = await import('../../lib/category-catalogue');
   const { getBackendRuntime } = await import('../../lib/auth/runtime');
   const {defaultCategories,findCategory}=await import('../../lib/content-categories');
   const label=document.querySelector<HTMLInputElement>('#photo-album')!.value;
   const category=import.meta.env.PUBLIC_BACKEND_ENABLED==='true' ? await categoryCatalogue(getBackendRuntime()).ensure('photos',label) : findCategory(defaultCategories,'photos',label);
   if(!category)throw new PhotoUploadError('category');
   const record: PhotoRecord = { id: pending.id, title: document.querySelector<HTMLInputElement>('#photo-title')!.value.trim(), description: document.querySelector<HTMLTextAreaElement>('#photo-description')!.value.trim(), album: category.id, albumLabel: category.label, tags: [category.label], image: `src/assets/gallery/${pending.id}.${extension}`, publishedAt: pending.date };
   status.textContent = text('Đang lưu ảnh và mô tả… Vui lòng giữ trang mở.', 'Saving the photograph and description… Please keep this page open.');
   const saved = await client.publish(bytes, record);
   form.reset(); clearPreview(); pending = undefined;
   status.textContent = text('Đã lưu ảnh và mô tả vào repository. Đang chờ website dựng và triển khai lại để ảnh xuất hiện trong album.', 'The photograph and description are saved in the repository. Waiting for the website to rebuild and deploy the album.');
   const link = document.createElement('a'); link.href = saved.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = text('Xem bản lưu trên GitHub', 'View the saved commit on GitHub'); result.replaceChildren(link); result.hidden = false;
  } catch (error) { if (error instanceof PhotoUploadError && error.status === 401) disconnectSession(); report(error); }
  finally { fields.disabled = !client; disconnect.disabled = false; }
 });
 page.cleanup(() => { disconnectSession(); clearPreview(); });
}

});
