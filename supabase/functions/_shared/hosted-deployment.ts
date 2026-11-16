/** Public deployment identity only. No API keys, passwords or OAuth secrets. */
export const hostedDeployment = {
  projectRef: 'eqxlywwvchmzuyqtxexu',
  supabaseUrl: 'https://eqxlywwvchmzuyqtxexu.supabase.co',
  region: 'ap-southeast-1',
  browserOrigin: 'https://sugia279.github.io',
  siteBasePath: '/hiens-nha/',
} as const;

/** Approved disposable staging; never used by the production frontend. */
export const stagingDeployment = {
  projectRef: 'hitsdflorbqvoltsytxe',
  supabaseUrl: 'https://hitsdflorbqvoltsytxe.supabase.co',
  region: 'ap-southeast-1',
  browserOrigin: 'https://sugia279.github.io',
} as const;
