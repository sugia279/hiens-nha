import { validateSource } from '../../supabase/functions/_shared/source-mode.mjs';

const features = ['posts', 'media', 'requests'];

/** Independent Git publication maintenance; never changes API authority or comments. */
export function legacyFeatureFrozen(config, feature) {
  if (!features.includes(feature) || config?.version !== 1 ||
      Object.keys(config).some(key => !['version', ...features].includes(key)) ||
      features.some(key => typeof config[key] !== 'boolean')) {
    throw new Error('Invalid legacy feature maintenance marker');
  }
  return config[feature];
}

export function acceptsLegacyFeature(sources, maintenance, feature) {
  if (sources?.version !== 1) throw new Error('Unsupported feature source version');
  const frozen = legacyFeatureFrozen(maintenance, feature);
  return validateSource(sources[feature]).source === 'git' && !frozen;
}
