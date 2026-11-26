# Guest social checkpoint — 26 November 2026

## Revision and workspace

Branch: codex/guest-social-interactions. Current implementation: ae0b41e16b151b9130ff3b334482ee3cb9da21c0 (includes security/tests and viewer focus fix). This checkpoint is a documentation-only descendant; use git rev-parse HEAD for its current hash. Latest main reverified unchanged: fa52a19cdd3cf50fc4b0e7bbda026c02461fc853. [Draft PR64](https://github.com/sugia279/hiens-nha/pull/64).

Managed worktree: C:/Users/ADMIN/.codex/worktrees/guest-social/hiens-nha. Original C:/Github_sugia279/hiens-nha and all unfinished codex/comment-reactions-avatars edits are preserved separately. No assets, imported chapters, source markers or workflow permissions changed.

## Completed implementation

- F1: Auth-issued guests, public-only comments/reactions, post-commit name/anonymous/provider dialog, same-tab reload/navigation, scoped storage, OAuth proof transfer/restoration, receipt transfer and reaction deduplication.
- F2/F3: one Heart/Smile/Wow picker, selected state/removal, live total, bounded display-only paginated details, keyboard/outside dismissal and guest/provider avatars. Laugh storage is retained.
- F4: visible owner Home logout using Auth Runtime; existing account/comment logout retained; private UI/session authority cleared and explicit login remains possible.
- DB guards deny guest publication/Requests/category mutations and owner authority. Existing domain validation, moderation, CAS, source/epoch/writers, RLS, quota and admission remain. Guests share the public read budget. Provider avatar query/fragment credentials are stripped; Unicode blank names rejected.

Decisions/contracts: [ADR0019](../decisions/0019-guest-social-interactions.md), [guest API](../api/guest-social.md), [release/setup/rollback](guest-social-release.md). Guest sessions use scoped sessionStorage; verified sessions retain ADR0016 localStorage. Provider tokens, PKCE and handoff proofs remain memory-only. Existing destination reactions win transfer conflicts; historical audit/revision actors remain.

Affected areas: Auth runtime/session/device storage and API client; Edge /me and comment DTO; comments controller/markup and new identity dialog; post interactions/publications and owner logout; guest restrictions in Requests/category UI; pure media/layout/profile-image validators and image reader for unchanged route budgets; five additive SQL migrations, backend/runtime/browser/native regressions, local-only CI provider preparation, current business/architecture/ADR/API docs. Inspect PR64's file list for exact paths.

## Verification evidence

Local: typecheck/Edge/audit pass (0 vulnerabilities), 87 content entries validated, 97 smoke tests, 26 artifact checks, 20,966 links with 0 broken, HTML validation and 2,102 pilot/production-fixture budget checks pass. Final largest measured pilot route: Graph 599,850 JS bytes against 600,000; headroom is small. Chrome stubs cover VI/EN name, anonymous, OAuth success/refusal/failure, reload, mobile overflow, details and Home logout. New SQL/runtime security tests cover isolation, quotas, private/deleted targets, proof/retry/ownership and failed handoff restoration.

Authoritative Linux runs for code ae0b41e: [quality](https://github.com/sugia279/hiens-nha/actions/runs/45853743089) and [backend/native](https://github.com/sugia279/hiens-nha/actions/runs/45853743111), both passed: 266 unit, 197 backend and 41 browser tests. The [full-duration native run on 397c732](https://github.com/sugia279/hiens-nha/actions/runs/45850799076) also passed: real Anonymous Auth JWT/RPC/handoff, concurrency, import atomicity, backup/restore, encrypted recovery, all browser tests and 10/20/50 RPS load (12,900 operations, 20% writes, zero unexpected failures/drops, worst stage p95 21.77 ms). These load numbers describe local CI, not hosted capacity. Windows full-suite failures remain documented limits (POSIX file mode, Unix fixture execution/OpenSSL, symlink privilege); tests were not skipped/relaxed. Browser provider stubs do not verify real Google/Facebook consent.

## Hosted and release state

Staging hitsdflorbqvoltsytxe: all five 20261126090000–20261126090400 guest migrations applied; api Edge v8 deployed, verify_jwt=false retained with handler-side caller verification. Owner signed into the dashboard and explicitly approved staging Anonymous Auth and exact VI/EN localhost callbacks. Anonymous sign-ins are now enabled; the existing 30 sign-ins/IP/hour limit, signup/email/manual-linking settings and roles were preserved. Redirect allowlist contains only http://127.0.0.1:4321/hiens-nha/account/callback/ and http://127.0.0.1:4321/hiens-nha/en/account/callback/. Existing Site URL remains http://localhost:3000. GitHub/Google/Facebook remain disabled; Google/Facebook credential fields are empty.

Hosted verification: two disposable real anonymous sessions exercised ten groups: guest /me and no-owner authority; immediate approved comment and concurrent idempotency; name/anonymous choice plus real refresh; reaction set/replace/remove and concurrent retry; bounded/paginated display-only details; cross-guest/owner spoof/publication/Requests/category/role/profile/Storage denials; private-target/input/proof denials; actual actor quota 429; deleted-target denial; and logout invalidating both refresh sessions. No verified provider/owner account or role was created. Tokens/proofs remained in memory. The harness needed assertion adaptation for cross-realm object prototypes and Storage's HTTP 400 Unauthorized/RLS response; all listed behavior was then verified, without changing application code.

Comments/posts writers were enabled only for the disposable fixture window and restored to false with control-event records. All synthetic fixtures, comments, reactions, profiles and Auth users were removed after signing out. Verified final counts: users/profiles/comments/posts/reactions/guest profiles/roles all zero; all sources api/epoch1 and all writers false. Sanitized local report: backend-test-results/guest-hosted-2026-11-26.json (ignored; no session data). Staging advisors: health empty; security/performance INFO notices only, including intentional private RLS deny-by-default tables; no grants were relaxed.

Production eqxlywwvchmzuyqtxexu: read-only compatibility check only; guest schema absent, Edge v7, all existing api/epoch1 writers enabled, one owner assignment. Public settings: GitHub enabled, Google/Facebook/anonymous disabled. No production SQL, Auth change, submission, Edge deployment, Pages release or merge performed.

## Exact next action / blockers

Read AGENTS.md and this checkpoint, then follow guest-social-release.md. Remaining external setup: owner enters separate staging Google/Facebook app credentials directly in dashboard; approve adding exact localhost origin to staging Edge ALLOWED_ORIGINS (current preflight returns 403, no bypass attempted). Then compile the staging frontend locally and verify real browser identity reload/navigation, provider success/refusal/failure, owner moderation/logout, VI/EN and desktop/mobile in another disposable fixture window. Native CI already covers these permission/UI contracts, but does not replace real provider consent. Restore fixtures/writers afterward. Only then request owner approval for production SQL/Edge/Auth settings and merge. Keep PR64 as draft until those release gates are satisfied. No OAuth credentials should enter chat/Git/logs.

## Viewer focus follow-up

An older full run exposed intermittent English search submission immediately after closing the photo viewer. A deterministic unit regression confirmed that the delayed close event stole focus from the search input. The close handler now restores photo focus only while focus remains inside the viewer/body. The input-focus and normal focus-restoration regressions both pass; no test timeout/retry was relaxed. This small fix is included after the guest code commits above. Latest-head Linux quality/contracts/native job had already passed with 197 backend tests and all 41 browser cases; full-duration code run is tracked separately.
