import type { ImageMetadata } from 'astro';
import { photoRecordSchema, selectHomePhotos, type PhotoRecord } from './photo-record';
const records = import.meta.glob('../data/photos/*.json', { eager: true, import: 'default' });
const images = import.meta.glob('../assets/{home,gallery}/*.{jpg,jpeg,png,webp}', { eager: true, import: 'default' }) as Record<string, ImageMetadata>;
export type Photo = PhotoRecord & { asset: ImageMetadata };
const seen = new Set<string>();
export const photos: Photo[] = Object.entries(records).map(([path, value]) => {
  const photo = photoRecordSchema.parse(value);
  if (seen.has(photo.id) || !path.endsWith(`/${photo.id}.json`)) throw new Error(`Invalid or duplicate photo ID: ${photo.id}`);
  seen.add(photo.id);
  const asset = images[photo.image.replace(/^src\//, '../')];
  if (!asset) throw new Error(`Missing photo image: ${photo.image}`);
  return { ...photo, asset };
}).sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') || a.id.localeCompare(b.id));
export const homePhotos = selectHomePhotos(photos);
