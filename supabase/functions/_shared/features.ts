import { ApiError, inputObject } from './contracts.ts';
import { validateKnowledge } from './domain/knowledge-submissions.mjs';
import { validateMedia } from './domain/media-links.mjs';
import { validateRequest } from './domain/requests.mjs';
export type FeatureName = 'posts' | 'media' | 'requests';
export interface Publication {
  id: string;
  entity_id: string;
  author_id: string | null;
  feature: 'posts' | 'media';
  version: number;
  revision: number;
  published_revision: number | null;
  status: string;
  created_at: string;
  updated_at: string;
  payload: Record<string, unknown>;
}
export interface HelpRequest {
  id: string;
  entity_id: string;
  author_id: string | null;
  version: number;
  scope_revision: number;
  accepted_scope_revision: number | null;
  moderation: string;
  status: string;
  result: string;
  legacy_number: number | null;
  created_at: string;
  updated_at: string;
  payload: Record<string, unknown>;
}
export interface FeatureState {
  source: 'git' | 'api';
  epoch: number;
  writes_enabled: boolean;
}
export interface FeaturePage<T> {
  items: T[];
  nextCursor: string | null;
}
export function featurePayload(
  feature: FeatureName,
  input: unknown,
): Record<string, unknown> {
  const keys =
    feature === 'posts'
      ? ['title', 'body', 'kind', 'category', 'tags', 'series', 'order']
      : feature === 'media'
        ? ['title', 'description', 'category', 'tags', 'url']
        : [
            'title',
            'description',
            'expectedResult',
            'category',
            'priority',
            'tags',
          ];
  const value = inputObject(input, keys);
  const validated =
    feature === 'posts'
      ? validateKnowledge(value)
      : feature === 'media'
        ? validateMedia(value)
        : validateRequest(value);
  if (!validated)
    throw new ApiError(422, 'INVALID_INPUT', 'Invalid ' + feature + ' payload');
  if (feature === 'media') {
    if (typeof value.url !== 'string' || value.url.length > 2048)
      throw new ApiError(422, 'INVALID_INPUT', 'Media URL too long');
    const {
      platform: _,
      url: __,
      ...fields
    } = validated as Record<string, unknown>;
    return { ...fields, url: value.url.trim() };
  }
  return validated as Record<string, unknown>;
}
