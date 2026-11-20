# Inline post interactions — 20 November 2026

**Delivery continuation:** The owner requested publishing after observing the old website. The feature is being committed and checked through the existing PR/Pages flow. `local-stack.mjs` now includes real-JWT reaction grants/public visibility/actor isolation/concurrent retry checks on its disposable social-post fixture. Hosted preflight confirmed the reaction table is absent on both projects; production retains five publications/one owner and API1 writers, staging retains zero publications/owners and disabled writers. Final migration/CI/Pages observations will be appended below; earlier source-preparation notes are historical.

Source preparation on `codex/inline-post-interactions`, based on current `origin/main@df7cb2f`. The initial checkout was clean; fetch + fast-forward confirmed main current. No user commits, archives, uploaded assets, markers, hosted data or ownership changed. No commit/push/merge/Pages deployment or hosted reaction migration was performed.

Implemented the requested Home interaction bar with Heart/Laugh/Wow, inline comments, guest provider dialog and copy-link/fallback. Persistent sessions supersede the seven-day app limit, retaining provider-token/PKCE exclusions and server identity verification. [ADR0016](../decisions/0016-inline-post-interactions.md) records the contract and data flow; [RPC contract](../api/post-reactions.md) describes rollout/rollback.

Read-only production Auth settings returned HTTP200 with GitHub=true, Google=false and Facebook=false. The chooser accurately disables unconfigured providers. Google/Facebook credentials and real provider login remain external setup; no credentials were requested in chat or saved to Git. Existing account login remains direct GitHub; the new chooser is scoped to post interactions to preserve route budgets.

## Verified locally

| Check | Result |
| --- | --- |
| Clean dependency install + audit | `npm ci` completed; audit at low severity found 0 vulnerabilities. Reinstall resolved the previously documented nested picomatch drift without changing the lockfile. |
| Related regressions | 7 files / 32 tests passed: DB reactions, interaction/dialog UI, device sessions, API client, Auth runtime, comments UI and publications UI. |
| Complete unit/backend run | 67 files passed / 4 failed; 425 tests passed / 3 failed / 3 skipped, with one suite setup failure (431 tests total). Details below; this is not a green full-suite result. |
| Astro check | 375 files, 0 errors / 0 warnings; 12 existing vendor/deprecation hints. |
| Edge check / content | Passed; 87 published entries validated. |
| Backend-enabled production-shaped build + Pagefind | Passed with public disposable loopback config; 264 generated pages plus existing static HTML. No hosted content submitted. |
| Smoke | 11 files / 97 tests passed. The single live Home discussion is asserted separately from the inert lazy post-comment template. |
| Artifact / links | 26/26 checks; 20,824 links checked, 0 broken. |
| HTML validation | Exit0, no errors; 4 existing Home nested-header/footer warnings remain. Lazy post comments have a separate accessible label and unique form IDs. |
| Static budgets/metadata | 2,102/2,102 passed. Maximum JS: Graph VI/EN 599,604 bytes under the unchanged 600,000-byte ceiling; aggregate CSS about88KiB, under100,000 bytes. These are static artifact checks, not a Lighthouse performance score. |
| Chrome / Playwright | 5 tests passed: inline interactions VI/EN, session/navigation/logout, widgets and shared categories. Mobile layout inspected at390px with no interaction-bar overflow. |

Regressions cover anonymous/provider gating, disabled providers and discovery retries, Google PKCE handoff, reply-target preservation after guest login, one reaction/change/removal, idempotent failed-write retry, stale read/mutation suppression, >50 loaded posts batched safely, author isolation, private/deleted/unpublished post denial, shared admission, writer maintenance, clipboard fallback, VI/EN URLs, literal unsafe text, unique textarea IDs, provider-token stripping, reload/new-tab/logout and legacy v1 session migration. Read admission precedes feature/publication locks, matching existing write wrappers; native concurrency is still unverified here.

Browser tests use mocked Auth/API and synthetic posts only; DB tests use disposable PGlite. They do not establish real Google/Facebook OAuth, hosted JWT/RLS or production performance. Docker's Linux engine is unavailable, so native real-JWT/PostgREST/concurrency/integration tests were not run. No hosted test fixtures were created. Native integration and exact-head Linux CI remain required before any merge/deploy.

## Unresolved Windows checks

The complete suite retains the same environment failures documented in the [category verification record](navigation-categories-verification-2026-11-20.md): `legacy-features-freeze` cannot create its directory symlink (EPERM); `hosted-recovery` sees0666 instead of POSIX0600; `recovery-roles` uses a Unix executable/PATH shim; `recovery-ca` setup cannot find OpenSSL (ENOENT, its three tests skipped after setup failure). No assertion was removed, weakened or relabelled as passing. Node26 requires `NODE_OPTIONS=--no-experimental-webstorage` to avoid shadowing happy-dom's storage; the full-suite command used `vitest run tests/unit tests/backend --maxWorkers=2` because Windows passes npm's backend glob literally. Installed dependencies were repaired; these remaining environment limits were not bypassed.

## Delivery remaining

Review the prepared source, run native/Linux gates, apply the additive reaction migration to staging then production, and deliver the frontend through the existing Pages workflow. Configure the owner-controlled Google/Facebook OAuth apps directly in Supabase if desired. Rollback guidance and the one-time login consequence of reverting to a v1-only frontend are in the [contract](../api/post-reactions.md). No hosted migration, commit/push/merge or frontend deployment was performed in this chat.
