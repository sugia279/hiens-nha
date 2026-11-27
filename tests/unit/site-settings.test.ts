import { describe, expect, it } from 'vitest';
import { resolveSiteSettings } from '../../site-settings.mjs';

describe('source and Pages delivery identity', () => {
  it('preserves the current project site and repository rename behavior', () => {
    expect(resolveSiteSettings()).toEqual({repository:'sugia279/hiens-nha',origin:'https://sugia279.github.io',base:'/hiens-nha/'});
    expect(resolveSiteSettings({GITHUB_REPOSITORY:'sugia279/renamed'}).base).toBe('/renamed/');
  });
  it('publishes at an owned root without moving source links', () => {
    expect(resolveSiteSettings({GITHUB_REPOSITORY:'suduyhien/suduyhien.github.io',HIENS_SOURCE_REPOSITORY:'sugia279/hiens-nha'})).toEqual({repository:'sugia279/hiens-nha',origin:'https://sugia279.github.io',base:'/hiens-nha/'});
    expect(resolveSiteSettings({GITHUB_REPOSITORY:'suduyhien/suduyhien.github.io',HIENS_SOURCE_REPOSITORY:'sugia279/hiens-nha',HIENS_PAGES_REPOSITORY:'suduyhien/suduyhien.github.io'})).toEqual({repository:'sugia279/hiens-nha',origin:'https://suduyhien.github.io',base:'/'});
  });
  it('rejects malformed repository identifiers instead of producing an external origin', () => {
    for(const value of ['https://evil.test/a','a/b/c','a/b?x','a/../b','a/','/b']) expect(()=>resolveSiteSettings({HIENS_PAGES_REPOSITORY:value})).toThrow();
  });
});
