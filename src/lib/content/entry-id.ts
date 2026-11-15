/** Preserve pre-upgrade path identities, including MDX extensions and Unicode folders. */
export function legacyContentId({ entry }: { entry: string }): string {
  return entry.replaceAll('\\', '/');
}
