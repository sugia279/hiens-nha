import { describe,expect,it,vi } from 'vitest';
import { commentSource } from '../../src/lib/comment-source';
import { usesGitComments } from '../../scripts/archive-guestbook.mjs';
import { createHandler,type CallerBackend } from '../../supabase/functions/api/handler';
const config={PUBLIC_BACKEND_ENABLED:'true',PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321',PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fixture',PUBLIC_API_BASE:'http://127.0.0.1:54321/functions/v1/api/v1',PUBLIC_COMMENTS_MODE:'api-local'};
describe('one writer and registered canonical identity',()=>{
  it('defaults to Git and refuses hosted environment-only cutover',()=>{
    expect(commentSource({})).toEqual({source:'git',epoch:0});expect(commentSource(config)).toEqual({source:'api',epoch:1});
    expect(()=>commentSource({...config,PUBLIC_SUPABASE_URL:'https://cloud.example',PUBLIC_API_BASE:'https://cloud.example/functions/v1/api/v1'})).toThrow('loopback');
    expect(usesGitComments({version:1,source:'git',epoch:0})).toBe(true);expect(usesGitComments({version:1,source:'api',epoch:1})).toBe(false);
    expect(()=>usesGitComments({version:1,source:'api',epoch:0})).toThrow();
  });
  it('API resolves VI/EN/encoded/trailing-slash contexts to registered entities only',async()=>{
    const backend={resolveEntity:vi.fn().mockResolvedValue({id:'fixture',canonical_path:'/hiens-nha/articles/Chương/'}),commentState:vi.fn(),verifyUser:vi.fn(),isOwner:vi.fn(),entityExists:vi.fn(),listComments:vi.fn(),rpc:vi.fn()} as CallerBackend;
    const handler=createHandler({backend:()=>backend,allowedOrigins:[]});
    const response=await handler(new Request('https://api.test/api/v1/entities/resolve?path='+encodeURIComponent('/hiens-nha/en/articles/Ch%C6%B0%C6%A1ng?x=1#c')));
    expect(response.status).toBe(200);expect(backend.resolveEntity).toHaveBeenCalledWith('/hiens-nha/articles/Chương/');
    vi.mocked(backend.resolveEntity).mockResolvedValue(null);expect((await handler(new Request('https://api.test/api/v1/entities/resolve?path=/hiens-nha/unregistered/'))).status).toBe(404);
    expect((await handler(new Request('https://api.test/api/v1/entities/resolve?path=https://evil.test/'))).status).toBe(422);
  });
});
