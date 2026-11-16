import { expect, it } from 'vitest';
import { offlineBuildEnv } from '../../scripts/backend/build-source-env.mjs';

for (let mask = 0; mask < 16; mask++) {
  it(`compiles independent Git/API source combination ${mask} using public offline fixtures`, () => {
    const marker = (bit: number) => ({ source: mask & bit ? 'api' : 'git', epoch: mask & bit ? 1 : 0 });
    const env = offlineBuildEnv({ version: 1, ...marker(1) }, {
      version: 1, posts: marker(2), media: marker(4), requests: marker(8),
    });
    expect(env.PUBLIC_BACKEND_ENABLED).toBe(String(mask !== 0));
    expect(env.PUBLIC_SUPABASE_URL).toBe('https://fixture.supabase.co');
    expect(env.PUBLIC_API_BASE).toBe('https://fixture.supabase.co/functions/v1/api/v1');
    expect(env.PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe('sb_publishable_ci_build_fixture');
    expect([env.PUBLIC_COMMENTS_MODE, env.PUBLIC_CONTENT_MODE, env.PUBLIC_REQUESTS_MODE]).toEqual(['', '', '']);
    expect(Object.keys(env).every(k => k.startsWith('PUBLIC_'))).toBe(true);
  });
}
it('rejects incomplete, unsupported or invalid epoch sources rather than compiling a Git fallback', () => {
  const git = { source: 'git', epoch: 0 };
  const features = { version: 1, posts: git, media: git, requests: git };
  expect(() => offlineBuildEnv({ version: 2, ...git }, features)).toThrow();
  expect(() => offlineBuildEnv({ version: 1, source: 'api', epoch: 0 }, features)).toThrow();
  expect(() => offlineBuildEnv({ version: 1, ...git }, { ...features, requests: undefined })).toThrow();
});
