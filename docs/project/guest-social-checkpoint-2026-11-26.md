# Guest social implementation checkpoint — 26 November 2026

Branch `codex/guest-social-interactions`; implementation commit `093d230de962c858f01bad6f145552527cc6b7ce`, base `fa52a19cdd3cf50fc4b0e7bbda026c02461fc853`; [draft PR64](https://github.com/sugia279/hiens-nha/pull/64). Latest main fetched and verified at task start. Clean managed worktree: `C:/Users/ADMIN/.codex/worktrees/guest-social/hiens-nha`. Original checkout and its unfinished `codex/comment-reactions-avatars` edits are preserved separately; do not copy/overwrite them.

## Milestone A / foundation

Read AGENTS and requested current docs in order, traced Auth/Edge/RPC/UI. ADR0019 records the guest threat model and OAuth handoff. Additive migrations `20261126090000_guest_social.sql` and `20261126090100_guest_identity_details.sql` retain source/epoch/writers, private RLS, admission and quota. Guest scope is public comments and post reactions only; explicit denial for publication/Requests/category mutations, owner authority and Storage. No role assignments changed.

Foundation/UI candidate implemented: tab-scoped sanitized anonymous Auth sessions, post-commit name/anonymous/provider dialog, proof-based guest transfer, reaction picker and bounded public details, owner logout. Files touched are Auth runtime/session/device storage, API client and Edge `/me`, comments controller/markup/DTO, publication interaction/controller/markup, inline login, new identity dialog, SQL, tests, and CI local-only anonymous signup preparation. See `git diff --stat` for the exact current set.

Verification so far: 7 new embedded PostgreSQL security/contract tests, existing comments UI (7), reaction UI (6), device session (5), Auth runtime (3) pass in targeted runs. These use SQL claims or stubs, not real JWT/OAuth evidence. Full backend, build and Edge checks are in progress; no release readiness claim. Docker Desktop engine is unavailable locally. CI/native/real JWT/staging/provider flows remain required.

Read-only production `/auth/v1/settings` returned HTTP 200 on 26 November: GitHub enabled, Google/Facebook/anonymous signup disabled. No production interaction was submitted. No production settings, DB, Edge deployment, merge or Pages release changed.

Pending: finish runtime OAuth success/failure/cancel/race tests and VI/EN/mobile browser stubs; add real-JWT guest regression to existing disposable integration suite; complete unit/backend/Edge/typecheck/build/smoke/link/HTML/budget/audit gates; update current business/architecture/API/setup/rollback docs; commit/push and create PR; verify CI and staging. Production migration/settings/merge need owner approval. Staging management credentials/access have not yet been established.

Exact next action: inspect running verification logs and finish new browser/runtime/native regressions, then run the required gates. Never treat this checkpoint's candidate implementation as deployed.

## Milestone B — local verification and staging schema

All F1–F4 candidate paths are implemented. Added guest signup/identity/OAuth transitions with guest-session restoration, key-preserving transfer receipts, one-per-account reaction conflict handling, popup/details and owner logout. Broader guest publishing/Requests/category forms are hidden/rejected; existing permanent-user paths remain. Pure validators and the site-wide image reader are separated to preserve the 600,000-byte route JS ceiling. No uploaded asset changed.

Evidence: typecheck (0 errors), Edge check and npm audit (0 vulnerabilities); 87 content entries validated; 97 smoke tests; artifact verification 26/26; 20,966 links with 0 broken; HTML validation passed. The pilot route budget passed 2,102/2,102 after extracting the shared profile-image validator; production-fixture rebuild/gates are being repeated on final source. Browser stubs: 10 social cases (both locales × named/anonymous/OAuth success/refusal/failure), plus owner logout (2), navigation (2) and categories (1) pass in installed Chrome; mobile overflow and same-tab guest reload covered. Runtime/SQL checks include post-commit prompt, concurrent signup, restore on provider refusal, ownership/quota/private rejection and handoff retry receipts. Full backend on Windows: 42 files pass/190 tests pass; three environment-dependent recovery suites fail (POSIX mode, Unix shell fixture execution, openssl missing), with 3 setup-dependent tests unrun. Full unit: 30 files/263 tests pass, one symlink privilege failure. These failures are not skipped or relaxed; Linux/native CI is required.

Staging hitsdflorbqvoltsytxe: five additive guest migrations applied (including admission and retry receipt follow-ups); Edge api v8 deployed with existing caller verification/verify_jwt=false. RLS/grant checks passed; old implementation grants denied. Comments/posts/reactions/role counts remain zero. Every source stays api/epoch1; all staging writers stay false. Read-only health 200, unauthenticated /me 401, empty reaction read 200, unauthenticated identity 401. Staging Auth settings show GitHub/Google/Facebook/anonymous disabled; production read-only settings show GitHub enabled, other three disabled. No hosted test content/accounts created; no Auth settings changed. Real staging guest/provider flows remain unverified until staging Auth/provider configuration and a disposable writer/fixture window.

Pending: finalize/repeat source checks, publish a draft PR and follow native CI to completion. Finish staging Auth and real provider verification, then request explicit owner approval for production migration/Edge/Auth settings and merge. No production mutation or merge is authorized by this record. Exact next action: read final build/browser logs and PR CI; use guest-social-release.md for outstanding setup, never old cutover SQL.

## PR / security follow-up

PR64 is open as a draft. Linux quality gates and the complete contracts job passed on 093d230. Real local guest JWT/RPC/idempotency/handoff, native admission concurrency, import atomicity, backup/restore and encrypted recovery gates have passed; the native load/browser job is still running. All 12 final social/logout Chrome stubs passed locally.

A fifth additive migration normalizes Unicode whitespace using the existing trim helper and strips query/fragment credentials from public provider avatar URLs; tests cover blank Unicode names and an avatar URL containing a synthetic access_token parameter. Guest/anon shared read admission and restore after handoff commit failure have explicit regressions. The fifth migration is applied to staging only; all staging writers/settings/counts remain unchanged. The dashboard is signed out here, so Auth configuration requires owner-controlled dashboard access. No credentials were requested or printed.

Next: publish this follow-up, wait for CI on the new head, update this record with final results; then complete staging Auth/provider flows before production approval.
