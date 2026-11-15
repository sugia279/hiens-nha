# Hướng dẫn phát triển và chống hồi quy

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

Phase 2 bổ sung `npm run build:pilot`, `npm run check:pilot` và `npm run backend:comments:dry-run`. `npm run test:backend` bao gồm DOM pending/retry/logout/XSS và migration/shadow/legacy ownership. Job Docker trong backend CI chạy real Auth JWT + RPC/concurrency/import, sau đó `npm run test:browser` với credentials local ignored; chỉ provider handoff được mock. Không báo browser test này là xác minh GitHub OAuth thật. Route budgets tính cả dependency dynamic; default aggregate cũ vẫn giữ.


Phase 3/4 thêm `features-db`, `features-http`, `publications-ui`, `requests-import` trong backend suite; CI local stack kiểm exact revision/public projection, direct RPC ownership, request scope-vs-complete CAS race và old bookmark mapping. Browser suite thêm editor/autosave/safe preview/owner review/API board/scope reset/VI–EN legacy bridge. Chạy `node --import tsx scripts/migration/requests.mjs` để dry-run request import, không đổi source markers. Đọc ADR 0003 và progress cho kết quả/giới hạn thực tế.


Phase 5: [release runbook](backend-release.md), ADR 0004, `release-import`, `traffic`, `load-model` tests; `backend:publications:dry-run`, `backend:restore:rehearse`, `backend:load`, `backend:control`, `backend:ops`. Operator tools require designated disposable loopback targets. Native backup/restore/load evidence comes from CI or a local Docker stack, not embedded PostgreSQL alone. Keep raw backups/session files out of logs/artifacts/Git.
