# Backend API + DB progress

Current: Phase 1 local foundation and Phase 2 comments pilot are verified at `fce4e32` by full Docker-backed Supabase/Chromium CI (35 backend tests). Local/CI work is ready for review; real GitHub OAuth, hosted staging, production cutover and load/release gates remain open. Earlier entries are historical snapshots.

## Milestone 0 — design freeze (2026-11-14)

- Branch: `feat/backend-foundation`; baseline `main@f3efbf33bc3f4dd75421b77762a96ab8bf1d5736`. Milestone commit: the commit containing this section (see `git log -- docs/project/backend-progress.md`).
- PR #19 was open/draft/unmerged; plan copied unchanged from `docs/backend-api-db-plan@c05ef1967098646ae125e0927c64c4ea0328da0e` before implementation. Existing main commits/archives/assets preserved.
- Read AGENTS.md and required README/business/architecture/development documents; only related auth/comments/routes/workflow code examined.
- Done: [ADR](../decisions/0001-backend-foundation.md), scoped checksum [inventory](backend-inventory.json), permissions/schema/rollback freeze and [load targets](backend-load-test.md). Full plan remains proposed beyond the accepted Phase 0–1 slice.
- Decisions: keep Pages/Astro/Git writers; local Supabase foundation, memory-only auth, owner by verified UUID, caller-scoped JWT, DB RPC authority; author-only text editing; owner moderation; production writes disabled.
- Checks: inventory generation succeeded; no imports, deploys or cloud writes. OpenAPI contract added with Phase 1 implementation. Runtime tests pending.
- Blockers: no Docker/Supabase runtime initially installed; cloud/OAuth/owner/billing unset. Inventory is a source checksum baseline, not an import rehearsal or proof of entity/author mapping.
- Next: implement migration/RLS/RPC/API/auth shells, automated negative permission tests; report embedded PostgreSQL versus real Supabase coverage separately.

## Milestone 1A — local foundation implementation (2026-11-14)

- Branch: `feat/backend-foundation`; Phase 0 commit `877dd4a`. Implementation commit: the commit containing this milestone (`git log -- docs/project/backend-progress.md`).
- Done: pinned SDK/CLI/Deno; local config (no cloud link); fresh migration for profiles/owner/entities/comments/revisions/audit; explicit grants + RLS + private transactional RPC; author-only edit/delete, owner moderation, pending/public separation, optimistic versions, idempotent create, 30/member/min mutation quota, DB kill switch default false.
- Done: portable DTOs, [OpenAPI](../api/backend-v1.openapi.json), thin caller-JWT Edge routes, strict CORS/input/body-size/cursor errors and request-ID-only logs; API client; memory-only PKCE popup auth and VI/EN account/callback/admin shells (no comment composer or moderation UI).
- Decisions: no email profile mirroring; no moderator role; owner does not edit another author's body; approved replies disappear publicly when their root is hidden. Every existing feature remains Git-backed. Cloud envs/production workflows unchanged. Separate backend CI only tests, never deploys.
- Verified so far: 22 backend tests pass (embedded PostgreSQL + HTTP/client/SDK transport), 227 existing unit tests pass, Deno entry/import graph typecheck passes, Astro check 0 errors/0 warnings; 87 published content entries validated. SQL syntax issue found by fresh migration test was fixed before passing; no checks bypassed.
- Tooling: `tsx` CLI cannot open its local IPC pipe in this executor; documented `node --import tsx scripts/<name>.ts` equivalent used for validation/build gates. Initial Deno registry fetch failed; using existing pinned node_modules with `--node-modules-dir=manual` succeeds without network resolution.
- Blockers / unverified: `supabase start` fails because Docker and Podman are absent. Embedded DB uses real PostgreSQL semantics with a minimal auth schema and simulated claims; no real Auth-issued JWT/PostgREST/Edge gateway, OAuth browser/provider, multi-session race, cloud staging, backup/restore or load measurements yet. Supplied full-stack integration command is deliberately environment-required; it has not passed here.
- Missing external setup: owner-controlled Supabase account, region/tier/billing, OAuth app/callback, verified owner auth UUID, secure local/staging env configuration. No secrets requested or committed.
- Next: finish existing-site quality gates, review diff and save final verification milestone; then run full local stack + real-JWT/OAuth checks on a container-enabled machine. Phase 2 UI/import/shadow reads/cutover stay deferred.

## Milestone 1B — Pages compatibility and browser bundle (2026-11-14)

- Branch `feat/backend-foundation`; implementation `c9be4da`; follow-up commit is the commit containing this section.
- Existing static build/routes pass: 93 smoke tests (including 6 VI/EN backend shells), artifact verification 26/26, 21,530 links / 0 broken, HTML validation. Default Pages budgets pass 1277/1277 (515 KiB JS, existing 600,000-byte limit unchanged).
- The first build exposed a real regression: full Supabase browser SDK pushed total JS to 742 KiB. Fixed by using the matching pinned auth-only SDK in browser and statically omitting the backend module from the default disabled Pages build. SDK remains on Edge/Node only. This does not enable production login or comments.
- Edge and browser both reject configured secret/service-role keys. SDK transport test checks caller Authorization and singular RPC representation. Added committed-response guard and same-origin callback privacy metadata; no raw error/token/body logging.
- Still unverified: provider popup behavior, actual local Supabase, staging and performance. Disabled production build budgets do not establish latency/capacity or approval to enable backend.

## Milestone 1C — final local verification and remaining gates (2026-11-14)

- Branch `feat/backend-foundation`; design `877dd4a`, foundation `c9be4da`, browser isolation `f33a126`. Final verification commit: the commit containing this section. Main ref rechecked: still `f3efbf33bc3f4dd75421b77762a96ab8bf1d5736`, no intervening commits to merge.
- Phase 0 deliverables complete for the accepted slice. Phase 1 implementation is present locally, **exit gate is NOT complete** until real Supabase/Auth/browser/staging checks pass. No claim of a production-ready backend.
- Passed: 22 backend tests, 227 existing unit tests, Deno check, Astro check (0 errors/warnings), content validation (87 published entries), default production build, 93 smoke tests, artifact 26/26, 21,530 links with 0 broken, HTML validation, default Pages budgets 1277/1277. Tests use synthetic fixtures; no real submissions, API provisioning or production deploy.
- Enabled configuration build also compiles, but **raw total JS is 639,687 bytes, exceeding the unchanged 600,000-byte existing budget**. Default disabled build is 527,621 bytes. This is a known release blocker before enabling backend in Pages, not a passing enabled-mode performance gate. An alternative minifier experiment did not solve it and was reverted; no unrelated graph code or budget threshold was changed. Decide/implement a measured per-route loading/budget strategy before any enablement; do not silently raise or bypass the existing check.
- Browser smoke attempt could not launch Chromium: executor denies its singleton socket. Real popup/login/callback/logout/refresh browser verification remains unperformed; unit tests of message origin/source and memory storage are not equivalent.
- Full Supabase start remains blocked by missing Docker/Podman; JWT/Auth/PostgREST integration runner is supplied but not run. No multi-session concurrency, staging, backup restore, cloud quota/IP protection or load benchmark was verified. 10–20 RPS steady, 50 RPS burst, p95 <2s are targets to measure, with read-only k6 harness and mixed-write plan prepared.
- Next in order: container-enabled machine → fresh local reset and real-JWT direct-RPC tests → GitHub OAuth provider/browser tests and owner bootstrap → enabled Pages bundle gate → staging/account/region/tier setup after owner decisions → Phase 2 composer/moderation UI/import rehearsal. Existing features remain Git mode throughout this work.

## Published review branch

Branch: `feat/backend-foundation`. Git HTTPS push was unavailable in the executor, so GitHub's connected API published the same trees (each tree SHA compared exactly to local Git before publishing). Commit authorship metadata differs; original local milestone commits remain preserved locally.

| Milestone | Local commit | Published commit |
| --- | --- | --- |
| Design freeze | `877dd4a` | `03cfb8cdcf37807a6d18e0694b2019496c40c4c0` |
| Foundation | `c9be4da` | `da8c89a16dfd43c5684ca338978b1adb5964ea38` |
| Browser isolation | `f33a126` | `ef59149f50d3cfbd2f2c0d3d4e6db2bace5da4d1` |
| Verification | `a52e056` | `84c88f5cc3891f97306974f8b3bf268320790ddf` |

The commit adding this mapping only updates this progress document. Review is draft; no merge, production deploy or cloud provisioning is performed. CI status must be checked separately from local results above.

## Milestone 1D — review CI (2026-11-14)

- Branch `feat/backend-foundation`; tested commit `69efa83b8bb84d9b91eebc4a37cf0442e32089d7`.
- [Site CI run 21](https://github.com/sugia279/hiens-nha/actions/runs/43614034234) succeeded, including all original quality gates and the default disabled-backend production build. [Backend foundation checks run 1](https://github.com/sugia279/hiens-nha/actions/runs/43614034312) succeeded (embedded DB/HTTP/client contracts and Deno check).
- [PR #21](https://github.com/sugia279/hiens-nha/pull/21) remains draft. This evidence does not close real Supabase/OAuth/browser, enabled-mode bundle, staging or performance gates listed above. No merge/deploy/cutover.
- The commit recording this result changes documentation only; runtime source is identical to the tested commit. Next step remains full local stack on a container-enabled machine and the known enablement blockers.

## Milestone 1E / 2A — Phase 1 follow-up and comments pilot implementation (2026-11-14)

- Branch `feat/backend-foundation`, continuation from `6182057`; main rechecked at `f3efbf3`, worktree initially clean. Milestone commit is the commit containing this section.
- Done: shared canonical context and registered-entity resolver; source/epoch/write-state checks; paginated root threads and one-level replies; own-comment view; safe text composer, same-key retry, pending labels, author edit/delete, owner moderation with reasons/version conflict; admin queue; guestbook API aggregation; shared memory-only auth runtime with lazy SDK and logout/stale-response protection. Default production source remains Git, no dual-write/cutover.
- Done: migration expansion for unclaimed legacy attribution/provenance; null-owner SQL checks deny edits; local-only transactional/idempotent import + anon-RLS shadow reconciliation. Dry-run of current archives found 123 canonical entities / 2 records. No production import or legacy account claim.
- Done: ADR 0002 records explicit route-budget measurement. Original default aggregate gate remains; enabled pilot uses the same 600,000-byte per-route ceiling including static AND lazy dependency closure. Total emitted inventory stays visible; the earlier all-assets enabled aggregate is not called passing. Default and enabled build/check commands are separate.
- Verified locally so far: 33 backend SQL/HTTP/DOM/import/source tests; Astro check 0 errors/warnings; fresh expanded migrations in embedded PostgreSQL; default/pilot builds and route budgets. Existing unit/full static gates are being rerun before final handoff.
- Added isolated Docker-backed CI job for real Supabase Auth-issued JWTs, direct Data API/RPC, version/idempotency races, refresh, archive import/shadow rehearsal and browser flow. Provider/code exchange only is mocked; backend endpoints use actual local services. This new job has not yet passed at this milestone. No hosted credentials or provisioning.
- Blockers/unverified: this executor still cannot run Docker/Chromium; real GitHub provider configuration, hosted staging/region/tier/billing, verified real owner UUID, load capacity/p95 and production cutover are outstanding. Need CI evidence before claiming the full-stack pilot gate.
- Next: run new CI, fix failures, complete regression checks and record final evidence; keep PR draft until external gates are satisfied.

## Milestone 1F / 2B — full local stack verified in CI (2026-11-14)

- Branch `feat/backend-foundation`; local implementation `3de14ec` published as `b8e9893fd1b0fc8efb0f9fa2722908c6540b8a4b` with identical tree `95b0765bbc58204a7c3585370e9df59ac016608d`. Original local milestone is preserved under `local/comments-pilot-milestone`.
- [Site CI run 23](https://github.com/sugia279/hiens-nha/actions/runs/43618073391): success. [Backend checks run 3](https://github.com/sugia279/hiens-nha/actions/runs/43618073403): success, both contracts and **Local Supabase and browser pilot** jobs.
- Real CI evidence: fresh Supabase migrations, Auth-issued A/B/owner JWTs, member metadata cannot grant owner, direct Data API/RPC deny rules, pending/public visibility, author-only edits, owner review, stale-version rejection, concurrent same-key create deduplication and competing edits (one 200 / one 409), actual local Auth refresh. Import/shadow comparison retained 2 public legacy records. Chromium 1 test passed: pending → owner approve → public refetch without rebuild, one-level reply, VI/EN same thread, approved edit hides root/reply, own view, XSS rendered as text, logout clears private UI/storage.
- Provider/code exchange only was mocked. API, Auth verification, PostgREST and PostgreSQL were real local services in CI. This is not proof of actual GitHub OAuth consent/redirect or hosted-region performance. This executor still lacks Docker/browser socket access; CI supplied those runtimes.
- Local regression evidence: 33 backend tests, 229 original/unit+budget tests, 93 smoke; Astro/Deno checks; build artifact 26/26; 21,661 links with 0 broken; HTML validation. Default JS 527,623 bytes and default aggregate/per-route gates pass. CI enabled inventory 651,087 bytes; largest route graph 574,814 < 600,000, with dynamic chunks included. Default 1785 / pilot 1784 static checks pass; these are not real Lighthouse scores.
- Follow-up in this milestone: added actual-stack idempotent import rerun and legacy username-collision checks, clarified current runbook/API schema; their new CI run must pass before final handoff. No cloud/production writes.
- Remaining external/release gates: real GitHub OAuth app/client/callback and verified real owner UUID; owner-controlled Supabase project/region/tier/billing and staging; production final-delta/import/source-epoch cutover signoff. IP/read-abuse protection, retention/restore and 10–20 RPS / 50 burst / p95 target remain unmeasured release work. Current production stays Git, backend disabled.

## Milestone 1G — auth refresh race guard (2026-11-14)

- Continuation after published follow-up `250bec49fd3aa7d915b22d199cc4e318f090853f` (local `4b93af3`, preserved under `local/comments-pilot-followup`).
- Added a generation guard to identity refresh: an old `/me` response cannot restore a session after an automatic SIGNED_OUT event. Logout completion also cannot overwrite a newer auth state. Added a deferred-response regression test; permission authority remains in DB.
- Re-run auth/backend tests and CI on this code before final handoff. No new provider/cloud/production work.

Follow-up evidence: commit `250bec49fd3aa7d915b22d199cc4e318f090853f` passed [site CI 24](https://github.com/sugia279/hiens-nha/actions/runs/43618879104) and [backend CI 4](https://github.com/sugia279/hiens-nha/actions/runs/43618879095), including Docker/Chromium. Thus actual local import rerun (changed 0) and real-JWT legacy ownership collisions are verified; auth-generation guard is the next tested change. Route-byte scope excludes runtime-computed external/data/WASM requests, so this is not a total network budget.

## Milestone 1H — verified-session read scope (2026-11-14)

- Previous auth-generation guard: local `0bee77a`, published `d968ab3ea0850fa453a005ede4b336a94b7d8ba0`. Preserve this exact source when reviewing CI evidence.
- Browser API reads now attach a session token only after `/me` has verified the current UI identity. `/me` alone may use the pending session for verification; signed-out/unverified reads stay anonymous even if SDK storage still has a token. This prevents private pending text being fetched during a not-yet-verified UI state. Added a regression covering before verification, verified member and SIGNED_OUT; DB/RLS remains the authority.
- Final gate requires the new 35-test backend suite and full-stack CI; previous passing source remains recorded above. No production enablement.

## Milestone 1I / 2C — local/CI handoff

- Branch `feat/backend-foundation`; final runtime source `fce4e32fa9237066a5af17ce232442fb300c5e9d` (local `7b86fa0`, preserved under `local/comments-verified-session`). Previous auth guard `d968ab3` also passed site/backend CI 25/5.
- [Site CI 26](https://github.com/sugia279/hiens-nha/actions/runs/43619908831): success. [Backend CI 6](https://github.com/sugia279/hiens-nha/actions/runs/43619908824): success, contracts and Docker-backed Supabase/Chromium pilot. 35 backend tests, 229 unit tests, 93 smoke tests; original quality gates and Deno checks pass. The new auth-generation and unverified-read regressions pass.
- Real local service evidence includes fresh migrations, A/B/owner Auth JWTs, RLS/direct RPC denial, version/idempotency races, refresh, import rerun changed 0 + public shadow match, and legacy username collision denied. Browser test passed through real API/Auth/PostgREST/DB; only the provider/code exchange is mocked. Pending/edit/one-level reply/moderation/VI-EN/logout are exercised without a GitHub rebuild.
- Latest CI enabled inventory: 651194 bytes; max route graph/index.html 574921 < 600,000. This uses ADR 0002's manifest dependency closure, not the former enabled aggregate metric or a network benchmark. Default aggregate ceiling remains unchanged and passes.
- Phase 1 foundation and Phase 2 pilot **local/CI implementation are complete for review**. Full roadmap exit gates involving real OAuth/staging and production remain open: owner Supabase account/project, region/tier/billing, real GitHub app/callback + verified owner UUID, staging rehearsal/restore/abuse controls, production final-delta/source-epoch signoff, measured 10–20 RPS / 50 burst / p95 <2s. Browser sessions intentionally remain page-memory only.
- [PR #21](https://github.com/sugia279/hiens-nha/pull/21) remains draft. Production source is still Git, no merge/deploy/cutover/cloud provisioning, original archives/assets/routes preserved. The commit adding this handoff changes only this progress document; tested runtime source remains identical to the verified commit.


## Phase 3/4 implementation checkpoint — 2026-11-15

- Branch `feat/backend-foundation`; base `91e3d6a` (Phases 0–2), main `f3efbf3`; local milestone commit is the commit containing this entry. PR #21 stays draft; no merge/cutover. Earlier milestones above remain evidence for their exact commit, not claims that cloud phases are complete.
- Phase 3 implemented locally: typed publication/revision DB, working vs published pointer, author-only edits/delete, exact revision owner review/unpublish, category/tags/author-scoped series/order slots; server draft autosave/retry/CAS, safe text/Markdown and media previews/fallback, My Content and revision history, VI/EN query shells and API public lists. Reused portable legacy validators. Production MDX/assets/routes remain intact.
- Phase 4 implemented locally: public/mine/owner board + status/cursor filtering, detail/scope form, owner approval/progress/result/correction UI, immutable events and scoped/versioned locking transactions. Approval differs from acceptance; changed scope resets progress/result/acceptance. Legacy request dry-run/import/reconcile/number bridge retains old discussion identity and unclaimed authorship. Changed legacy snapshot requires delta review.
- Decisions: ADR 0003. Separate feature sources remain Git/epoch 0/writes disabled; loopback API pilot only. New tables private/RLS deny-first; caller RPCs enforce authority/quota/idempotency. No production or cloud account/billing action.
- Local verification: 48 backend tests passed including fresh migrations in embedded PostgreSQL, direct grants/RLS, safe DTOs, ownership, published-old-revision, series collision, requests result/reset/CAS and idempotent legacy import; 229 unit + 93 smoke tests passed. Astro check 0 errors/warnings/hints; Deno check passed; default/pilot builds passed; 87 published entries validated; 26 build checks, 22,711 links (0 broken), HTML accessibility, byte budgets passed. Default JS inventory 527,625 bytes; enabled all-feature pilot inventory 674,973 bytes with every static/lazy route graph below the unchanged 600,000 ceiling. This is a byte check, not Lighthouse/p95.
- Real Supabase/Chromium tests added for this milestone but not yet verified: executor has no usable Docker/browser runtime; GitHub CI will run the disposable real local stack, imports, actual JWT/direct RPC/races and browser workflows. Provider handoff is mocked; real GitHub OAuth remains unverified.
- Blockers/release gates: owner OAuth app/redirect secrets, staging project/region/tier/budget decisions; real provider/embed policies; full posts/media import and final deltas, backup/restore, operational hardening and production cutovers (Phase 5). Load plan expanded for all text features: steady 10–20 RPS, burst 50 RPS, p95 <2s remains unmeasured, mixed-write load harness/seed/cleanup still needed.
- Next: publish this isolated branch checkpoint, inspect CI, fix any integration failures, then record exact tested source/run. Do not call these phases production-complete.

### CI correction checkpoint

Source `977e2b3` (tree matches local milestone `69b8114`) passed 48 backend contracts and Deno in CI, but default build failed before stack startup: formatter introduced fragments inside native selects and self-closing raw-text controls. Replaced those structures with explicit HTML containers/closing controls; full default build now passes again locally. Removed a redundant idempotent-delete branch. Integration/browser gates remain pending until the corrected source is tested; no failing check was bypassed.

### Real-stack checkpoint and media default correction

At `b1e1272`, CI run [43641969147](https://github.com/sugia279/hiens-nha/actions/runs/43641969147) passed fresh real Supabase startup, comments/requests import + zero-change rerun/shadow, actual Auth JWT/Edge/direct RPC checks, publication projection/ownership, request scope-vs-complete (exactly one 200 and one 409), correction preservation and VI/EN legacy mapping. The existing Chromium comments flow passed. The new browser flow reached post save/review/public-read/unapproved-edit successfully, then found that switching from posts to a fresh media draft inherited an invalid category. Fixed the media default and added a DOM regression; the requests browser portion was not reached on that run.

Added enabled-pilot HTML accessibility to CI (default gate alone does not render API forms), explicit input types, and the same existing exported CV exclusion for the pilot output as default output. Added SQL/JS Unicode trim and UTF-16 length parity coverage. All-feature pilot browser rerun remains pending. Full static CI at `b1e1272` is separate from this pending integration gate.

## Phase 3/4 local/CI handoff — verified source `6181058`

- Branch: `feat/backend-foundation`, draft [PR #21](https://github.com/sugia279/hiens-nha/pull/21). Tested implementation commit: `61810580be6cdfd0fa6da9feed88516a8ec420d6`; local equivalent `48e722b` has the same tree. This final handoff commit updates documentation only. Main remains `f3efbf3`; no merge, production writer change, cloud provisioning or billing choice.
- Completed implementation: Phase 3 posts/media drafts, serial autosave, safe previews, revision history, category/tags/author-scoped series/order, own content management, owner exact-revision moderation and retained public revision; Phase 4 API board/detail/status filters, own scope form, owner-only progress/publication/result/correction, immutable events, atomic scope/version checks and legacy numeric route/discussion bridge. Source markers remain Git/epoch 0 in repository and DB defaults.
- Decisions: ADR 0003. Approval differs from acceptance; editing an approved request retains legacy publication approval but resets operational acceptance/progress/current result. Pending publication revisions stay private. Author alone rewrites their content; owner reviews/unpublishes. Legacy authors remain unclaimed. Scope-vs-complete can have only one CAS winner. No dual writer or fallback to stale snapshots after API failure.
- Verified: [Backend checks + real local Supabase + Chromium](https://github.com/sugia279/hiens-nha/actions/runs/43642401499) **success**, [full static CI](https://github.com/sugia279/hiens-nha/actions/runs/43642401489) **success**. 50 backend SQL/HTTP/DOM/import/source tests, Deno check, 229 unit tests, 93 smoke tests, Astro check, content/build/link/default accessibility/budgets all passed. Enabled-pilot accessibility/budgets passed too. CI pilot JS inventory 675,283 bytes (local dummy-key build 675,159), maximum route dependency graph 576,380 bytes in CI (576,256 locally), below the unchanged 600,000 ceiling.
- Real-stack evidence: fresh migrations; actual local Auth-issued JWTs and refresh; direct Data API/RPC negative checks; idempotency/version races; published-old-revision after unapproved edit; source/ownership/moderation; request approval vs acceptance, completion result, scope-vs-complete exactly one 200/one 409; immutable correction; old numeric/VI–EN entity mapping. Checked-in comments (2 records) and requests (1 record) imports/shadow match and zero-change reruns passed.
- Chromium: **2/2 workflows passed**. Existing comments pending/replies/edit/delete/moderation/logout flow; new post autosave/preview/submit/owner review/public read/unapproved edit, media creation/provider preview, request submit/approve/accept/scope reset and EN legacy route. Only OAuth provider/code exchange was mocked; backend requests used actual local Supabase. No real GitHub consent or hosted staging claim.
- Still unverified: real OAuth/provider app/callback and target-browser popup behavior; hosted project/region/tier/cost/latency; actual external provider embed availability; full posts/media import and final deltas; backup/restore; production operations/cutover; mixed-write load harness/fixtures and measured 10–20 RPS steady / 50 RPS burst / p95 <2s. No benchmark or SLA claimed. Client-only content SEO/Pagefind/graph remains limited as documented.
- Next milestone: Phase 5 release hardening and staging setup once owner account/OAuth/project/region/budget details are available. Rehearse full migration + restore and measure load before any production cutover. Phases 3/4 are complete for the local/CI scope; this does not mean production launch is complete.

## Phase 5 local implementation checkpoint — 2026-11-15

- Branch `feat/backend-foundation`, base `98360ac`, main `f3efbf3`; PR #21 open/draft/unmerged, PR #19 plan still draft/unmerged (read its branch). Latest main fetched, worktree was clean and no user changes overwritten. Commit is the commit containing this entry.
- Implemented: ADR 0004; full local posts/media import/dry-run/shadow + idempotent rerun and explicit legacy-series namespace/tombstones/source URL/order preservation; request tombstone/delta hardening; SHARE-locked DB write gates with expected-state operator freeze/source controls and no stale Git rollback after API writes; private control audit; native PostgreSQL application/Auth dump/temporary restore/count/checksum/RLS/maintenance rehearsal; open-arrival mixed load harness with CI/full profiles, identity seed, quota abuse, reconciliation/cleanup; bounded worker transport guard and redacted route/duration/status logs; quota/backup-age ops report and operator release checklist.
- Local validation at checkpoint: 57 backend tests pass; Deno passes. Astro/build/full static gates are being completed. Native dump/restore and actual load measurements are not yet verified because this executor has no Docker/native PG/k6; a disposable real Supabase CI job is being extended to run them. Node harness avoids a k6 dependency.
- Decisions: each production source remains Git/epoch 0; loopback cutover/maintenance only. Auth roles are not inferred or widened. The worker connection bound is not a distributed IP limit. Local backup scope uses existing cluster roles/extension prerequisites; no hosted/offsite/Auth-provider/Storage-byte recovery claim. No cloud or production action.
- Blockers: real OAuth app/verified owner UUID, project/region/tier/budget/staging origin/secrets, hosted global abuse/monitoring/offsite restore and representative network tests. Before production posts cutover, shared-series discovery/search boundaries need an API-aware review; stale archive read models must not be presented as current DB content.
- Next: run CI against real stack, fix integration failures, run full 10/20/50 RPS duration profile, record measured numbers and unverified gates, retain draft PR/no production cutover.
