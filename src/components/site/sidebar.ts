export const PHONE_QUERY = '(max-width: 767px)';

/** Close only a normal in-page/same-tab navigation; expanding branches is separate. */
export function shouldClosePhoneNavigation(phone: boolean, event: Pick<MouseEvent, 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'defaultPrevented'>, link: Pick<HTMLAnchorElement, 'href' | 'target' | 'download'>, origin: string): boolean {
  if (!phone || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || link.download || (link.target && link.target !== '_self')) return false;
  try { const url = new URL(link.href); return url.origin === origin && ['http:', 'https:'].includes(url.protocol); } catch { return false; }
}

/** Dismiss a phone overlay only for a pointer outside both sidebar and its toggle. */
export function shouldDismissPhoneNavigationOutside(phone: boolean, collapsed: boolean, insideSidebar: boolean, insideToggle: boolean): boolean {
  return phone && !collapsed && !insideSidebar && !insideToggle;
}

/** Record a parent destination's expanded state synchronously before its link navigates. */
export function expandParentNavigationBranch(
  branches: readonly { open: boolean; dataset: { navBranch?: string } }[],
  expanded: Set<string>,
  path: string,
  storage: Pick<Storage, 'setItem'>,
  key: string,
): void {
  expanded.add(path);
  for (const peer of branches) if (peer.dataset.navBranch === path) peer.open = true;
  try { storage.setItem(key, JSON.stringify([...expanded])); } catch { /* Navigation still works. */ }
}

/** Stable logical paths survive page loads and language changes. */
export function initNavigationBranches(root: Pick<ParentNode, 'querySelectorAll'>, storage: Pick<Storage, 'getItem' | 'setItem'>, base: string): void {
  const key = `navigation-branches:${base}`;
  const branches = Array.from(root.querySelectorAll<HTMLDetailsElement>('details[data-nav-branch]'));
  let expanded = new Set<string>();
  try {
    const saved: unknown = JSON.parse(storage.getItem(key) ?? '[]');
    if (Array.isArray(saved)) expanded = new Set(saved.filter((value): value is string => typeof value === 'string'));
  } catch { /* Corrupt or unavailable storage starts with collapsed branches. */ }
  for (const branch of branches) branch.open = expanded.has(branch.dataset.navBranch!);
  for (const branch of branches) branch.parentElement?.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest('a[data-nav-parent-link]');
    if (link?.parentElement !== branch.parentElement) return;
    expandParentNavigationBranch(branches, expanded, branch.dataset.navBranch!, storage, key);
  });
  for (const branch of branches) branch.addEventListener('toggle', () => {
    const path = branch.dataset.navBranch!;
    if (expanded.has(path) === branch.open) return;
    if (branch.open) expanded.add(path); else expanded.delete(path);
    for (const peer of branches) if (peer.dataset.navBranch === path && peer.open !== branch.open) peer.open = branch.open;
    try { storage.setItem(key, JSON.stringify([...expanded])); } catch { /* Keep native navigation functional. */ }
  });
}

export function initSidebar(signal?: AbortSignal): void {
  const shell = document.querySelector<HTMLElement>('.app-shell');
  const toggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  if (!shell || !toggle || !sidebar) return;
  // Access to localStorage itself can throw in restricted browsing modes.
  const storage = { getItem: (key: string) => window.localStorage.getItem(key), setItem: (key: string, value: string) => window.localStorage.setItem(key, value) };
  initNavigationBranches(sidebar, storage, import.meta.env.BASE_URL);
  const phone = window.matchMedia(PHONE_QUERY);
  const key = () => phone.matches ? 'sidebar-collapsed-phone' : 'sidebar-collapsed';
  const readPreference = () => { try { return localStorage.getItem(key()); } catch { return null; } };
  function setCollapsed(collapsed: boolean, remember = true): void {
    shell!.classList.toggle('is-collapsed', collapsed);
    toggle!.setAttribute('aria-expanded', String(!collapsed));
    if (remember) { try { localStorage.setItem(key(), String(collapsed)); } catch { /* Navigation still works when storage is unavailable. */ } }
  }
  function restorePreference(): void { const saved = readPreference(); setCollapsed(saved === null ? phone.matches : saved === 'true', false); }
  restorePreference();
  phone.addEventListener('change', restorePreference, { signal });
  toggle.addEventListener('click', () => setCollapsed(!shell.classList.contains('is-collapsed')));
  document.addEventListener('pointerdown', (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (shouldDismissPhoneNavigationOutside(phone.matches, shell.classList.contains('is-collapsed'), sidebar.contains(target), toggle.contains(target))) setCollapsed(true);
  }, { signal });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && phone.matches && !shell.classList.contains('is-collapsed')) {
      setCollapsed(true);
      toggle.focus();
    }
  }, { signal });
  sidebar.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
    if (link && !link.hasAttribute('download') && shouldClosePhoneNavigation(phone.matches, event, link, window.location.origin)) setCollapsed(true);
  }, { signal });
}
