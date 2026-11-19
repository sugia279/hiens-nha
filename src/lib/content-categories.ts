export type CategoryScope = 'photos' | 'media' | 'posts';
export interface ContentCategory { id: string; scope: CategoryScope; label: string; label_en: string | null }
export const defaultCategories: readonly ContentCategory[] = [
  { id: 'family', scope: 'photos', label: 'Gia Đình', label_en: 'Family' },
  { id: 'scenery', scope: 'photos', label: 'Phong cảnh', label_en: 'Scenery' },
  { id: 'moments', scope: 'photos', label: 'Khoảnh Khắc', label_en: 'Moments' },
  { id: 'video', scope: 'media', label: 'Video yêu thích', label_en: 'Favorite videos' },
  { id: 'music', scope: 'media', label: 'Nhạc yêu thích', label_en: 'Favorite music' },
  { id: 'projects', scope: 'posts', label: 'Dự Án', label_en: 'Projects' },
  { id: 'series', scope: 'posts', label: 'Chuỗi bài', label_en: 'Series' },
  { id: 'novels', scope: 'posts', label: 'Tủ Truyện', label_en: 'Novels' },
];
export function categoryLabel(value: unknown): string {
  if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error('Invalid category');
  const label = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (!label || label.length > 40) throw new Error('Use 1–40 characters');
  return label;
}
export const categoryIdentity = (value: string) => categoryLabel(value).toLocaleLowerCase('vi');
export const displayCategory = (category: ContentCategory, vi: boolean) => vi ? category.label : category.label_en ?? category.label;
export function findCategory(items: readonly ContentCategory[], scope: CategoryScope, label: string) {
  const identity = categoryIdentity(label);
  return items.find(item => item.scope === scope && [item.label, item.label_en, item.id].some(value => value && categoryIdentity(value) === identity));
}
/** Category labels are ordinary bounded tags; preserve existing tags and reject overflow. */
export function categoryTags(tags: unknown, label: string): string[] {
  const values = typeof tags === 'string' ? tags.split(',').map(t => t.trim()).filter(Boolean) : tags;
  if (!Array.isArray(values) || values.some(t => typeof t !== 'string' || !t || t.length > 40)) throw new Error('Invalid tags');
  const result = [...new Set([...values, categoryLabel(label)])];
  if (result.length > 12) throw new Error('Use at most 12 tags including the category');
  return result;
}
export function categoryDestination(category: ContentCategory): string {
  if (category.scope === 'photos') return `/photos/?album=${encodeURIComponent(category.id)}#${encodeURIComponent(category.id)}`;
  if (category.scope === 'posts' && ['projects', 'series', 'novels'].includes(category.id)) return `/${category.id}/`;
  return `/${category.scope === 'media' ? 'music' : 'knowledge'}/?category=${encodeURIComponent(category.id)}${category.scope === 'posts' ? '#shared-knowledge' : ''}`;
}
export function matchesCategory(payload: Record<string, unknown>, category: ContentCategory): boolean {
  const tags = Array.isArray(payload.tags) ? payload.tags : [];
  return [payload.category,...tags].some(value => typeof value === 'string' && value.trim() && value.length <= 40 && !/[\u0000-\u001f\u007f]/u.test(value) && [category.label,category.id].some(name => categoryIdentity(name) === categoryIdentity(value)));
}
