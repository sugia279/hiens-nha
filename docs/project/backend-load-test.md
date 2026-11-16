# Backend text API load test — measurement plan

Target (now measured for the full local CI workload below, not hosted capacity or SLA): steady **10 and 20 requests/second**, burst **50 requests/second**, text API **p95 < 2 seconds**. Excludes OAuth, uploads and external players. Test local then isolated staging in the candidate region, using a generator near representative Vietnamese clients. Never point the harness at production.

This is the project's acceptance budget, not a universal provider standard or a requirement that every individual request finishes within2s. The implementation uses strict `<2000ms` (exactly2000ms fails), for every phase and every observed operation class; p50/p99/max and failures remain visible. A single first health response of7–8s does not establish the workload's p95 or its cause. Report initial/idle observations separately; do not label them cold starts without evidence, discard them, or raise the threshold merely to make a run pass. A proposed7s threshold is not adopted. For this site's interactive text operations the recommended existing budget stays p95<2s, with sub-second responses desirable. This API budget excludes browser rendering and is distinct from UI responsiveness metrics. [NN/G response-time guidance](https://www.nngroup.com/articles/response-times-3-important-limits/) provides UX context, not an API SLA.

Use open-arrival-rate k6 scenarios: 10 RPS / 2 min warm-up, 10 RPS / 5 min, 20 RPS / 5 min, 50 RPS / 30 s, 10 RPS / 2 min recovery. Report each scenario independently; do not hide burst/tail behavior in one combined percentile. Reads 80%, creates/edits/moderation 20% in the full pilot run, with enough fixture identities to stay inside per-user quotas (30 mutations/min/member by default). Separate quota abuse run must produce 429 without duplicate commits. Measure public and authenticated reads separately to expose Auth verification cost. The original k6 harness is read-only. Phase 5 adds `tests/load/local.mjs`, a loopback-only open-arrival Node harness with mixed writes/owner review, fixture identities, separate quota abuse, projection/scope reconciliation and cleanup; see [release operations](backend-release.md).

Phase 3/4 workload matrix: paginate published posts/media and public/own requests alongside comments; write mix includes draft save/submit/review, request scope/accept/progress/completion. Use separate author/owner fixture identities, valid expected versions and idempotency keys. Add a deliberate scope-vs-complete contention case; classify expected 409 separately and confirm exactly one winner. Reconcile published pointers, unapproved body visibility, accepted scope, immutable event counts and legacy mapping after the run. Measure text endpoints only; iframe/provider latency is excluded.

Record commit, CPU/runtime, CLI versions, DB size/region/tier, generator location, VUs, achieved RPS, dropped iterations, p50/p95/p99, 4xx/429/5xx/timeouts, cold/warm starts, DB connections/locks, query plan and resource/quota metrics. Hard failure: any 5xx, unexpected authorization result, failed operation mislabeled success, dropped iterations, nonzero unexpected error rate or scenario p95 >= 2 s. Expected 429 is reported separately from success latency. Reconcile row counts/versions and idempotency after writes; pending must never leak under load.

Run `k6 run tests/load/comments.js` with `API_BASE`, `PUBLISHABLE_KEY`, `ENTITY_ID`, `ALLOW_LOAD_TEST=local-or-staging`; auth token optional via environment. Fixture entity must be pre-registered. Archive redacted output outside source; never log JWTs or private bodies. Hosted staging needs explicit account/region/tier/OAuth setup and budget/quota review first. The original harness addition had no measurements; the full local CI run is now recorded below.


Run `BACKEND_LOAD_PROFILE=full npm run backend:load` in the designated disposable local environment (`ALLOW_LOCAL_REHEARSAL=hiens-nha-disposable` outside CI). `ci` is a short integration profile and must not be described as the full-duration gate. Both retain the 10/20/50 RPS rates, report each phase separately and fail any unexpected error/drop or p95 >=2s. Setup and cleanup are outside the measured phases; no quota counters are reset during measurement. See progress for exact environment, duration, workload and results; adding the harness alone does not establish capacity. Hosted staging/representative Vietnam latency remains a separate gate.

CI chooses the full 14.5-minute duration for backend/DB/load/dependency changes; documentation/UI-only followups run the short profile plus all normal permission/restore/browser gates. Unknown diff information selects full. Source/result metadata records the actual chosen profile.


## Verified full local run after dependency remediation — 2026-11-15

Implementation `b7d06b7`, [CI run 43666470099](https://github.com/sugia279/hiens-nha/actions/runs/43666470099), [numeric report](backend-benchmark-2026-11-15.json). Stack: Node 22.23.4, PostgreSQL 17.11, Ubuntu GitHub runner, Intel Xeon 6975P-C, 4 available CPUs/~16 GB RAM, Auth/Edge/PostgREST/DB over loopback. 24 synthetic member identities plus the existing disposable owner; approximately 1 KB post/scope, 500-char media and 250-char comment bodies. OAuth/provider/player calls were excluded.

| Phase | Offered/achieved RPS | Duration | Completed | p95 (ms) | Errors / drops |
| --- | --- | --- | --- | --- | --- |
| Warm-up | 10 | 120 s | 1,200 | 12.58 | 0 / 0 |
| Steady | 10 | 300 s | 3,000 | 12.28 | 0 / 0 |
| Steady | 20 | 300 s | 6,000 | 11.90 | 0 / 0 |
| Burst | 50 | 30 s | 1,500 | 10.02 | 0 / 0 |
| Recovery | 10 | 120 s | 1,200 | 12.04 | 0 / 0 |

12,900 measured HTTP operations, exactly 80% reads / 20% writes in each phase, all successful. Every operation class passed p95 <2s (worst 17.21ms); maximum observed client latency 218.35ms. Peak generator concurrency 11/150; no dropped work. DB samples every 5s: 173 samples, max11 connections/2 active/0 waiting locks, max probe3ms; sampled host load1 max2.21. These are sampled observations. Edge's validated log summary counted exactly 12,900 requests, handler p95 8ms/max50ms, zero >=1s; no raw logs or request/user IDs were retained. Database size grew from 12,965,555 to 18,060,979 bytes before cleanup.

Separate quota abuse produced expected 429 at a seeded 30/min boundary and idempotent replay retained one object. Public/scope reconciliation passed (48 published rows,25 requests,986 events). Cleanup removed 24 synthetic profiles,48 publications,25 requests,313 comments plus Auth identities. Native application/Auth restore passed 56 tables/363 rows with exact checksums and disabled restored writes.

The earlier pre-upgrade `d8c74a2` [full run](https://github.com/sugia279/hiens-nha/actions/runs/43659596025) also passed ([baseline numeric report](backend-benchmark-2026-11-15-baseline.json)); the security-upgrade failure below remains part of the evidence. No performance fix or root cause for that spike is claimed. This repeat closes the latest local workload gate, not sustained reliability, upper capacity, production SLA, cold-start behavior or representative Vietnam-to-staging latency. Hosted repeated measurements with chosen region/tier, ingress controls and real OAuth remain release gates.

## Security-upgrade attempt 1 — retained failure

Source `01d949a`, [run 43664843197](https://github.com/sugia279/hiens-nha/actions/runs/43664843197), [numeric failure](backend-benchmark-2026-11-15-security-attempt1.json): 12,900 operations/0 errors/0 drops, steady10/steady20/burst50 p95 13.30/12.24/11.59ms, but recovery **write:comments p95 2829.38ms** failed the unchanged <2s per-class gate. Recovery aggregate p99 2924.10ms/max4059.06ms. Generator lag remained low and sampled DB locks were zero; cause unverified. Cleanup/reconciliation passed, downstream browser steps skipped. A repeat adds bounded numeric diagnostics without loosening gates. A later pass does not erase this failed observation or prove sustained hosted reliability.
