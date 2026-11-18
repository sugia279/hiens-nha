/**
 * Site identity, metadata defaults, and social links configuration.
 * No secrets. No browser/runtime dependencies. Consumed by SEO, RSS, layouts, and components.
 */

import type { SiteConfig } from '../types/site';
import { base, repository } from '../../site-settings.mjs';
export { repository };

export const siteConfig: SiteConfig = {
  name: "Hiên Nhà",
  description:
    'A home for Hien’s knowledge, projects, stories, music, and friends.',
  author: 'Su Duy Hien',
  language: 'vi',
  origin: 'https://sugia279.github.io',
  base,
  socialLinks: [
    {
      service: 'GitHub',
      url: 'https://github.com/sugia279',
      label: 'GitHub profile',
    },
    {
      service: 'Medium',
      url: 'https://medium.com/@hiensu304',
      label: 'Technical articles on Medium',
    },
  ],
};
