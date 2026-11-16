import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { callerBackend } from '../../supabase/functions/api/backend';
const id = '10000000-0000-0000-0000-000000000001';
describe('SDK transport uses caller scope and singular RPC response', () => {
  it('verifies Auth token and requests a single committed row from PostgREST', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async input => {
      const url = String(input);
      return new Response(JSON.stringify(url.includes('/auth/v1/user') ? { id, aud: 'authenticated', role: 'authenticated' } : { id, status: 'pending', version: 1 }), { headers: { 'content-type': 'application/json' } });
    });
    const client = createClient('http://127.0.0.1:54321', 'local-public-key', { global: { headers: { Authorization: 'Bearer caller-only' }, fetch: fetcher }, auth: { persistSession: false, autoRefreshToken: false } });
    const backend = callerBackend(client);
    expect(await backend.verifyUser()).toEqual({ id });
    expect(await backend.rpc('create_comment', { p_body: 'hello' })).toMatchObject({ id, status: 'pending' });
    const [url, options] = fetcher.mock.calls[1]!;
    expect(String(url)).toContain('/rest/v1/rpc/create_comment');
    const headers = new Headers(options?.headers);
    expect(headers.get('authorization')).toBe('Bearer caller-only');
    expect(headers.get('accept')).toBe('application/vnd.pgrst.object+json');
    expect(headers.get('apikey')).toBe('local-public-key');
  });
});
it('uses metered POST RPCs for entity/role/comments reads and returns the old DTO',async()=>{
 const calls:Array<{url:string;method:string;body:any}>=[];
 const fetcher:typeof fetch=async(input,options)=>{
  const url=String(input);calls.push({url,method:options?.method??'GET',body:JSON.parse(String(options?.body??'{}'))});
  const data=url.endsWith('/caller_is_owner')?true:url.endsWith('/read_comments')?[{id,body:'published',context_path:'/hiens-nha/music/'}]:{id,canonical_path:'/hiens-nha/music/'};
  return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
 };
 const client=createClient('http://127.0.0.1:54321','local-public-key',{global:{headers:{Authorization:'Bearer caller-only'},fetch:fetcher},auth:{persistSession:false,autoRefreshToken:false}});
 const backend=callerBackend(client);
 expect(await backend.resolveEntity('/hiens-nha/music/')).toMatchObject({id});expect(await backend.entityExists(id)).toBe(true);expect(await backend.isOwner()).toBe(true);
 expect(await backend.listComments(id,null,21,null,id)).toMatchObject([{id,body:'published',context_path:'/hiens-nha/music/'}]);
 expect(calls.every(c=>c.method==='POST'&&c.url.includes('/rest/v1/rpc/'))).toBe(true);
 expect(calls.at(-1)?.body).toMatchObject({p_mine:true,p_limit:21,p_entity_id:id});
});
