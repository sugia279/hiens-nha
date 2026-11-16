/** Release maintenance affects Git submissions only; it cannot enable API writes. */
export function legacyCommentsFrozen(config) {
  if (config?.version !== 1 || typeof config.frozen !== 'boolean') {
    throw new Error('Invalid legacy comments maintenance marker');
  }
  return config.frozen;
}
