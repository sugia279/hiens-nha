# Phase 6 — Trang cá nhân, đăng nhập và bài đăng

Yêu cầu ngày 18/11/2026. Phase 5 V1 đã hoàn tất; kế hoạch này tiếp tục trên comments/posts/media/requests API/epoch1, không chạy lại import hay cutover. Phạm vi đã được anh điều chỉnh trong cùng ngày: banner 1–4 ảnh, chỉ owner đăng nội dung, khách chỉ bình luận; tag tự trở thành mục con khi nội dung được duyệt/xuất bản. Đây là quy tắc cho các đợt triển khai tiếp theo, chưa phải toàn bộ chức năng đã có trên production.

## Hành vi sản phẩm

- Đọc nội dung công khai không cần tài khoản. Bình luận cần đăng nhập. Khách không có quyền đăng bài/ảnh/video công khai. OAuth nhận diện tài khoản, không xác thực danh tính đời thực.
- Chủ nhà dùng GitHub hiện có và quyền owner hiện có. Khách có thể dùng Google, sau đó Facebook khi provider đã cấu hình và kiểm chứng. Không tự cấp owner theo email/avatar hoặc tài khoản liên kết.
- Sau đăng nhập dùng avatar kèm menu tài khoản/đăng xuất; có fallback tên viết tắt khi thiếu ảnh. Thông báo lỗi, hết phiên và trạng thái bình luận chờ duyệt vẫn rõ ràng. Avatar tài khoản đang dùng khác với ảnh đại diện cố định của Hiển dưới banner.
- Trang chủ chỉ hiển thị bài do owner xuất bản, mới nhất trước. Chỉ owner tạo/sửa/xuất bản bài, ảnh và video; khách đọc và bình luận, không có composer hay luồng gửi bài mới. Kiểm tra quyền tại API/RPC/DB, không chỉ ẩn nút. Không gán lại tác giả legacy chưa xác minh và không đưa các bài legacy đó vào feed owner. Luồng gửi nhờ vả của Tiệm Nhờ Vả vẫn giữ phạm vi riêng hiện có.
- Bài đăng gồm nội dung và các đính kèm ảnh/video có tag riêng. Một bài thơ có video phong cảnh có thể xuất hiện tại Bài viết → Thơ và Âm nhạc & Video → Phong Cảnh mà chỉ lưu một bản mỗi nội dung. Kết quả theo loại: mục Thơ mở bài, mục video mở video và có liên kết về bài liên quan.
- Một nội dung có nhiều tag. Mỗi tag là một mục con dưới nhánh loại nội dung tương ứng: Âm nhạc & Video, Hình ảnh, hoặc Bài viết. Ví dụ Phong Cảnh có thể hiện dưới Hình ảnh khi có ảnh và dưới Âm nhạc & Video khi có video; không tạo các mục rỗng ở nhánh không có nội dung đã xuất bản. Không di chuyển hay sao chép file. Loại bài và chuỗi bài có thứ tự vẫn là thuộc tính riêng, không ép cả hai thành tag.
- Khi owner duyệt/xuất bản nội dung, mọi tag mới tự tạo mục con ở nhánh phù hợp, không hỏi xác nhận thêm. Tag của bản nháp, bản chờ duyệt hay bị từ chối không xuất hiện trên menu công khai. Lưu xuất bản và liên kết tag/danh mục trong cùng giao dịch; chuẩn hóa tên/slug, chống trùng theo nhánh và xử lý idempotency khi publish lại. Cùng tag ở hai loại nội dung dùng hai liên kết nhánh, không hai bản nội dung. Mục chỉ hiển thị khi có nội dung công khai tương ứng; ẩn/xóa nội dung cuối cùng thì ẩn mục rỗng, giữ lịch sử và URL hợp lệ.
- Menu Bài viết thay nhãn Góc Tri Thức, giữ các lối vào Ghi Chú, Chuỗi Bài, Chủ Đề, Thơ và bổ sung mục tag. Khi tag trùng mục sẵn có thì tái sử dụng/ánh xạ mục đó, không tạo hai dòng trùng tên. Giữ các URL cũ hoặc thêm ánh xạ chuyển hướng trước khi đổi route. Danh mục tự tạo phải đọc được từ API, không phụ thuộc việc rebuild toàn bộ Pages.

## Các đợt thực hiện

| Đợt | Thay đổi | Điều kiện hoàn tất |
| --- | --- | --- |
| 6A | Banner chọn từ 1–4 ảnh Home hiện có; avatar Hiển bên dưới; kính lúp mở tìm kiếm trên banner | VI/EN, desktop/mobile, 1/2/3/4 ảnh lấp đầy banner không chừa ô trống, ảnh vẫn mở dialog, tìm kiếm bàn phím/Escape/chạm ngoài, quay lại trang hoạt động; không có hai ô tìm trên Home |
| 6B | Quyền đăng nội dung chỉ owner; thu gọn đăng nhập thành avatar/menu; Google trước, Facebook sau | Đóng luồng member gửi bài/media ở UI và API/RPC trước khi mở provider mới; member vẫn bình luận được; GitHub owner giữ nguyên; login/callback/logout/hết phiên được kiểm chứng; provider thực chỉ bật sau cấu hình đúng |
| 6C | Đổi nhãn Bài viết; taxonomy dùng chung và truy vấn theo loại; tag mới tự thêm mục con khi publish | Migration tương thích dữ liệu hiện có; API kiểm tra owner; chống trùng và phân quyền; bản nháp không sinh menu; duyệt/xuất bản tạo mục đúng một lần; URL cũ còn dùng được; một bài xuất hiện đúng nhiều mục |
| 6D | Đính kèm đa phương tiện | Tách nhúng link YouTube/Facebook khỏi tải file; Storage, hạn mức, loại/kích thước file, quyền đọc/ghi, đính kèm bản nháp của owner, xóa dọn file và chi phí được xác định; không nạp HTML nhúng tùy ý |
| 6E | Feed Home và composer chỉ dành owner, dựa trên 6B–6D | Phân trang, rỗng/lỗi/loading; feed chỉ gồm bài owner; member không tạo/sửa bài, ảnh/video kể cả gọi API trực tiếp; bình luận của member vẫn hoạt động; preview/xuất bản/ẩn và quyền riêng tư giữ đúng; kiểm chứng VI/EN, mobile, accessibility |

Banner dùng thứ tự `featuredOrder` của metadata, tối đa bốn ảnh đầu. Một ảnh phủ toàn banner; hai ảnh chia đôi; ba ảnh chia ba trên màn hình rộng và ghép một ảnh cao/hai ảnh nhỏ trên màn hình hẹp; bốn ảnh thành một hàng hoặc 2×2. Nếu chưa chọn ảnh nào thì giữ nền trung tính, avatar và tìm kiếm vẫn hoạt động. Việc chọn lại ảnh qua giao diện owner là phần quản trị sau này; 6A chưa thêm trình chỉnh banner.

6A được chuẩn bị trong nhánh `feat/profile-home`; trạng thái triển khai căn cứ PR/CI, không suy ra từ tài liệu này. Các đợt sau tiếp tục từng PR nhỏ; luôn kiểm tra checkpoint mới nhất trước khi sửa backend.

## Cấu hình và dữ liệu cần chuẩn bị cho các đợt sau

Google cần OAuth Web client và callback/redirect allowlist khớp Supabase/Pages. Facebook cần Meta app, callback và cấu hình public/live phù hợp (privacy policy, yêu cầu quyền/review theo trường hợp). Không gửi client secret vào chat hay commit. Dùng hướng dẫn chính thức tại [Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) và [Facebook](https://supabase.com/docs/guides/auth/social-sign-in/auth-facebook).

Kiểm kê schema profiles/publications/media và endpoint hiện tại trước khi thiết kế migration taxonomy/attachments. Chưa bật Storage và chưa tạo bucket trong 6A. Giữ OAuth memory-only và quyền owner hiện có; persistence/linking tài khoản là quyết định riêng, không vô tình thay đổi trong việc làm đẹp UI.

## Kiểm chứng đợt 6A

Unit kiểm tra chọn 1–4 ảnh, giới hạn bốn và không thay đổi album gốc. Smoke kiểm tra số ảnh và vị trí banner/avatar, ảnh responsive, search VI/EN đúng base và không trùng search Home. Browser regression kiểm tra từng layout 1/2/3/4 ảnh ở desktop/tablet/mobile, tìm kiếm bằng bàn phím, Escape/chạm ngoài, lightbox, điều hướng trở lại và tìm kiếm không JavaScript. Chạy các quality gates hiện có; không thêm nội dung thử trên production. Các tính năng provider/taxonomy/feed/upload ở đợt sau chưa được coi là đã kiểm chứng.

Quy tắc owner-only và tự tạo mục theo tag chưa thay đổi quyền production trong PR giao diện 6A. Đợt 6B phải đóng luồng member gửi bài/media hiện có ở cả UI lẫn API/RPC trước khi mở Google/Facebook; 6C/6E tiếp tục kiểm chứng quyền này; không coi bản kế hoạch là bằng chứng enforcement.

## Đợt Home writing đầu tiên

PR tiếp theo sau #50 bổ sung composer owner và feed theo author vào Home, dùng luồng lưu/submit/approve hiện có. Xem [phạm vi và giới hạn](home-publishing.md). Chưa triển khai attachments, menu tag tự động hay đóng quyền tạo nháp của member trên các route cũ.
