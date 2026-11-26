# Guest social checkpoint — 26 November 2026

## Revision and workspace

Branch: codex/guest-social-interactions. Implementation: 093d230de962c858f01bad6f145552527cc6b7ce; security/test follow-up: 397c7323d0abf3c93404fbe7df6fa69f9b1c5cc1. This checkpoint is a documentation-only descendant; use git rev-parse HEAD for its current hash. Base/latest main verified: fa52a19cdd3cf50fc4b0e7bbda026c02461fc853. [Draft PR64](https://github.com/sugia279/hiens-nha/pull/64).

Managed worktree: C:/Users/ADMIN/.codex/worktrees/guest-social/hiens-nha. Original C:/Github_sugia279/hiens-nha and all unfinished codex/comment-reactions-avatars edits are preserved separately. No assets, imported chapters, source markers or workflow permissions changed.

## Completed implementation

- F1: Auth-issued guests, public-only comments/reactions, post-commit name/anonymous/provider dialog, same-tab reload/navigation, scoped storage, OAuth proof transfer/restoration, receipt transfer and reaction deduplication.
- F2/F3: one Heart/Smile/Wow picker, selected state/removal, live total, bounded display-only paginated details, keyboard/outside dismissal and guest/provider avatars. Laugh storage is retained.
- F4: visible owner Home logout using Auth Runtime; existing account/comment logout retained; private UI/session authority cleared and explicit login remains possible.
- DB guards deny guest publication/Requests/category mutations and owner authority. Existing domain validation, moderation, CAS, source/epoch/writers, RLS, quota and admission remain. Guests share the public read budget. Provider avatar query/fragment credentials are stripped; Unicode blank names rejected.

Decisions/contracts: [ADR0019](../decisions/0019-guest-social-interactions.md), [guest API](../api/guest-social.md), [release/setup/rollback](guest-social-release.md). Guest sessions use scoped sessionStorage; verified sessions retain ADR0016 localStorage. Provider tokens, PKCE and handoff proofs remain memory-only. Existing destination reactions win transfer conflicts; historical audit/revision actors remain.

Affected areas: Auth runtime/session/device storage and API client; Edge /me and comment DTO; comments controller/markup and new identity dialog; post interactions/publications and owner logout; guest restrictions in Requests/category UI; pure media/layout/profile-image validators and image reader for unchanged route budgets; five additive SQL migrations, backend/runtime/browser/native regressions, local-only CI provider preparation, current business/architecture/ADR/API docs. Inspect PR64's file list for exact paths.

## Verification evidence

Local: typecheck/Edge/audit pass (0 vulnerabilities), 87 content entries validated, 97 smoke tests, 26 artifact checks, 20,966 links with 0 broken, HTML validation and 2,102 pilot/production-fixture budget checks pass. Largest measured pilot route: Graph 599,772 JS bytes against 600,000; headroom is small. Chrome stubs: 10 social cases across VI/EN (name, anonymous, OAuth success/refusal/failure, reload, mobile overflow, details) plus 2 Home logout cases pass; existing navigation (2) and categories (1) pass. New SQL/runtime security tests cover isolation, quotas, private/deleted targets, proof/retry/ownership and failed handoff restoration.

Authoritative Linux runs for code commit 397c732: [quality](https://github.com/sugia279/hiens-nha/actions/runs/45850799119), [backend/native](https://github.com/sugia279/hiens-nha/actions/runs/45850799076). Quality and contracts passed at checkpoint publication. The native job includes real Anonymous Auth JWT/RPC/ownership/idempotency/handoff, concurrency, import atomicity, backup/restore, encrypted recovery, full 10/20/50 RPS load and the full browser suite; inspect its linked final result before release. Earlier 093d230 passed the native authority/recovery stages. Windows full-suite failures remain documented limits (POSIX file mode, Unix fixture execution/OpenSSL, symlink privilege); tests were not skipped/relaxed. Browser provider stubs do not verify real Google/Facebook consent.

## Hosted and release state

Staging hitsdflorbqvoltsytxe: all five 20261126090000–20261126090400 guest migrations applied; api Edge v8 deployed, verify_jwt=false retained with handler-side caller verification. RLS/grants/public read/unauthenticated denial checks pass. All content/role/guest counts remain zero. Sources stay api/epoch1; all writers remain false. Auth settings: GitHub/Google/Facebook/anonymous disabled. Dashboard requires login. No hosted test content or Auth accounts/settings were created/changed.

Production eqxlywwvchmzuyqtxexu: read-only compatibility check only; guest schema absent, Edge v7, all existing api/epoch1 writers enabled, one owner assignment. Public settings: GitHub enabled, Google/Facebook/anonymous disabled. No production SQL, Auth change, submission, Edge deployment, Pages release or merge performed.

## Exact next action / blockers

Read AGENTS.md and this checkpoint, inspect the linked PR CI results, then follow guest-social-release.md. Complete owner-controlled staging anonymous/provider configuration and a disposable writer/fixture window; verify real provider success/refusal, same-tab identity, private targets, moderation and logout. Restore staging writers/fixtures afterward. Only then request owner approval for production SQL/Edge/Auth settings and merge. Keep PR64 as draft until those release gates are satisfied. No OAuth credentials should enter chat/Git/logs.

## Viewer focus follow-up

An older full run exposed intermittent English search submission immediately after closing the photo viewer. A deterministic unit regression confirmed that the delayed close event stole focus from the search input. The close handler now restores photo focus only while focus remains inside the viewer/body. The input-focus and normal focus-restoration regressions both pass; no test timeout/retry was relaxed. This small fix is included after the guest code commits above. Latest-head Linux quality/contracts/native job had already passed with 197 backend tests and all 41 browser cases; full-duration code run is tracked separately.
