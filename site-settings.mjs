/** Source identity is independent of the repository that publishes Pages. */
export function resolveSiteSettings(env = {}) {
  const repository = env.HIENS_SOURCE_REPOSITORY || env.GITHUB_REPOSITORY || 'sugia279/hiens-nha';
  const target = env.HIENS_PAGES_REPOSITORY || repository;
  for (const value of [repository, target]) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(value)) throw new Error('Invalid Pages repository');
  }
  const [owner, name] = target.split('/');
  return { repository, origin: `https://${owner.toLowerCase()}.github.io`, base: name.toLowerCase() === `${owner.toLowerCase()}.github.io` ? '/' : `/${name}/` };
}
// Vite substitutes the resolved public settings for browser imports; no process/env runtime leaks.
export const { repository, origin, base } = typeof __HIENS_SITE_SETTINGS__ === 'undefined' ? resolveSiteSettings(process.env) : __HIENS_SITE_SETTINGS__;
