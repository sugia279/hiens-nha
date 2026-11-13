# Hien’s Nha — sổ tay dự án đang vận hành

Cập nhật theo implementation ngày 13/11/2026. Đọc bộ này trước khi sửa code. Các tài liệu `01_Architecture.md`–`09_DeploymentGuide.md` ở root là baseline thiết kế ban đầu, không phải mô tả đầy đủ sản phẩm hiện tại. Khi tài liệu và code khác nhau, xác minh code/test rồi sửa cả hai trong cùng PR; không tự suy đoán business.

| Cần làm gì? | Đọc đâu? |
| --- | --- |
| Kế hoạch thêm API/DB (đề xuất, chưa triển khai) | [Backend plan](backend-plan.md) |
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

Node theo `.nvmrc`, Git, npm theo lockfile. Chạy `npm ci`, `npm run dev`, mở URL terminal trả về với base `/hiens-nha/`. `npm run build` tạo `dist/`; `npm run preview` phục vụ bản build. Không commit `dist/`, token hoặc dữ liệu riêng tư. Source chính là repository `sugia279/hiens-nha`, website hiện tại ở GitHub Pages; không có máy chủ API/DB riêng.

## Cách dùng tài liệu với AI

Giao mục tiêu và ví dụ hành vi mong muốn, yêu cầu AI đọc `AGENTS.md` và bộ tài liệu này, liệt kê business bị ảnh hưởng trước khi sửa. Yêu cầu test cả hành vi mới và luồng cũ bị chạm, cập nhật tài liệu, báo rõ giới hạn. Tài liệu và tests giúp giảm hồi quy, không thể bảo đảm tuyệt đối không có bug.
