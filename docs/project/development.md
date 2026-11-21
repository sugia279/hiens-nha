**Update 19 November 2026 — resource catalog and media frames:** [ADR0014](../decisions/0017-media-resources-post-layouts.md) adds private media resource/asset tables, revision-scoped resource references and Banner-compatible layouts/frames. Home previews up to four mixed photos/videos under a shorter text field; MP4/WebM videos are capped at 20 MiB. Successful posting refreshes the Home feed. Existing images remain readable without moving files. Only current-project Storage is active; remote resource brokers and automatic capacity routing are not enabled.

**Update 19 November 2026 — social composer and device sessions:** [ADR0013](../decisions/0013-device-session-social-composer.md) supersedes the earlier memory-only lifetime. Sessions can survive reload/new tabs for up to seven days in the same browser, with API verification before private UI actions and device-local logout. Home uses an owner status dialog with manually entered people/place/feeling, up to four private Storage image attachments, and Public/Only me selection. The feed uses newest-first cards; only the owner sees own drafts. Account editing and existing per-post discussions remain. No source/epoch/role assignment changes.

# Hướng dẫn phát triển và chống hồi quy

## Inline post interactions — ADR0016

Run `node node_modules/vitest/vitest.mjs run tests/backend/post-reactions.test.ts tests/backend/post-interactions-ui.test.ts tests/backend/device-session.test.ts tests/backend/client.test.ts tests/backend/auth-runtime.test.ts tests/backend/comments-ui.test.ts tests/backend/publications-ui.test.ts` plus existing backend/unit gates, typecheck, Edge check, content validation, build/smoke/links/HTML/budgets. `tests/browser/post-interactions.spec.ts` exercises VI/EN inline comments, guest provider dialog, disabled providers, Google PKCE handoff, reaction change/removal, unique textarea IDs, copy URL, reload persistence, provider-token stripping and mobile overflow using disposable browser stubs. Run it with the existing navigation/category browser suites. Unit tests cover unavailable clipboard/provider discovery, failed mutation retries, late responses, logout and legacy-session compatibility. DB tests cover anonymous/direct-table denial, public-only targets, same-value retries, per-actor isolation, quotas and shared admission. These do not establish real hosted JWT/OAuth or concurrency/load results. On Windows use `vitest run tests/backend --maxWorkers=2` if npm's literal shell glob finds no tests; Node26 requires the previously documented `NODE_OPTIONS=--no-experimental-webstorage` for happy-dom storage. Never skip/relax the POSIX security tests to make a Windows run pass.

## Quy trình thay đổi

1. Cập nhật main, kiểm tra worktree; giữ mọi commit/dữ liệu mới của người dùng (nhất là archive bot, ảnh vừa upload). Tạo branch riêng, không reset/force push main.
2. Đọc Business và Architecture; nêu trigger → hành vi cũ → hành vi mới, data/permission/routes bị ảnh hưởng. Nếu thay ownership, private/public, schema hay hosting thì viết ADR trước khi code.
3. Tìm validator và read model hiện hữu bằng `rg`. Tách business thuần khỏi UI/GitHub I/O; không nhân bản cùng rule trong nhiều page.
4. Viết tests cho thay đổi có rủi ro: quyền truy cập, transitions, deletion/edit replay, archive compatibility, URL safety. Chỉnh UI nhỏ không cần test chỉ lặp lại CSS.
5. Implement cả VI/EN, empty states, invalid input, unavailable storage/API và link fallback. Không tạo mẫu demo giả vào data production.
6. Kiểm tra theo bảng dưới, sửa lỗi, cập nhật docs/diagrams/contract cùng PR. PR ghi kết quả và giới hạn thực tế; không gọi một iframe render thành công là chứng minh mọi video đều phát được.
7. CI xanh mới merge. Chờ Pages thành công; xác minh trang liên quan. Rollback source qua revert commit/PR nếu cần, không xóa dữ liệu thật. Thay đổi schema cần restore/migration riêng, không chỉ revert UI.

## Lệnh kiểm tra

Branch backend dùng Node **>=22.23.4** (bản ghim trong `.nvmrc`), Astro 7.4.12/MDX 8.1.6. Content Layer giữ ID nguyên relative filename, gồm `.md`/`.mdx`, Unicode, khoảng trắng và chữ hoa; `connections.target.id`/series references phải khớp ID đó. Standalone validator dùng cùng quy tắc với build. Manifest client dùng để tính cả lazy imports; không nới ngân sách 600,000-byte JS / 100,000-byte CSS. CI backend chạy `npm audit --audit-level=low` cho tất cả scopes.

```sh
npm ci
npm run check
npm run validate:content
npm run test:unit
npm run build
npm run test:smoke
npm run verify:build
npm run check:links
npm run test:a11y
npm run check:lighthouse
```

Trong executor chặn IPC của CLI `tsx`, dùng `node --import tsx scripts/<name>.ts` tương ứng. Unit trước build; smoke, links, HTML và budgets sau build sạch. `test:a11y` là HTML validation, không phải audit WCAG toàn diện. `check:lighthouse` là static budget/metadata checks, không phải kết quả Lighthouse performance ngoài trình duyệt. Không báo vượt mức bằng chứng.

## Regression map

| Đụng vào đâu | Tests/luồng cần giữ |
| --- | --- |
| Request domain | `tests/unit/requests.test.ts`: schema, owner giả, transitions, completed/result, reopen, edits/deletes, deterministic replay |
| Archive adapter | Test pagination, API error không ghi file, deletion tombstone, marker removal/unapproval; workflows hiện hữu vẫn archive ba feature cũ |
| Requests views/routes | `tests/smoke/requests.test.ts`, build VI/EN; empty board, detail routes generated chỉ cho approved; browser form/filter với fixture local đã xóa |
| Navigation/header/base | Sidebar/icon/i18n/URL unit+smoke; laptop giữ nhánh, phone tự đóng, tablet giữ, query/hash/locale không mất |
| Knowledge/media | Unit validators, archived compatibility, approved/unapproved, safe player URL, line breaks; smoke bilingual |
| Photos | Unit token/upload, schema; smoke Home/gallery; số lượng theo metadata; full-res paths tồn tại; Escape/focus/1:1 browser |
| Authored content/novels | Content validator/references/series, import normalization, smoke 84 chương và URL cũ, graph/search output |
| Workflow hoặc hosting | Toàn bộ CI + archive/deploy coupling; main phải lấy mới nhất; thử payload worker bằng mock trước khi dùng real issue |

## Contracts không được phá âm thầm

- Marker và schema `v1` là format lưu trữ công khai. Muốn đổi field bắt buộc phải có adapter/backward compatibility hoặc migration có version và tests.
- Duyệt công khai tách biệt trạng thái tác nghiệp. Chưa duyệt không có route detail; label removal/deletion thu hồi sau deployment.
- Chỉ owner đổi trạng thái Requests; `completed` có result; đóng GitHub issue không suy diễn thành hoàn thành. Không tự nâng quyền sang mọi collaborator.
- Không render user input bằng `set:html`/MDX; URL provider kiểm tra host chính xác, không substring match.
- Không lưu secrets vào localStorage/GitHub issues/repository/log. Token ảnh chỉ memory và owner opt-in; không dùng token owner cho khách.
- Logical paths → URL utility; enumerate EN cho mọi route mới; không tự dịch content gốc; giữ bookmarks/imported chapters.
- Không bỏ kiểm tra để làm CI xanh. Photo count không hardcode; không sửa tests thành “chấp nhận mọi thứ”.

## Prompt mẫu để giao AI

> Đọc AGENTS.md và docs/project/README.md, business.md, architecture.md, development.md. Implement [mục tiêu] với ví dụ [trigger → kết quả]. Trước khi sửa, chỉ ra business contracts/routes/data/permissions bị tác động và các file hiện hữu cần tái sử dụng. Giữ tương thích archive v1, base path và VI/EN. Thêm tests phù hợp cho hành vi có rủi ro, chạy quality gates, cập nhật docs/diagrams. Không thêm backend, token, quyền hoặc public/private change ngoài phạm vi. Báo kết quả kiểm chứng, giới hạn còn lại và migration/rollback nếu có.

## Xử lý sự cố

| Triệu chứng | Kiểm tra |
| --- | --- |
| Thêm ảnh mà Home chưa hiện | Asset path chính xác + metadata + featuredOrder + Pages run |
| Issue chưa lên website | Đúng marker, JSON valid, đúng approval label, Archive thành công, Pages thành công |
| Request không đổi status | Comment từ owner đúng login? Marker đầu body? JSON/status/transition/result hợp lệ? `rejectedUpdates` có ID nào? |
| Gỡ label vẫn thấy dữ liệu | Chờ archive/deploy, tải lại; cache và GitHub issue/history không bị xóa bởi label |
| Bot commit không deploy | `workflow_run` còn nghe tên `Archive guestbook`? Workflow kết thúc success? |
| API lỗi | Worker fail, giữ snapshot cũ; sửa quyền/token/rate limit rồi rerun issue number; không giả success |
| Trang EN/asset 404 | Route enumeration, base URL utility, exact-case path, build/link checks |

Tương lai: tạo ADR cho multi-operator, private requests, backend/DB, anonymous submit, notifications, realtime. Đây chưa là tính năng hiện tại. Không ghi roadmap thành khả năng đã có.

## Backend foundation local

Đọc [ADR 0001](../decisions/0001-backend-foundation.md), [OpenAPI](../api/backend-v1.openapi.json), [runbook](backend-local.md) và [progress](backend-progress.md) trước khi sửa auth/API/SQL. Chạy thêm `npm run test:backend` và `npm run check:edge`; workflow `Backend foundation checks` kiểm tra hai gate này, không deploy. Với Docker/Podman + Supabase local, chạy `npm run test:backend:integration` theo runbook; thiếu môi trường phải báo chưa kiểm chứng. Gate load 10–20 RPS/burst 50 và p95 <2s chỉ đạt khi có số đo, không suy ra từ unit tests.

Phase 2 bổ sung `npm run build:pilot`, `npm run check:pilot` và `npm run backend:comments:dry-run`. `npm run test:backend` bao gồm DOM pending/retry/logout/XSS và migration/shadow/legacy ownership. Job Docker trong backend CI chạy real Auth JWT + RPC/concurrency/import, sau đó `npm run test:browser` với credentials local ignored; chỉ provider handoff được mock. Không báo browser test này là xác minh GitHub OAuth thật. Route budgets tính cả dependency dynamic; backend-disabled aggregate cũ vẫn giữ. ADR0005 áp dụng per-route gate cho mọi artifact backend-enabled, kể cả login với nguồn Git; marker boolean trên document root quyết định policy. CI build cả disabled và enabled với public fixture, không gọi Auth thật.


Phase 3/4 thêm `features-db`, `features-http`, `publications-ui`, `requests-import` trong backend suite; CI local stack kiểm exact revision/public projection, direct RPC ownership, request scope-vs-complete CAS race và old bookmark mapping. Browser suite thêm editor/autosave/safe preview/owner review/API board/scope reset/VI–EN legacy bridge. Chạy `node --import tsx scripts/migration/requests.mjs` để dry-run request import, không đổi source markers. Đọc ADR 0003 và progress cho kết quả/giới hạn thực tế.


Phase 5: [release runbook](backend-release.md), ADR 0004, `release-import`, `traffic`, `load-model` tests; `backend:publications:dry-run`, `backend:restore:rehearse`, `backend:load`, `backend:control`, `backend:ops`. Operator tools require designated disposable loopback targets. Native backup/restore/load evidence comes from CI or a local Docker stack, not embedded PostgreSQL alone. Keep raw backups/session files out of logs/artifacts/Git.

Hosted shadow import: [ADR0006](../decisions/0006-hosted-shadow-import.md), `hosted-packet` backend tests and `backend:hosted:prepare`. Preparation is offline and builds fresh contexts from an exact reviewed commit; existing network CLIs remain loopback-only. CI also rehearses generated SQL against isolated disposable native PostgreSQL databases. Raw packets stay mode0600 in ignored `backend-test-results/`; upload only the numeric native summary, never packet JSON/SQL or provenance. This is not a source switch or hosted recovery/load test.

Production smoke tests read expected per-feature source/epoch from versioned config. Git mode retains legacy form/snapshot assertions; API mode requires an enabled document, the correct API panel/epoch and on-site entry controls, and rejects the migrated feature's Git form. Before a source-switch commit, compile and run smoke against both source configurations in an isolated worktree; restore temporary markers. Marker/API production CI configuration and real hosted gates still belong to the actual cutover.

Navigation/Auth lifecycle: ADR0007, `page-lifecycle` unit regression and browser `navigation.spec.ts`. Backend-enabled builds use Astro ClientRouter; mount new page DOM once and dispose subscriptions/global listeners/timers before swap. Never persist JWTs/verifiers in browser storage. The navigation browser test stubs Auth/API to isolate UI state; existing real-JWT integration/browser suites remain required for authority. Reload/new-tab ends local memory session.

Hosted recovery preparation: ADR0008 and [operator runbook](hosted-recovery.md). `hosted-recovery` backend tests check target/context/recipient guards, SHA256 fingerprints, restored ownership/RLS/frozen writes, process redaction/bounds and artifact quota. Native CI uses local fixtures only, an exported snapshot/concurrent write, pg_dump/restore and synthetic age decrypt/tamper checks. Only the manual main-only protected workflow receives a hosted DB secret; raw dumps/identities are never artifacts.


Shared admission (ADR0009): `read-admission` and `operations-watch` backend tests verify bounded counters, POST RPC/grant denials, role/pending visibility, pagination and exact alert boundaries. Native CI runs `tests/backend/read-admission-native.mjs` in a new disposable loopback database (12 concurrent transactions, no hosted target), plus existing real-JWT/browser/load/recovery gates. Direct content-table SELECT is intentionally denied; use metered RPCs. Recovery supports both deployed pre-admission and proposed metered schemas; source projection is read-only and operator-only. See [production operations](production-operations.md) for deployment/residual gates.


Legacy posts/media/requests maintenance: ADR0011 and `config/legacy-features.json`. Each default flag is false and must remain independent of the source/epoch and comments marker. Run unit marker/actual-CLI early-exit checks and smoke against open and the selected frozen feature in an isolated build before activating it. Smoke requires either its Git form, a localized maintenance notice without submit/update invitations, or the API panel at the reviewed epoch. Keep approved data and route inventories unchanged; restore temporary config after preview. These checks never establish hosted freeze/drain/final delta or enable a writer.


Production baseline18/11/2026: all four sources are API/epoch1, legacy publication frozen and API writers enabled under approved V1 limits; see phase5-release-2026-11-18.md. Read actual current controls/main before changes; never replay old cutover SQL. Keep hostile picomatch regressions and complete dependency audit; the private fork has its own maintenance obligation. Reversible UI work must preserve current API markers, original receipts, legacy route aliases, VI/EN and permission boundaries.


## Immediate social comments (ADR0014)

Run the new `immediate-comments` backend suite along with `comments-ui`, `read-admission`, all existing backend/unit/smoke checks and the build. `database.test.ts` deliberately tests the older foundation/pilot migrations in isolation; its pending assertions remain historical migration compatibility coverage. Current-schema tests cover immediate anonymous visibility, author-only/CAS mutations, replies disappearing with hidden parents, no edit-based moderation bypass, no bulk publishing, XSS-as-text, retry keys, collapsed Home composer, auth changes and lifecycle disposal. The real-JWT integration/browser suite expects new comments/edits to be approved immediately; use disposable fixtures only. Hosted migration must precede the UI rollout.
## Navigation and categories — ADR0015

Run `node node_modules/vitest/vitest.mjs run tests/unit/content-categories.test.ts tests/backend/content-categories.test.ts tests/backend/category-ui.test.ts tests/backend/publications-ui.test.ts`, the existing photo/sidebar/social-post suites, then typecheck/build/full smoke/links/HTML/budgets. New regressions cover Enter/blur single-save, Escape/blank/IME, failed input retention, literal unsafe labels, menu/picker synchronization, scoped deduplication, direct RPC validation/RLS/admission/quota, and backward-compatible tagged photo metadata. `tests/browser/content-categories.spec.ts` uses mocked Auth/API only; it is not hosted/OAuth authority evidence. On Windows the static browser server uses `path.relative` containment. `PLAYWRIGHT_DIST=dist` selects a built fixture; `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can point to an installed Chrome for local checks. Defaults remain `.pilot-dist` and Playwright Chromium in CI. Hosted category RPC/JWT verification remains separate from PGlite and browser stubs. The user handles Git branch/commit for this change.

Keep gallery rendering in the Photos entry and editable picker behavior in the `CategoryPicker` entry; the site-wide menu controller shares their in-memory catalogue without importing those entries. The route budget counts lazy imports too, so a conditional dynamic import from the global controller would still charge every route. Preserve page-lifecycle disposal and test Graph → custom album → VI/EN navigation. See the [20 November verification checkpoint](navigation-categories-verification-2026-11-20.md) for local results, Windows workarounds and pending hosted migrations.
The later authorized rollout in that record supersedes its initial pending-migration and user-managed-Git checkpoint. Do not replay either migration on staging or production.
