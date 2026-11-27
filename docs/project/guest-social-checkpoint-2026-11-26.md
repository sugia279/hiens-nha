# Guest social checkpoint — 28 November 2026

## Revision and next action

Production main **1c6061b6c9871b6cd7ad3c10d2cb924f7ca8fd19**, merged [PR65](https://github.com/sugia279/hiens-nha/pull/65), reviewed head94c079317dd41563b8ebd8eda44e6bebfc01b232. Current documentation branch codex/guest-social-release-checkpoint; use git rev-parse HEAD for its descendant. Worktree C:/Users/ADMIN/.codex/worktrees/guest-social/hiens-nha. Preserve separate dirty C:/Github_sugia279/hiens-nha and uploaded assets.

**Exact next action:** publish this documentation through normal PR checks, then resume owner-controlled GitHub setup for **https://suduyhien.github.io/**. The free organization registration page in Chrome is waiting at GitHub's DataDome CAPTCHA. Owner must complete verification/contact/Terms directly in GitHub. No destination organization/repository or publishing credential exists yet; registration availability is unproven. Review the separate hosting change before altering base/origins/Auth callbacks. Current live URL remains https://sugia279.github.io/hiens-nha/.

The latest owner request returns to suduyhien, superseding hiensu. Existing hiensu is explicitly not theirs; do not use it. A prior public suduyhien profile404 does not guarantee availability. Owner explicitly approved production SQL/PR65 merge/deploy, now complete. Do not request approval for those again or create/delete production test interactions.

## Completed behavior and affected files

- PR64/main427a0f4: Auth-issued guests for existing public comments/Home reactions. Interaction commits before identity dialog; name/anonymous choice persists in the same tab. Verified users skip it. Guest sanitized sessions use sessionStorage; verified sessions retain ADR0016 localStorage. Provider tokens/PKCE/proofs remain memory-only.
- Hashed single-use proof transfers only controlled guest interactions after verified OAuth, preserves receipts/history and deduplicates reactions; destination reactions win conflicts. Failed/canceled OAuth preserves original interactions. Guests cannot publish/upload/change Requests/categories/roles or read private content.
- Accessible Heart/Smile/Wow picker (stored laugh), toggle/replacement/live counts, bounded public display-only details; owner logout uses existing Auth Runtime.
- PR65/ADR0020: centered modal dialogs; owner-confirmed visitor-comment soft deletion with author-only editing/CAS/audit/quota/admission/source gates preserved; “Đổi tên / tài khoản”. Guests can rename their own interactions or explicitly sign out for a new identity on their next interaction. Old content remains; repeating a name cannot reclaim ownership. Google select_account; social-write counter blocks identity transitions until writes settle.
- Astro identity template/comment data attributes keep localized presentation outside JS and below unchanged budgets. tsconfig excludes generated ignored builds/reports, not source/tests. Delayed photo-viewer close no longer steals input focus.

Affected: Auth runtime/session/storage/client; GuestIdentityTemplate/guest-identity-dialog/auth-enabled; comments ApiComments/controller; content PublicationPanel/publications/post-interactions; SiteLayout/global.css; shared path/image validators; Edge me/comment DTO/social helpers; five guest SQL migrations plus owner-deletion SQL; runtime/backend/native/browser tests; business/architecture/development/API/OpenAPI/ADRs. See [ADR0019](../decisions/0019-guest-social-interactions.md), [ADR0020](../decisions/0020-social-identity-and-owner-comment-deletion.md), [guest API](../api/guest-social.md), [release/rollback](guest-social-release.md).

## Release and verification evidence

Owner approval preceded production SQL/merge. Reviewed head94c passed [Quality46059369491](https://github.com/sugia279/hiens-nha/actions/runs/46059369491) and [Backend46059369424](https://github.com/sugia279/hiens-nha/actions/runs/46059369424). Code abf21eb Linux gates passed266unit/204backend/41browser, native real-JWT owner delete/member denial/owner edit denial/CAS, guest isolation/proofs/retries/private targets/rate limits and VI/EN desktop/mobile rename/reset/provider failure/cancellation geometry cases.

Merged-main [Backend46060427937](https://github.com/sugia279/hiens-nha/actions/runs/46060427937) passed contracts/Edge/audit/native JWT/concurrency/import/recovery/all41browser and full14.5-minute load:12,900operations,20%writes, zero failures/drops, cleanuptrue; stage p95ms16.52/16.06/14.64/13.68/16.28. Disposable native local CI measurements, not hosted capacity.

Main [Pages46062872228](https://github.com/sugia279/hiens-nha/actions/runs/46062872228) passed all gates and deployed. Earlier46060427953 passed build/source checks but deploy initially saw zero artifacts immediately after upload; one job retry produced duplicate named artifacts. Fresh main workflow dispatch succeeded without changing/skipping checks or deleting artifacts.

Postdeploy live read-only: VI1280x720 and EN390x844 show public posts/reaction names/avatars, original VI content retained. Modal vertical center error<0.006px; mobile width336.667px, horizontal error0.167px, no overflow. Desktop centering uses client width excluding scrollbar. Viewport reset. No production test comment/reaction/account/reset/deletion performed; mutation authority/identity paths remain native/stub evidence.

Local:389sourcefiles typecheck0errors/0warnings/12existinghints; Edge/audit0vulnerabilities;87contententries;264routes/Pagefind248pages;97smoke;26artifact;20,966links/0broken;2102budgets passed. Linux fixture Graph599,383/600,000JSbytes, long-config599,515. Four existing Home HTML nesting warnings remain. Windows POSIX/Unix/OpenSSL/symlink limits were not bypassed (464pass,3assertionfailures,3setup-skips); Linux gates passed. Real hosted Google refusal/exchange failure and follow-up owner deletion not repeated using real accounts/data. Facebook deferred/unverified after Meta registration SMS failed.

## Hosted state — do not replay

Original five guest migrations20261126090000–20261126090400 applied to both projects. Edge stagingapi v9/productionapi v8 retain handler caller-JWT verification with verify_jwt=false. PR65 changed no Edge/Auth settings.

Owner-delete source20261127141528_owner_comment_deletion.sql SHA256(LF)557ed25e537390db24f35d2269510d9a00815f65d61d5b7caa7db75c59e36c25. Applied once stagingversion20261127144536 and productionversion20261127195816. Preserved writer normalized MD5 baseline8eceb3c4aaeb9f5d03451bf94936d7a5→4fc46f618fb70f76fd0d4f7a9b0ff989; guest wrapper4d47c3b85d2a26bcf19e6476f74c8016 unchanged. Empty search_path; raw implementation execute denied to anon/authenticated, wrapper auth-only. Only owner-delete authorization changed.

Production eqxlywwvchmzuyqtxexu before/after fingerprints equal:10comments,5reactions,8publications,16publicationrevisions,4media,1Request,1ownerrole and backend/featurecontrols. API/epoch1/writerson. Preserve all live accounts/interactions. [Numeric evidence](guest-social-followups-2026-11-27.json); ignored packet backend-test-results/release-2026-11-27/pr65-production-migration.json.

Staging hitsdflorbqvoltsytxe retains one real Google account/identity, zero comments/posts/reactions/media/Requests/revisions/roles; writersallfrozen/APIepoch1. Ten hosted guest-JWT groups and owner-consented Google transfer/name/avatar/reload/VI–EN/logout passed before cleanup. Do not delete retained account or run empty-target load against it. No staging owner role; native CI supplies owner authority test.

Both projects' current advisors:security1INFO/6WARNgroups, performance2INFOgroups, healthnone. Five generic anonymous-policy warnings assessed: raw audit/revision/profile/role SELECT grants denied; Storage DELETE requires private.is_owner(), rejecting guests. Sixth existing warning leaked-password protection disabled; password Auth disabled. No protections/grants relaxed. Supersedes older INFO-only staging notes.

Production Google/GitHub/anonymouson, Facebookoff, manual linkingoff,30anonymous/IP/hour, exact current VI/ENcallbacks/no localhost. Actual Google client **Hiens Nha** in **hiens-nha-production-516013**, distinct from staging, email/profileonly; External/Testing basic-sign-in exception checked, Branding/Publish unfinished. Similarly named hiens-nha-production project unused; do not delete/read secrets. select_account forwarding verified read-only on both hosted authorize endpoints.

Staging Google/anonymouson, GitHub/Facebookoff; owner-approved exact localhostVI/ENcallbacks and ALLOWED_ORIGINS=https://sugia279.github.io,http://127.0.0.1:4321; SiteURL localhost:3000. Production unlisted/localhost CORS denied.

## Recovery and remaining hosting work

Protected [backup46006487083](https://github.com/sugia279/hiens-nha/actions/runs/46006487083) created2026-11-27T13:30:28Z,6.45hours before PR65DDL. Artifact15202083298 expires2026-12-27T13:30:28Z. Local ZIP SHA256cdb28022c12d8866fa8324b99c9110f408bffc290f0d437bc0002a94a50c9dd1. Isolated restore65tables/734rows parity/permissions/owner/frozenwrites/cleanup passed. Offline decrypt of this artifact and full hosted/config/Storage recovery unverified. Never restore stale data over subsequent live interactions; use reviewed function-only rollback.

Remaining: establish suduyhien ownership, root Pages repo/narrow publishing access; review/build/test root base/canonicals/VI–EN/old-link query+hash redirects, exact CORS/Auth callbacks/Google origin and explicit reauthentication across origins. Existing sugia279/hiens-nha source ownership/DB/media/accounts/roles stay. No new host/credential/base/callback/origin change made.
