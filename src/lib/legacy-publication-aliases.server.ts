// Build-only read model: retain existing published fragment bookmarks without exposing drafts.
import { stableId } from '../../scripts/migration/comments-model.mjs';
interface Archive {
  version: number;
  number: number;
  approved: boolean;
  deleted: boolean;
}
export function publicationAnchors(archives: Record<string, Archive>) {
  const aliases: Record<string, string> = {};
  for (const [path, archive] of Object.entries(archives))
    if (
      archive.version === 1 &&
      archive.approved &&
      !archive.deleted &&
      Number.isSafeInteger(archive.number) &&
      archive.number >= 0
    ) {
      const key = path.split('/').at(-1)!;
      aliases[stableId(`legacy:posts:${key}`)] =
        'shared-post-' + archive.number;
    }
  return aliases;
}
export function legacyPublicationAnchors() {
  return publicationAnchors(
    import.meta.glob<Archive>('../../data/knowledge/*.json', {
      eager: true,
      import: 'default',
    }),
  );
}
