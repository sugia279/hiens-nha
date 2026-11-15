export function validateSource(marker) {
  if (
    !marker ||
    !['git', 'api'].includes(marker.source) ||
    !Number.isSafeInteger(marker.epoch) ||
    marker.epoch < 0 ||
    (marker.source === 'api' && marker.epoch < 1)
  )
    throw new Error('Invalid feature source marker');
  return marker;
}
