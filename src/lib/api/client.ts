import { postImageReader } from './post-images';
import type { PostReactions, Reaction, ReactionDetails, GuestIdentity } from '../post-reactions';
import type { CategoryScope, ContentCategory } from '../content-categories';
import type { HomeProfile, HomeProfileVersion } from '../home-profile';
import { ApiError, type Comment, type CommentPage, type CommentState, type ContentEntity } from '../../../supabase/functions/_shared/contracts';
import type { FeatureName,Publication,HelpRequest,FeatureState,FeaturePage } from '../../../supabase/functions/_shared/features';
import type { BackendConfig } from './config';
export interface CurrentUser { id: string; role: 'member' | 'owner'; guest?: boolean }
export function createApiClient(config: BackendConfig, getToken: (verifyIdentity?: boolean) => Promise<string | null>, fetcher: typeof fetch = fetch) {
  async function request<T>(path: string, method = 'GET', body?: unknown, idempotencyKey?: string, rpc = false): Promise<T> {
    const token = await getToken(path === '/me' || path === 'guest_claim');
    const headers = new Headers({ apikey: config.publishableKey });
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
    let response: Response;
    try { response = await fetcher(rpc ? `${config.supabaseUrl}/rest/v1/rpc/${path}` : `${config.apiBase}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000), credentials: 'omit', redirect: 'error', cache: 'no-store' }); }
    catch { throw new ApiError(503, 'UNAVAILABLE', 'Không kết nối được API / API unavailable'); }
    let data;
    try { data = await response.json(); } catch { throw new ApiError(503, 'UNAVAILABLE', 'API returned an invalid response'); }
    if (!response.ok) throw new ApiError(response.status, data.code ?? 'API_ERROR', data.message ?? 'Request failed', data.fieldErrors ?? {});
    return data as T;
  }
  const encode = encodeURIComponent;
  const rpc = <T>(name:string,body:unknown)=>request<T>(name,'POST',body,undefined,true);
  const query = (cursor?: string | null, parentId?: string, mine = false) => {
    const params = new URLSearchParams(); if (cursor) params.set('cursor', cursor); if (parentId) params.set('parentId', parentId); if (mine) params.set('view', 'mine');
    return params.size ? `?${params}` : '';
  };
  return {
    async authProviders(): Promise<Record<'github' | 'google' | 'facebook', boolean>> {
      const response = await fetcher(`${config.supabaseUrl}/auth/v1/settings`, {
        headers: {apikey: config.publishableKey}, credentials: 'omit', cache: 'no-store',
        redirect: 'error', signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Auth settings unavailable');
      const {external} = await response.json();
      return {github: external?.github === true, google: external?.google === true, facebook: external?.facebook === true};
    },
    guestIdentity: (name?: string | null, choose = false, proof?: string) => rpc<GuestIdentity>('guest_identity',{p_name:name??null,p_choose:choose,p_proof:proof??null}),
    claimGuest: (proof: string) => rpc<boolean>('guest_claim',{p_proof:proof}),
    postReactionDetails: (id: string,after?: string | null) => rpc<ReactionDetails>('post_reaction_details',{p_id:id,p_after:after??null,p_limit:25}),
    postReactions: (ids: string[]) => rpc<PostReactions[]>('post_reactions_read',{p_ids: ids}),
    setPostReaction: (id: string, reaction: Reaction | null) => rpc<PostReactions>('post_reaction_set',{p_id: id, p_reaction: reaction}),
    contentCategories: () => rpc<ContentCategory[]>('content_categories_read',{}),
    createContentCategory: (scope: CategoryScope, label: string) => rpc<ContentCategory>('content_category_create',{p_scope:scope,p_label:label}),
    postImages: postImageReader(config,()=>getToken(),fetcher),
    mediaContext: {config, token:()=>getToken(), fetcher},
    homeProfile: () => rpc<HomeProfileVersion>('home_profile_read',{}),
    saveHomeProfile: (value: HomeProfile,version: number) => rpc<HomeProfileVersion>('home_profile_save',{p_value:value,p_expected_version:version}),
    featureState: (feature:FeatureName) => request<FeatureState>(`/features/${feature}/state`),
    publications: (feature:'posts'|'media',view='public',cursor?:string|null) => request<FeaturePage<Publication>>(`/${feature}?view=${view}${cursor?'&cursor='+encode(cursor):''}`),
    publication: (feature:'posts'|'media',id:string,working=false) => request<Publication>(`/${feature}/${encode(id)}${working?'?view=working':''}`),
    publicationHistory: (feature:'posts'|'media',id:string,before?:string|null) => request<FeaturePage<Record<string,unknown>>>(`/${feature}/${encode(id)}/revisions${before?'?before='+encode(before):''}`),
    savePublication: (feature:'posts'|'media',payload:Record<string,unknown>,key:string,current?:Publication|null) => request<Publication>(`/${feature}${current?'/'+current.id:''}`,current?'PATCH':'POST',current?{payload,expectedVersion:current.version}:payload,key),
    publicationAction: (feature:'posts'|'media',id:string,action:'submit'|'moderate'|'unpublish'|'delete',payload:Record<string,unknown>,key:string) => request<Publication>(`/${feature}/${encode(id)}${action==='delete'?'':'/'+action}`,action==='delete'?'DELETE':'POST',payload,key),
    requests: (view='public',cursor?:string|null,status?:string) => request<FeaturePage<HelpRequest>>(`/requests?view=${view}${cursor?'&cursor='+encode(cursor):''}${status?'&status='+encode(status):''}`),
    legacyRequest: (number:number) => request<HelpRequest>(`/requests/legacy/${number}`),
    helpRequest: (id:string) => request<HelpRequest>(`/requests/${encode(id)}`),
    requestHistory: (id:string,before?:string|null) => request<FeaturePage<Record<string,unknown>>>(`/requests/${encode(id)}/events${before?'?before='+encode(before):''}`),
    createRequest: (payload:Record<string,unknown>,key:string) => request<HelpRequest>('/requests','POST',payload,key),
    requestAction: (id:string,action:'scope'|'moderate'|'transitions'|'corrections',payload:Record<string,unknown>,key:string) => request<HelpRequest>(`/requests/${encode(id)}/${action}`,action==='scope'?'PATCH':'POST',payload,key),
    state: () => request<CommentState>('/state'),
    resolveEntity: (path: string) => request<ContentEntity>(`/entities/resolve?path=${encode(path)}`),
    me: () => request<CurrentUser>('/me'),
    comments: (entity: string, cursor?: string | null, parentId?: string, mine = false) => request<CommentPage>(`/entities/${encode(entity)}/comments${query(cursor, parentId, mine)}`),
    commentFeed: (cursor?: string | null, mine = false) => request<CommentPage>(`/comments${query(cursor, undefined, mine)}`),
    moderation: (cursor?: string | null) => request<CommentPage>(`/admin/moderation${query(cursor)}`),
    createComment: (entity: string, body: string, key: string, parentId?: string) => request<Comment>(`/entities/${encode(entity)}/comments`, 'POST', { body, parentId }, key),
    editComment: (id: string, body: string, expectedVersion: number) => request<Comment>(`/comments/${encode(id)}`, 'PATCH', { body, expectedVersion }),
    deleteComment: (id: string, expectedVersion: number) => request<Comment>(`/comments/${encode(id)}`, 'DELETE', { expectedVersion }),
    moderate: (id: string, status: string, expectedVersion: number, reason: string) => request<Comment>(`/comments/${encode(id)}/moderate`, 'POST', { status, expectedVersion, reason }),
  };
}
