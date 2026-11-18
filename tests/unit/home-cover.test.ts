import { describe, expect, it } from 'vitest';
import { selectHomePhotos } from '../../src/lib/photo-record';

describe('homepage cover selection', () => {
  it.each([1, 2, 3, 4])('uses %i selected photos without filling unused slots', count => {
    const records = Array.from({ length: count }, (_, i) => ({ id: `photo-${i}`, featuredOrder: i + 1 }));
    expect(selectHomePhotos(records)).toEqual(records);
  });
  it('caps the cover at four in stable featured order without mutating the album', () => {
    const records = [{ id: 'gallery-only' }, ...[5, 3, 1, 4, 2].map(n => ({ id: `photo-${n}`, featuredOrder: n }))];
    const snapshot = structuredClone(records);
    expect(selectHomePhotos(records).map(p => p.id)).toEqual(['photo-1', 'photo-2', 'photo-3', 'photo-4']);
    expect(records).toEqual(snapshot);
  });
  it('does not invent photos when no cover has been selected', () => {
    expect(selectHomePhotos([{ id: 'gallery-only' }])).toEqual([]);
  });
});
