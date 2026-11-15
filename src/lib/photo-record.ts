import { z } from 'zod';

export const photoAlbums = ['family', 'scenery', 'moments'] as const;
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const photoRecordSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,79}$/),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(2000),
  titleEn: z.string().trim().min(1).max(120).optional(),
  descriptionEn: z.string().trim().min(1).max(2000).optional(),
  album: z.enum(photoAlbums),
  image: z.string().regex(/^src\/assets\/(?:home|gallery)\/[A-Za-z0-9-]+\.(?:jpg|jpeg|png|webp)$/),
  publishedAt: z.iso.datetime().optional(),
  featuredOrder: z.number().int().positive().optional(),
}).strict();
export type PhotoRecord = z.infer<typeof photoRecordSchema>;
export function imageExtension(bytes: Uint8Array): 'jpg' | 'png' | 'webp' | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if ([137,80,78,71,13,10,26,10].every((byte, i) => bytes[i] === byte)) return 'png';
  if (String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP') return 'webp';
  return undefined;
}
