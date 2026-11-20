import type { BackendRuntime } from '../../lib/auth/runtime';
import { categoryCatalogue } from '../../lib/category-catalogue';
import { categoryDestination, displayCategory, type CategoryScope } from '../../lib/content-categories';
import { buildUrl } from '../../utils/url';
import { localeUrl } from '../../lib/i18n';

/** One catalogue for both menu copies and every editable picker on this page. */
export function mountContentCategories(root: ParentNode, runtime: Pick<BackendRuntime,'api'|'current'|'subscribe'|'signIn'>, vi: boolean) {
  const events = new AbortController(), { signal } = events, catalogue = categoryCatalogue(runtime);
  const loginButtons: HTMLButtonElement[] = [];
  const errorCopy = () => runtime.current().user
    ? (vi ? 'Chưa lưu được danh mục. Giữ nguyên tên và thử lại; tối đa 40 ký tự.' : 'Could not save the category. Your text is kept; retry with up to 40 characters.')
    : (vi ? 'Đăng nhập để thêm danh mục mới.' : 'Sign in to add a new category.');
  const stop = catalogue.subscribe(() => {
    if (signal.aborted) return;
    for (const list of root.querySelectorAll<HTMLElement>('[data-category-scope]')) {
      list.querySelectorAll('.nav-category-dynamic').forEach(node => node.remove());
      const add = list.querySelector('[data-category-add]')?.closest('li');
      for (const category of catalogue.items().filter(c => c.scope === list.dataset.categoryScope)) {
        if ([...list.children].some(node => (node as HTMLElement).dataset.categoryId === category.id)) continue;
        const item = document.createElement('li'), link = document.createElement('a'), icon = document.createElement('span');
        item.className = 'nav-node nav-category-dynamic'; item.dataset.categoryId = category.id; item.style.setProperty('--depth','1');
        link.className = 'nav-row'; link.href = localeUrl(buildUrl(categoryDestination(category)), vi ? 'vi' : 'en');
        if(link.pathname===location.pathname && link.search===location.search)link.setAttribute('aria-current','page');
        icon.textContent = '▱'; icon.setAttribute('aria-hidden','true'); icon.className = 'nav-icon';
        const name = document.createElement('span'); name.className = 'nav-label'; name.textContent = displayCategory(category,vi); name.setAttribute('data-original-content','');
        link.append(icon,name); item.append(link); list.insertBefore(item,add ?? null);
      }
    }

  });
  for (const row of root.querySelectorAll<HTMLElement>('[data-category-add]')) {
    const input = row.querySelector<HTMLInputElement>('[data-category-new]')!, open = row.querySelector<HTMLButtonElement>('[data-category-open]')!, status = row.querySelector<HTMLElement>('[data-category-status]')!;
    const login = document.createElement('button'); login.type = 'button'; login.className = 'nav-row'; login.textContent = vi ? 'Đăng nhập' : 'Sign in'; login.hidden = true; row.append(login);
    loginButtons.push(login);
    login.addEventListener('click', () => { void runtime.signIn(localeUrl(buildUrl('account/callback/'), vi ? 'vi' : 'en')); }, { signal });
    let saving = false, cancelled = false;
    async function commit() {
      if (saving || input.hidden || cancelled) return;
      if (!input.value.trim()) { input.hidden = true; status.textContent = ''; return; }
      saving = true; input.disabled = true; status.textContent = vi ? 'Đang lưu…' : 'Saving…';
      try {
        await catalogue.ensure(row.dataset.categoryAdd as CategoryScope,input.value);
        if (signal.aborted) return;
        input.value = ''; input.hidden = true; login.hidden = true; status.textContent = '';
      } catch {
        if (!signal.aborted) { status.textContent = errorCopy(); login.hidden = !!runtime.current().user; }
      } finally { saving = false; input.disabled = false; }
    }
    open.addEventListener('click', () => { if (saving) return; cancelled = false; input.hidden = false; input.focus(); }, { signal });
    input.addEventListener('keydown', event => {
      if (event.isComposing) return;
      if (event.key === 'Enter') { event.preventDefault(); void commit(); }
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelled = true; input.value = ''; input.hidden = true; status.textContent = ''; login.hidden = true; open.focus(); }
    }, { signal });
    input.addEventListener('blur', () => { void commit(); }, { signal });
  }
  void catalogue.refresh().catch(() => {
    if (!signal.aborted) for (const status of root.querySelectorAll<HTMLElement>('[data-category-status]')) status.textContent = vi ? 'Chưa tải được danh mục mới. Các mục có sẵn vẫn dùng được.' : 'New categories unavailable. Existing categories remain available.';
  });
  return () => { events.abort(); stop(); loginButtons.forEach(button => button.remove()); };
}
