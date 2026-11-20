import type { BackendRuntime } from '../../lib/auth/runtime';
import { categoryCatalogue } from '../../lib/category-catalogue';
import { displayCategory } from '../../lib/content-categories';
import { localeUrl } from '../../lib/i18n';
import { buildUrl } from '../../utils/url';

/** Gallery-only rendering; menus and upload pickers share the same catalogue. */
export function mountPhotoCategories(root: ParentNode, runtime: Pick<BackendRuntime, 'api' | 'current'>, vi: boolean) {
  const gallery = root.querySelector<HTMLElement>('[data-photo-gallery]');
  if (!gallery) return () => {};
  const catalogue = categoryCatalogue(runtime);
  return catalogue.subscribe(() => {
    const selectedAlbum = new URLSearchParams(location.search).get('album');
    for (const category of catalogue.items().filter(c => c.scope === 'photos')) {
      if ([...gallery.querySelectorAll<HTMLElement>('[data-album-id]')].some(section => section.dataset.albumId === category.id)) continue;
      const section = document.createElement('section'), heading = document.createElement('h2'), text = document.createElement('p'), upload = document.createElement('a');
      section.className = 'photo-album'; section.dataset.albumId = category.id;
      heading.id = category.id; heading.textContent = displayCategory(category, vi); heading.setAttribute('data-original-content', '');
      section.setAttribute('aria-labelledby', category.id);
      text.textContent = vi ? 'Album này chưa có ảnh.' : 'No photographs in this album yet.';
      upload.textContent = vi ? 'Thêm ảnh vào album' : 'Add photos to this album';
      upload.href = localeUrl(buildUrl(`/photos/upload/?album=${encodeURIComponent(category.id)}`), vi ? 'vi' : 'en');
      section.append(heading, text, upload); gallery.append(section);
      const tab = document.createElement('a'); tab.href = `?album=${encodeURIComponent(category.id)}#${category.id}`; tab.textContent = displayCategory(category, vi); tab.setAttribute('data-original-content', '');
      gallery.querySelector('.album-links')?.append(tab);
    }
    const albums = [...gallery.querySelectorAll<HTMLElement>('[data-album-id]')];
    const exists = albums.some(section => section.dataset.albumId === selectedAlbum);
    albums.forEach(section => { section.hidden = !!selectedAlbum && exists && section.dataset.albumId !== selectedAlbum; });
    const addPhoto = gallery.querySelector<HTMLAnchorElement>('.photos-header a');
    if (addPhoto && selectedAlbum && exists) addPhoto.href = localeUrl(buildUrl(`/photos/upload/?album=${encodeURIComponent(selectedAlbum)}`), vi ? 'vi' : 'en');
  });
}
