**21 November 2026 — inline post interactions:** [ADR0016](../decisions/0016-inline-post-interactions.md) adds Heart/Laugh/Wow, inline discussions and copy-link under Home posts. Anonymous interaction opens a provider chooser; only verified accounts write reactions. Browser sessions have no application deadline, superseding the seven-day limit below. Reaction SQL is applied to staging and production with unchanged content/ownership/source controls. [PR61](https://github.com/sugia279/hiens-nha/pull/61) delivers the frontend through the existing Pages workflow; code-head Linux/native CI passed all gates. GitHub is enabled; Google/Facebook remain unconfigured. See [contract](../api/post-reactions.md) and [verification](inline-post-interactions-verification-2026-11-20.md) for exact observations and limits.

**20 November 2026 — comments/category database rollout:** ADR0014 and ADR0015 migrations are applied to staging and production, with category RPC/grant/RLS checks and unchanged existing comment fingerprints and source/epoch/writers. Page-specific category controllers restore the route JS budget. See the [verification and rollout record](navigation-categories-verification-2026-11-20.md); exact PR checks and Pages delivery remain separately observable on GitHub. The owner authorized committing, testing, merging and deploying this follow-up.

**19 November 2026 — navigation and categories:** [ADR0015](../decisions/0015-content-categories.md) prepares the five-item sidebar (Home, Photos, Video, Writing, About), shared categories and editable upload pickers. See the [category RPC contract](../api/content-categories.md). The 20 November record above supersedes this preparation checkpoint's unverified hosted status.

**Update 19 November 2026 — Home and comments:** [ADR0014](../decisions/0014-immediate-social-comments.md) supersedes the earlier pending-on-create/edit comment policy. New signed-in comments/replies publish immediately; author edits to hidden/rejected content retain that status. No bulk approval of old records. Home removes room cards/promotion and routine success text, and expands its inline composer from “Để lại vài dòng cho Hiển”. Feed, routes, author/owner checks and API/epoch markers remain. Source is prepared locally; hosted migration and Pages rollout are not established by this document.
**Update 19 November 2026 — resource catalog and media frames:** [ADR0017](../decisions/0017-media-resources-post-layouts.md) adds private media resource/asset tables, revision-scoped resource references and Banner-compatible layouts/frames. Home previews up to four mixed photos/videos under a shorter text field; MP4/WebM videos are capped at 20 MiB. Successful posting refreshes the Home feed. Existing images remain readable without moving files. Only current-project Storage is active; remote resource brokers and automatic capacity routing are not enabled.

**Update 19 November 2026 — social composer and device sessions:** [ADR0013](../decisions/0013-device-session-social-composer.md) supersedes the earlier memory-only lifetime. Sessions can survive reload/new tabs for up to seven days in the same browser, with API verification before private UI actions and device-local logout. Home uses an owner status dialog with manually entered people/place/feeling, up to four private Storage image attachments, and Public/Only me selection. The feed uses newest-first cards; only the owner sees own drafts. Account editing and existing per-post discussions remain. No source/epoch/role assignment changes.

# Hien’s Nha — sổ tay dự án đang vận hành

**Trạng thái18/11/2026:** Phase5 V1 production cutover đã hoàn tất theo phạm vi miễn phí anh đã chốt; comments/posts/media/requests dùng API/epoch1, API writers bật và toàn bộ đường gửi/archive Git cũ đã khóa. Xem [biên bản Phase 5 V1](phase5-release-2026-11-18.md) cho commit/CI/kiểm chứng và giới hạn còn lại. Các mô tả Git-only/local/shadow bên dưới được giữ làm lịch sử triển khai, không phải trạng thái production hiện tại. Bản vá picomatch nội bộ đã merge và qua CI; cần theo dõi để thay bằng bản upstream phù hợp sau này.

**Trạng thái mới nhất17/11/2026:** comments đang API/epoch1/writer bật; owner đã xác nhận đăng nhập GitHub, gửi và tải/hiển thị bình luận thật thành công. Luồng member pending/duyệt vẫn chưa kiểm chứng. Posts legacy đã freeze từ PR41; nhánh này chuẩn bị riêng marker đọc postsAPI1, chỉ merge sau khi audit DB khớp và giữ writer tắt để xác minh các gate tiếp theo. Media/requests vẫn Git0/writer tắt. Backup protected44031992148 đã thành công; giải mã offline của bản này chưa kiểm chứng. Xem [cửa sổ posts](posts-cutover-2026-11-17.md) và checkpoint mới nhất để phân biệt candidate/deployment/DB thực tế. V1 miễn phí đã chốt; Phase5 chưa hoàn tất. Các mô tả toàn bộ nguồn Git bên dưới là lịch sử trước cutover.

Cập nhật theo implementation ngày 13/11/2026. Đọc bộ này trước khi sửa code. Các tài liệu `01_Architecture.md`–`09_DeploymentGuide.md` ở root là baseline thiết kế ban đầu, không phải mô tả đầy đủ sản phẩm hiện tại. Khi tài liệu và code khác nhau, xác minh code/test rồi sửa cả hai trong cùng PR; không tự suy đoán business.

| Cần làm gì? | Đọc đâu? |
| --- | --- |
| Cải tiến trang cá nhân sau Phase 5 | [Kế hoạch Phase 6](phase6-profile-plan.md) |
| Hiểu các chức năng và quy tắc cũ | [Business](business.md) |
| Gửi/duyệt/cập nhật nhờ vả | [Tiệm Nhờ Vả](requests.md) |
| Hiểu luồng dữ liệu, hosting và ranh giới tin cậy | [Architecture + diagrams](architecture.md) |
| Tìm file cần sửa | [Structure](structure.md) |
| Tự phát triển hoặc giao việc cho AI | [Development + regression map](development.md) |
| Thêm ảnh Home | [Hướng dẫn ảnh](../home-photos.md) |
| Thêm thơ/Knowledge | [Hướng dẫn Knowledge](../knowledge-submissions.md) |
| Thêm nhạc/video | [Hướng dẫn Music & Video](../music-video.md) |
| Import truyện/thư mục bài | [Article folders](../article-folders.md) |

## Tự chạy dự án

Node theo `.nvmrc` (>=22.23.4), Git, npm theo lockfile. Chạy `npm ci`, `npm run dev`, mở URL terminal trả về với base `/hiens-nha/`. `npm run build` tạo `dist/`; `npm run preview` phục vụ bản build. Không commit `dist/`, token hoặc dữ liệu riêng tư. Source chính là repository `sugia279/hiens-nha`, website hiện tại ở GitHub Pages; không có máy chủ API/DB riêng.

## Cách dùng tài liệu với AI

Staging hosted riêng đã được anh duyệt và provision: [trạng thái + hướng dẫn Windows](hosted-staging.md). Staging `hitsdflorbqvoltsytxe` tách khỏi production; chưa có kết quả mixed-load hosted hoặc content cutover.

Giao mục tiêu và ví dụ hành vi mong muốn, yêu cầu AI đọc `AGENTS.md` và bộ tài liệu này, liệt kê business bị ảnh hưởng trước khi sửa. Yêu cầu test cả hành vi mới và luồng cũ bị chạm, cập nhật tài liệu, báo rõ giới hạn. Tài liệu và tests giúp giảm hồi quy, không thể bảo đảm tuyệt đối không có bug.

## Backend đang chuẩn bị trong local

[Roadmap đề xuất](backend-plan.md), [ADR Phase 0–1](../decisions/0001-backend-foundation.md) và [tiến độ/giới hạn kiểm chứng](backend-progress.md). Production vẫn dùng Git/Issues/Pages; foundation không tự cutover nguồn ghi.

Chạy foundation: [Backend local](backend-local.md). Contract: [OpenAPI v1](../api/backend-v1.openapi.json). Performance: [load test plan](backend-load-test.md). Phase 2–4 comments/posts/media/requests UI, moderation và import rehearsal có trong local/CI. Phase 5 import/restore/load gates đã kiểm chứng trong local/CI; staging/production gates còn mở; xem [release gates](backend-release.md). Supabase Free Singapore đã được tạo, migrations và Edge API đã triển khai ở chế độ shadow, mọi writer DB tắt; [bằng chứng hosted](backend-hosted-2026-11-15.json). GitHub provider và callback VI/EN đã cấu hình; Pages đã hiển thị nút login. OAuth thật và danh tính GitHub đã xác minh; quyền owner duy nhất đã cấp và xác minh; đã nhập shadow6 bản ghi legacy, content cutover chưa hoàn tất. [ADR0005](../decisions/0005-hosted-auth-delivery.md) mô tả delivery login trước content cutover.
