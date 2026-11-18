# Phase 6 — Trang cá nhân, đăng nhập và bài đăng

Yêu cầu ngày 18/11/2026. Phase 5 V1 đã hoàn tất; kế hoạch này tiếp tục trên comments/posts/media/requests API/epoch1, không chạy lại import hay cutover. Các mục dưới là phạm vi đề xuất, chưa phải chức năng đã có trên production.

## Hành vi sản phẩm

- Đọc nội dung công khai không cần tài khoản. Bình luận và gửi bài cần đăng nhập. OAuth nhận diện tài khoản, không xác thực danh tính đời thực.
- Chủ nhà dùng GitHub hiện có và quyền owner hiện có. Khách có thể dùng Google, sau đó Facebook khi provider đã cấu hình và kiểm chứng. Không tự cấp owner theo email/avatar hoặc tài khoản liên kết.
- Sau đăng nhập dùng avatar kèm menu tài khoản/đăng xuất; có fallback tên viết tắt khi thiếu ảnh. Thông báo lỗi, hết phiên và trạng thái chờ duyệt vẫn rõ ràng. Avatar tài khoản đang dùng khác với ảnh đại diện cố định của Hiển dưới banner.
- Trang chủ ưu tiên bài do owner xuất bản, mới nhất trước. Có lối gửi bài cho thành viên; bài khách vào hàng chờ duyệt và giữ đúng tác giả. Không coi mọi bài được duyệt là bài của owner; không gán lại tác giả legacy chưa xác minh.
- Bài đăng gồm nội dung và các đính kèm ảnh/video có tag riêng. Một bài thơ có video phong cảnh có thể xuất hiện tại Bài viết → Thơ và Âm nhạc & Video → Phong Cảnh mà chỉ lưu một bản mỗi nội dung. Kết quả theo loại: mục Thơ mở bài, mục video mở video và có liên kết về bài liên quan.
- “Thư mục” là cách hiển thị danh mục/tag, không di chuyển hay sao chép file. Một nội dung có nhiều tag. Phân biệt loại bài (ghi chú/thơ…), chuỗi bài có thứ tự, và chủ đề; không ép cả ba thành cùng một trường.
- Owner đặt tag chưa có danh mục tương ứng: hiển thị đề nghị tạo mục, xác nhận tên/nhánh cha rồi tạo. Từ chối thì chỉ giữ tag. Thành viên chỉ đề xuất tag; tạo danh mục/menu cần quyền owner kiểm tra ở API. Chuẩn hóa slug, chống trùng, giới hạn độ sâu/số lượng và dùng giao dịch/idempotency cho việc tạo đồng thời.
- Menu Bài viết thay nhãn Góc Tri Thức, gồm Ghi Chú, Chuỗi Bài, Chủ Đề, Thơ. Giữ các URL cũ hoặc thêm ánh xạ chuyển hướng trước khi đổi route. Danh mục tự tạo phải đọc được từ API, không phụ thuộc việc rebuild toàn bộ Pages.

## Các đợt thực hiện

| Đợt | Thay đổi | Điều kiện hoàn tất |
| --- | --- | --- |
| 6A | Banner từ ảnh Home hiện có; avatar Hiển bên dưới; kính lúp mở tìm kiếm trên banner | VI/EN, desktop/mobile, ảnh vẫn mở dialog, tìm kiếm bàn phím/Escape/chạm ngoài, quay lại trang hoạt động; không có hai ô tìm trên Home |
| 6B | Thu gọn giao diện đăng nhập thành avatar/menu; Google trước, Facebook sau | GitHub owner giữ nguyên; login/callback/logout/hết phiên và tài khoản member được kiểm chứng; provider thực chỉ bật sau cấu hình đúng |
| 6C | Đổi nhãn Bài viết; taxonomy dùng chung và truy vấn theo loại; xác nhận tạo mục còn thiếu | Migration tương thích dữ liệu hiện có; API kiểm tra owner; chống trùng và phân quyền; URL cũ còn dùng được; một bài xuất hiện đúng nhiều mục |
| 6D | Đính kèm đa phương tiện | Tách nhúng link YouTube/Facebook khỏi tải file; Storage, hạn mức, loại/kích thước file, quyền đọc/ghi, nội dung chờ duyệt, xóa dọn file và chi phí được xác định; không nạp HTML nhúng tùy ý |
| 6E | Feed Home và composer dựa trên 6B–6D | Phân trang, rỗng/lỗi/loading; bài owner và bài khách phân biệt; preview/gửi/duyệt/ẩn và quyền riêng tư giữ đúng; kiểm chứng VI/EN, mobile, accessibility |

6A được chuẩn bị trong nhánh `feat/profile-home`; trạng thái triển khai căn cứ PR/CI, không suy ra từ tài liệu này. Các đợt sau tiếp tục từng PR nhỏ; luôn kiểm tra checkpoint mới nhất trước khi sửa backend.

## Cấu hình và dữ liệu cần chuẩn bị cho các đợt sau

Google cần OAuth Web client và callback/redirect allowlist khớp Supabase/Pages. Facebook cần Meta app, callback và cấu hình public/live phù hợp (privacy policy, yêu cầu quyền/review theo trường hợp). Không gửi client secret vào chat hay commit. Dùng hướng dẫn chính thức tại [Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) và [Facebook](https://supabase.com/docs/guides/auth/social-sign-in/auth-facebook).

Kiểm kê schema profiles/publications/media và endpoint hiện tại trước khi thiết kế migration taxonomy/attachments. Chưa bật Storage và chưa tạo bucket trong 6A. Giữ OAuth memory-only và quyền owner hiện có; persistence/linking tài khoản là quyết định riêng, không vô tình thay đổi trong việc làm đẹp UI.

## Kiểm chứng đợt 6A

Smoke kiểm tra vị trí banner/avatar, ảnh responsive, search VI/EN đúng base và không trùng search Home. Browser regression kiểm tra desktop/tablet/mobile, tìm kiếm bằng bàn phím, Escape/chạm ngoài, lightbox, điều hướng trở lại và tìm kiếm không JavaScript. Chạy các quality gates hiện có; không thêm nội dung thử trên production. Các tính năng provider/taxonomy/feed/upload ở đợt sau chưa được coi là đã kiểm chứng.
