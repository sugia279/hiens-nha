# Run the backend foundation locally

Status: Phase 1 foundation + Phase 2 local pilot; production pages still use Git/Issues. No production migration or deployment commands are required here.

## Prerequisites and commands

Use Node from `.nvmrc`, `npm ci`, Docker Desktop/Rancher Desktop (Docker-compatible engine) or Podman, and enough local RAM. CLI/SDK/Deno versions are pinned in package-lock.json. Storage/realtime/analytics are disabled in this slice to reduce local services. Docker is unavailable in this executor; the Docker-backed full stack and Chromium flow have passed in GitHub CI at b8e9893 (see backend-progress.md).

```sh
npm ci
npm run test:backend
npm run check:edge
npm run backend:start
npm run backend:reset
```

`backend:reset` is local only and destroys the local test DB; never add `--linked`/`--db-url` against a real DB. `backend:start` uses only local containers; it does not create a Supabase cloud project. Do not enable the backend in a production Pages build yet.

Copy `.env.example` to `.env`, and `supabase/.env.example` to ignored `supabase/.env`. Get the **local anon/publishable key** from `npx supabase status` on your machine, set public URL/API base/key, and set `PUBLIC_BACKEND_ENABLED=true` for local development. Never copy the service-role key into public variables, logs, Issues or chat. The browser config rejects service-role and `sb_secret_` keys. Restart `npm run dev` after env changes.

For local Edge serving, set exact browser origins in `supabase/.env` then run:

```sh
npm run backend:serve
```

Do not allow wildcard CORS. Function gateway JWT verification is disabled to allow anonymous reads; the handler verifies every supplied session via Auth and calls PostgreSQL with the caller JWT, never service-role. Public database wrappers are SECURITY INVOKER; privileged mutation functions are private, with pinned search_path and explicit ownership/version/quota checks.

## GitHub OAuth and session behavior

Create an OAuth app owned by you, with local provider callback `http://127.0.0.1:54321/auth/v1/callback`. Set its client ID/secret in ignored `supabase/.env` and set `[auth.external.github].enabled=true` locally. No credential should be committed. Application callbacks are the exact VI/EN URLs listed in config.toml, including `/hiens-nha/`. Restart the local stack after provider config changes. A hosted staging app needs its own callback and redirect allowlist; do not reuse production credentials without a separate decision.

Visit `/hiens-nha/account/` (or `/hiens-nha/en/account/`). OAuth opens a popup; PKCE verifier, session and refresh token stay in originating page memory. Callback hands a code only to the same-origin opener and immediately clears URL query/hash; opener checks origin + popup identity. Page reload/navigation loses the local session. `/admin/` signs in independently and asks `/me` for DB-backed role; hiding UI never grants access. Admin now has an owner-only moderation queue. Local Auth refresh/logout and the browser comments flow passed CI with real local JWTs; provider/code exchange was mocked. Real GitHub consent/refusal/redirect, popup policies on target browsers and hosted staging still need an owner OAuth app.

## Owner bootstrap and fixture registration

After a verified GitHub sign-in, compare the auth UUID to its provider identity in local Studio. Do not match on display name/email alone. Use local SQL as postgres, never browser RPC, with your verified UUID:

```sql
-- Substitute a verified UUID locally; this is not a signup endpoint.
insert into public.role_assignments(user_id, role)
values ('VERIFIED-AUTH-UUID'::uuid, 'owner')
on conflict (user_id) do nothing;
```

No role is bootstrapped automatically. Keep numeric provider ID provenance for the future legacy-account claim process. This phase has no moderator role. Test members with `user_metadata.role=owner` must remain ordinary members.

Register an isolated local fixture entity (not a real imported thread), then enable writes only in the disposable local DB:

```sql
insert into public.content_entities(collection, legacy_key, canonical_path)
values ('page', 'local-permission-fixture', '/hiens-nha/local-permission-fixture/')
returning id;
update private.backend_settings set comments_source='api',comments_epoch=1,comments_writes_enabled=true where singleton;
```

When done: `update private.backend_settings set comments_writes_enabled=false where singleton;`. On a real migrated feature, stopping writes is maintenance, not a rollback to Git. Public frontend flags cannot bypass this DB switch.

## Verification layers

- `npm run test:backend`: actual embedded PostgreSQL grants/RLS/transactions against a minimal auth schema + HTTP/client contract tests. Claims are set with SQL as a test administrator; this is **not real JWT verification**. PostgreSQL extensions/network/concurrent sessions and Supabase default roles/grants are not emulated fully.
- `npm run check:edge`: Deno checks the actual entry/import graph. Not an Edge gateway deployment or runtime test.
- `npm run test:backend:integration`: requires a running **loopback-only** Supabase stack, local publishable key, registered fixture entity, write switch enabled, and three valid Auth-issued access tokens for member A, member B, owner. Set `LOCAL_SUPABASE_URL`, `LOCAL_PUBLISHABLE_KEY`, `LOCAL_ENTITY_ID`, `LOCAL_MEMBER_A_JWT`, `LOCAL_MEMBER_B_JWT`, `LOCAL_OWNER_JWT` privately in the process environment. Tokens stay in memory; command reports assertions only. It tests HTTP + direct Data API/RPC pending/ownership/moderation/version/bypass defenses. It refuses remote hosts and fails if configuration is missing; never reports an omitted suite as passing.
- CI runs embedded DB/HTTP/DOM/import/client and Deno checks plus a Docker-backed local Supabase/Chromium job. Real JWT/RPC/concurrency/refresh and a mocked-provider browser flow passed. Real provider, hosted staging, load and restore remain outstanding; no job deploys.

The shared DTO is imported by browser/Node/Deno. SDK dependency has one pinned version. Do not introduce a third copied business implementation. Public raw comment reads also enforce RLS. API responses use no-store (including errors); API errors stay visible to the client and do not become empty lists.

## Deferred release work

Phase 2 local code is implemented: entity mapping, composer, owner queue, dry-run/idempotent import/shadow comparison and source marker. Local version/idempotency races passed against real Supabase in CI. Production writer freeze, final import and cutover have not run. IP-level rate limiting/provider quotas and read-abuse protection require staging infrastructure decisions; Phase 1 enforces per-user mutation quotas in DB, not a global IP limit. Plan cleanup/retention for quota/idempotency/revision data before launch. Backups/restore, region latency and [10–20 / 50 RPS tests](backend-load-test.md) are still unmeasured.

Cloud blockers: owner-controlled Supabase account; project region and Free/Pro/billing decision; staging/production environments and OAuth app/allowlist; verified owner UUID; secure environment configuration. No secrets need to be sent through chat. No cloud resource was provisioned here.

## Enabled-build byte gate

The previous all-assets enabled sum exceeded 600,000 bytes. ADR 0002 documents the new route-specific pilot gate: default Git build retains the original aggregate ceiling; enabled pilot enforces the same ceiling on each route's complete static/lazy Vite graph. CI b8e9893 reported 651,087 total emitted bytes, largest route 574,814 bytes (graph), across 254 checked HTML routes. The old enabled aggregate metric is not claimed passing. Browser verification is now available from CI; the executor itself still cannot launch Chromium. Real OAuth/staging remains unverified.

Sources checked for setup: [CLI v3 env precedence](https://supabase.com/docs/guides/local-development/local-and-hosted-projects), [function auth](https://supabase.com/docs/guides/functions/auth), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [GitHub OAuth](https://supabase.com/docs/guides/auth/social-sign-in/auth-github), [PostgREST singular responses](https://docs.postgrest.org/en/stable/references/api/resource_representation.html). Match CLI major version when following environment-file instructions.

## Phase 2 pilot — local only

1. `npm run build`, `npm run backend:comments:dry-run` kiểm kê các trang đang có bình luận; chỉ đọc archive guestbook và artifact HTML. Không ghi dữ liệu khi dry-run.
2. Trên DB local mới, source Git + write switch false: đặt LOCAL_DATABASE_URL riêng trong môi trường rồi `npm run backend:comments:import`. Script chỉ chấp nhận loopback, transaction toàn bộ, rerun không nhân đôi, đối chiếu public projection qua anon RLS. Nếu đã có API audit writes, import bị từ chối; không dùng nó làm rollback sau ghi DB. Tombstone thiếu context cần khôi phục mapping từ lịch sử, không tự đoán. Raw records/credentials không được ghi vào repo hoặc báo cáo stdout.
3. Sau import/checksum/shadow compare, operator local đặt comments_source=api, comments_epoch=1 và comments_writes_enabled=true trong private.backend_settings. PUBLIC_BACKEND_ENABLED=true + PUBLIC_COMMENTS_MODE=api-local và public anon key chỉ nối vào project loopback. Chạy `npm run build:pilot` (LOCAL_PUBLISHABLE_KEY là public anon key), `npm run check:pilot`, rồi `node tests/browser/server.mjs` để thử artifact tại 127.0.0.1:4321/hiens-nha/.
4. Composer giữ bản đang nhập khi API lỗi; member chỉ sửa/xóa của mình. Duyệt/ẩn/từ chối cần owner, lý do và đúng version. Thử guestbook tổng hợp, VI/EN cùng thread, one-level replies, My comments, source mismatch/read-only, pending không lộ và reload khi conflict.

`Backend foundation checks` có job Docker local-stack: config email bật tạm trong checkout CI để tạo fixture JWT thật; GitHub OAuth provider handoff được mock trong browser, nhưng API/DB/roles/refresh/concurrency đều dùng Supabase local thật. Không bật email trên config đã commit. Session fixture files ignored, không upload trace/network credentials; job không deploy/provision cloud. Real GitHub OAuth app/callback và staging vẫn cần chủ tài khoản cấu hình.

Budget mới theo ADR 0002: default build vẫn kiểm aggregate 600.000 bytes; pilot kiểm cùng trần 600.000 trên từng route, tính cả static/dynamic Vite dependency closure, đồng thời in tổng inventory. CSS giữ 100.000 bytes. Đây là static byte check, chưa phải Lighthouse thật hay số đo p95.

Production cutover vẫn chưa chạy: freeze writer cũ và đợi jobs kết thúc, final delta import/shadow compare, review mapping/owner identities, đồng bộ repository marker + DB epoch rồi mới bật một writer. Sau API writes phải maintenance/export/reconcile; không flip về Git JSON cũ. Không thay mode production chỉ bằng environment variable.


## Phase 3/4 local rehearsal

Read [ADR 0003](../decisions/0003-publications-requests-local.md). Production markers in `config/feature-sources.json` remain Git/epoch 0, independently for posts/media/requests. New local overrides `PUBLIC_CONTENT_MODE=api-local` and `PUBLIC_REQUESTS_MODE=api-local` require a loopback backend. Set the corresponding DB `private.feature_controls` row to API/epoch 1/writes enabled only in the disposable local DB after import. `build:pilot` enables all three plus comments; default build keeps Git forms/archives. No silent fallback to Git when API fails. A future cutover must freeze the matching archiver before API writes; do not change markers as part of this rehearsal.

- `/account/content/`: sign in, valid drafts autosave to DB after 1.8s, safe text/Markdown preview, submit for review, revision history, media provider preview/fallback, edit/delete own content. Invalid drafts remain in memory until valid; navigating away loses unsaved text and the session. A 409 keeps typed text and requires reloading/reviewing stored content. Owner reviews exact revisions in `/admin/`; public continues reading the last approved revision during edits/rejection. Owner can unpublish but cannot rewrite another author's text. Series names/order are scoped by verified author UUID.
- `/knowledge/`, `/music/`: API published lists replace only their shared submission feature in the pilot. Existing authored MDX, chapters and owner performances remain static. `/community/post/?id=...` and `/community/media/?id=...` are real VI/EN static shells with noindex; comments use the object's stable entity ID. These API pages are not added to Pagefind/graph or promised SSR/OpenGraph metadata.
- `/requests/`: public/mine board, status filter and cursor pagination; create a pending request; `/requests/detail/?id=...` shows scope, current result, paginated immutable history and discussion. Only the author edits scope. Owner independently approves/hides publication, accepts/updates progress, supplies a completion result and appends corrections targeting an event ID shown in history. Scope changes retain existing public approval (legacy behavior) but reset progress, accepted scope and current result. Both version and scope checks run inside the locking DB transaction.
- Existing `/requests/<number>/` and `/en/requests/<number>/` still build. In API mode the bridge resolves the imported legacy number, uses the old discussion entity and enforces current visibility. `node --import tsx scripts/migration/requests.mjs` is dry-run; `--apply`/`--compare` additionally require explicit loopback `LOCAL_DATABASE_URL`. Import preserves raw snapshot/timeline provenance privately, null author ownership, result/status/visibility and stable mappings; reruns change zero rows. A changed snapshot stops for delta review; no automatic rewrite after API writes. Full posts/media import and final deltas belong to Phase 5.

The Docker CI job now rehearses checked-in comments and requests imports before enabling local writers, runs real JWT/Edge/Data API tests for publications/requests and a scope-vs-complete race, then exercises the browser editor/review/board/detail paths. GitHub provider handoff is mocked; sessions/API/database are real local Supabase. The source `6181058` passed these real-stack and 2/2 Chromium workflows in CI; see progress for exact runs. Hosted staging, real OAuth, actual provider embedding restrictions, load targets, full migration/restore and production cutover remain unverified.


## Phase 5 verified local gates

[Release operations](backend-release.md) and ADR 0004 cover full submission import/rerun/shadow, maintenance/source controls, native PostgreSQL application/Auth restore, redacted observability and mixed load/cleanup. Backend source `d8c74a2` passed a full 14.5-minute 10/20/50 RPS profile with 12,900 operations, 20% writes, zero unexpected errors/drops and p95 below 2s for every phase/class. Frontend `00dbfc2` passed current VI/EN legacy bookmark/Series browser checks with identical backend code. See [progress](backend-progress.md) and [numeric report](backend-benchmark-2026-11-15.json) for exact CI evidence/limits. Raw dumps and session files remain ignored/private; only numeric summaries are artifacts. This is local CI proof; cloud/OAuth/hosted restore/global ingress/offsite/production cutovers remain open.
