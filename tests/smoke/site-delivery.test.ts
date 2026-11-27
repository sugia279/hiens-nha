import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { siteConfig, repository } from '../../src/config/site';

it('uses the delivery origin/base for canonicals and retains registered discussion keys',()=>{
  for(const locale of ['', 'en/']) {
    const html=readFileSync(`dist/${locale}music/index.html`,'utf8');
    expect(html).toContain(`rel="canonical" href="${siteConfig.origin}${siteConfig.base}${locale}music/"`);
    expect(html).toContain('data-context-base="/hiens-nha/"');
    expect(html).toContain('data-context="/hiens-nha/music/"');
    expect(html).toContain(`action="${siteConfig.base}${locale}search/"`);
    expect(readFileSync(`dist/${locale}requests/index.html`,'utf8')).toContain(`https://github.com/${repository}/blob/main/docs/project/requests.md`);
  }
  expect(readFileSync('dist/sitemap-index.xml','utf8')).toContain(`${siteConfig.origin}${siteConfig.base}`);
});
