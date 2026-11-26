import type { BackendRuntime } from '../../lib/auth/runtime';
import { categoryCatalogue } from '../../lib/category-catalogue';
import { displayCategory, type CategoryScope } from '../../lib/content-categories';
import { buildUrl } from '../../utils/url';
import { localeUrl } from '../../lib/i18n';

/** Editable pickers subscribe to the menu catalogue only on pages containing a form. */
export function mountCategoryPickers(root: ParentNode, runtime: Pick<BackendRuntime, 'api' | 'current' | 'signIn'>, vi: boolean) {
  const events = new AbortController(), { signal } = events, catalogue = categoryCatalogue(runtime);
  const loginButtons: HTMLButtonElement[] = [];
  const errorCopy = () => runtime.current().user
    ? (vi ? 'Chưa lưu được danh mục. Giữ nguyên tên và thử lại; tối đa 40 ký tự.' : 'Could not save the category. Your text is kept; retry with up to 40 characters.')
    : (vi ? 'Đăng nhập để thêm danh mục mới.' : 'Sign in to add a new category.');
  const stop = catalogue.subscribe(() => {
    if (signal.aborted) return;
    for (const options of root.querySelectorAll<HTMLDataListElement>('[data-taxonomy-options]')) {
      options.replaceChildren(...catalogue.items().filter(c => c.scope === options.dataset.taxonomyOptions).map(c => {
        const option = document.createElement('option'); option.value = c.label; option.label = displayCategory(c,vi); return option;
      }));
    }
    const selectedAlbum = new URLSearchParams(location.search).get('album');
    const uploadAlbum = root.querySelector<HTMLInputElement>('#photo-album');
    const selected = catalogue.items().find(c => c.scope === 'photos' && c.id === selectedAlbum);
    if (uploadAlbum && selected && !uploadAlbum.dataset.prefilled) { uploadAlbum.value = selected.label; uploadAlbum.dataset.prefilled = 'true'; }
  });
  for (const input of root.querySelectorAll<HTMLInputElement>('[data-taxonomy-input]')) {
    const feedback = input.closest('.category-picker')?.querySelector<HTMLElement>('[data-category-feedback]');
    const login = document.createElement('button'); login.type='button'; login.textContent=vi?'Đăng nhập để thêm danh mục':'Sign in to add a category'; login.hidden=true; feedback?.after(login);
    loginButtons.push(login);
    login.addEventListener('click',()=>{void runtime.signIn(localeUrl(buildUrl('account/callback/'),vi?'vi':'en'));},{signal});
    const commit = async () => {
      if (input.disabled || input.closest('[hidden]') || !input.value.trim()) return;
      const value = input.value;
      try {
        const category = await catalogue.ensure(input.dataset.taxonomyInput as CategoryScope,value);
        if (signal.aborted || input.value !== value) return;
        input.value = category.label; login.hidden=true; if (feedback) feedback.textContent = '';
        input.dispatchEvent(new Event('change',{bubbles:true}));
      } catch { if (!signal.aborted && feedback) { feedback.textContent = errorCopy(); login.hidden=!!runtime.current().user && !runtime.current().user?.guest; } }
    };
    input.addEventListener('blur', () => { void commit(); }, { signal });
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); void commit(); } }, { signal });
  }
  return () => { events.abort(); stop(); loginButtons.forEach(button => button.remove()); };
}
