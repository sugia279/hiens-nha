import { createClient } from '@supabase/supabase-js';
import { createHandler } from './handler.ts';
import { callerBackend } from './backend.ts';
import { connectionBudget } from './traffic.ts';
import { publicKey } from '../_shared/contracts.ts';
import { apiOrigins } from './configuration.ts';

const url = Deno.env.get('SUPABASE_URL')!;
// Never use a service-role/secret key: every query carries caller identity to RLS.
const key = publicKey(Deno.env.get('SUPABASE_ANON_KEY'));
const allowedOrigins = apiOrigins(url, Deno.env.get('ALLOWED_ORIGINS'));
const handle = createHandler({
  admitConnection: connectionBudget(),
  allowedOrigins,
  siteBase: Deno.env.get('SITE_BASE_PATH') ?? '/hiens-nha/',
  backend: (token) =>
    callerBackend(
      createClient(url, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
        global: { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      }),
    ),
  log: (event) => console.info(JSON.stringify(event)),
});
Deno.serve((request, info) => handle(request, info.remoteAddr.hostname));
