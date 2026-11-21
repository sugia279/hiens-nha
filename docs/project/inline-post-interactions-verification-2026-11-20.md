# Inline post interactions — 20 November 2026

**Delivery continuation — 21 November 2026:** The owner requested publishing after observing the old website. [PR61](https://github.com/sugia279/hiens-nha/pull/61) carries the frontend and additive migration through existing CI/Pages. The completed hosted/CI observations are below; the initial local/source-preparation notes are historical. Pages delivery still requires a successful merge/deploy and live smoke; this checkpoint does not claim those observations in advance.

## Hosted migration and Linux CI

Applied the exact checked-in `20261120103301_post_reactions.sql` from code head `e3c549f341e91e4f94a84068c6365118a2ef84ef`, first staging (`hitsdflorbqvoltsytxe`, hosted version `20261120163844`), then production (`eqxlywwvchmzuyqtxexu`, version `20261120163921`). No prior migrations were replayed. Both projects have RLS enabled on the new private table, no anonymous direct SELECT or member direct INSERT, invoker public wrappers, anonymous read allowed/write denied, member write allowed and unmetered helper access denied. Anonymous Data API POST read with an empty ID batch returned200/`[]` on both targets. No hosted content or reactions were created for testing.

Pre/post fingerprints are identical: production five publications (`03117493849c2a8c012e57944de7210b`), seven revisions (`1262fc5a4c48c1e22fc2bd75da6bfeff`), four comments (`459939cc30b62823323e70a00ed5a2fa`) and one owner (`697b7ddd30193a3961670c4f9d1f9710`). Staging remains empty for these records. Production posts/media/requests remain API/epoch1/writers enabled; staging remains API1/writers disabled. Existing photo/Storage bytes, role assignments, Auth provider settings and source markers were unchanged. Public/private post totals were observed read-only; the private-post controls remain visible but reaction/share disabled.

Security advisors add only the expected informational private-table deny-first [RLS/no-policy finding](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy): staging31 INFO, production29 INFO. Production retains its single pre-existing [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No new security warning or Auth-setting change was introduced.

Exact code-head Linux [CI44774681662](https://github.com/sugia279/hiens-nha/actions/runs/44774681662) and [Backend44774681571](https://github.com/sugia279/hiens-nha/actions/runs/44774681571) succeeded:260 unit tests,171 backend tests,97 smoke tests and31 browser tests. This resolves the local Windows-only failures as release evidence. Native checks include actual Auth-issued JWT/PostgREST reactions: anonymous write denial, private/unpublished visibility, caller isolation, selection/change/removal and eight concurrent same-value retries without duplicate counting. Existing native admission/import/rollback/backup/restore/Storage/recovery gates also passed. The full local10/20/50RPS profile had zero failures/drops and successful cleanup; these loopback CI measurements do not establish hosted performance or real Google/Facebook OAuth.

The remaining delta after that code head updates documentation only. Final PR checks and the Pages run remain separately observable from the PR link; no check is bypassed. The repository's `Archive guestbook`/Pages trigger pair and hosting remain unchanged.

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

## Initial delivery checklist (superseded by observations above)

Review the prepared source, run native/Linux gates, apply the additive reaction migration to staging then production, and deliver the frontend through the existing Pages workflow. Configure the owner-controlled Google/Facebook OAuth apps directly in Supabase if desired. Rollback guidance and the one-time login consequence of reverting to a v1-only frontend are in the [contract](../api/post-reactions.md). No hosted migration, commit/push/merge or frontend deployment was performed in this chat.
