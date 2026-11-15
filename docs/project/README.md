# Hien’s Nha — sổ tay dự án đang vận hành

Cập nhật theo implementation ngày 13/11/2026. Đọc bộ này trước khi sửa code. Các tài liệu `01_Architecture.md`–`09_DeploymentGuide.md` ở root là baseline thiết kế ban đầu, không phải mô tả đầy đủ sản phẩm hiện tại. Khi tài liệu và code khác nhau, xác minh code/test rồi sửa cả hai trong cùng PR; không tự suy đoán business.

| Cần làm gì? | Đọc đâu? |
| --- | --- |
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

Giao mục tiêu và ví dụ hành vi mong muốn, yêu cầu AI đọc `AGENTS.md` và bộ tài liệu này, liệt kê business bị ảnh hưởng trước khi sửa. Yêu cầu test cả hành vi mới và luồng cũ bị chạm, cập nhật tài liệu, báo rõ giới hạn. Tài liệu và tests giúp giảm hồi quy, không thể bảo đảm tuyệt đối không có bug.

## Backend đang chuẩn bị trong local

[Roadmap đề xuất](backend-plan.md), [ADR Phase 0–1](../decisions/0001-backend-foundation.md) và [tiến độ/giới hạn kiểm chứng](backend-progress.md). Production vẫn dùng Git/Issues/Pages; foundation không tự cutover nguồn ghi.

Chạy foundation: [Backend local](backend-local.md). Contract: [OpenAPI v1](../api/backend-v1.openapi.json). Performance: [load test plan](backend-load-test.md). Phase 2–4 comments/posts/media/requests UI, moderation và import rehearsal có trong local/CI. Phase 5 import/restore/load gates đã kiểm chứng trong local/CI; staging/production gates còn mở; xem [release gates](backend-release.md). Supabase Free Singapore đã được tạo, migrations và Edge API đã triển khai ở chế độ shadow, mọi writer DB tắt; [bằng chứng hosted](backend-hosted-2026-11-15.json). GitHub provider và callback VI/EN đã cấu hình; Pages đã hiển thị nút login. Kiểm chứng OAuth thật, owner/import và content cutover chưa hoàn tất. [ADR0005](../decisions/0005-hosted-auth-delivery.md) mô tả delivery login trước content cutover.
