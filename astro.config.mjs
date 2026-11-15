import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { base } from './site-settings.mjs';

export default defineConfig({
  site: 'https://sugia279.github.io',
  base,
  output: 'static',
  integrations: [mdx(), sitemap()],
  vite: {
    plugins: [tailwindcss(), {
      name: 'hiens-client-manifest',
      apply: 'build',
      // Astro 7 resets the shared build manifest; enable it on the actual client environment.
      configEnvironment(name) { if (name === 'client') return { build: { manifest: true } }; },
    }],
    // Keep client modules external so Vite resolves external dynamic-import
    // preload markers before Astro emits the final pages (Pagefind runtime).
    build: { assetsInlineLimit: 0 },
  },
});
