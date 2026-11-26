import { validProfileImage } from '../../lib/profile-image';
import { onPageMount } from '../../lib/page-lifecycle';
onPageMount((page) => {
const viewer = document.querySelector<HTMLDialogElement>('#photo-viewer');
const image = document.querySelector<HTMLImageElement>('#photo-viewer-image');
const size = document.querySelector<HTMLButtonElement>('#photo-size');
const stage = document.querySelector<HTMLElement>('#photo-stage');
if (viewer && image && size && stage) {
  page.cleanup(() => { if (viewer.open) viewer.close(); image.removeAttribute('src'); });
  const vi = document.documentElement.lang === 'vi';
  let selected: HTMLAnchorElement | null = null;
  let previousOverflow = '';
  const visiblePhotos = () => Array.from(document.querySelectorAll<HTMLAnchorElement>('a[data-photo-full]')).filter((link) => !link.closest('[hidden]'));
  for (const link of visiblePhotos()) link.setAttribute('data-astro-reload', '');
  function fit(): void { viewer!.classList.remove('is-original'); size!.setAttribute('aria-pressed', 'false'); size!.textContent = vi ? 'Kích thước gốc 1:1' : 'Original size 1:1'; stage!.scrollTo(0,0); }
  function show(link: HTMLAnchorElement): void {
    selected = link;
    const url = new URL(link.dataset.photoFull!, location.origin);
    const local = url.origin === location.origin && (url.pathname.startsWith(import.meta.env.BASE_URL) || (import.meta.env.DEV && url.pathname.startsWith('/@fs/')));
    if (!local && !(link.dataset.profilePhoto === 'true' && validProfileImage(url.href) && url.protocol === 'https:')) return;
    image!.src = url.href; image!.alt = link.dataset.photoTitle ?? '';
    document.getElementById('photo-viewer-title')!.textContent = link.dataset.photoTitle ?? '';
    document.getElementById('photo-viewer-description')!.textContent = link.dataset.photoDescription ?? '';
    fit();
    if (!viewer!.open) { previousOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; viewer!.showModal(); }
  }
  page.listen(document, 'click', (event) => {
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[data-photo-full]') : null;
    if (link && !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) { event.preventDefault(); show(link); }
  });
  function move(delta: number): void { const links = visiblePhotos(); const index = links.indexOf(selected!); if (links.length) show(links[(index + delta + links.length) % links.length]!); }
  document.getElementById('photo-previous')?.addEventListener('click', () => move(-1));
  document.getElementById('photo-next')?.addEventListener('click', () => move(1));
  size.addEventListener('click', () => { const original = viewer.classList.toggle('is-original'); size.setAttribute('aria-pressed', String(original)); size.textContent = original ? (vi ? 'Vừa màn hình' : 'Fit to screen') : (vi ? 'Kích thước gốc 1:1' : 'Original size 1:1'); });
  viewer.addEventListener('click', (event) => { if (event.target === viewer || event.target === stage) viewer.close(); });
  viewer.addEventListener('keydown', (event) => { if (!viewer.classList.contains('is-original') && ['ArrowLeft','ArrowRight'].includes(event.key)) { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); } });
  viewer.addEventListener('close', () => { document.body.style.overflow = previousOverflow; image.removeAttribute('src'); if(document.activeElement===document.body || viewer.contains(document.activeElement)) selected?.focus({ preventScroll: true }); });
}

});
