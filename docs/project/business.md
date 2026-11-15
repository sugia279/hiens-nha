# Chức năng và business hiện tại

## Các phòng trong nhà

Thứ tự menu chính: Trang chủ → Âm nhạc & Video → Hình ảnh → Dự án → Sổ lưu bút → Tiệm Nhờ Vả → Góc tri thức → Tủ truyện → Về Hiển. Cấu hình tại `src/config/navigation.ts`, dùng chung cho VI/EN và desktop/mobile.

| Chức năng | Hành vi và dữ liệu | Quy tắc phải giữ |
| --- | --- | --- |
| Trang chủ | Giới thiệu, các ô phòng theo thứ tự menu (Âm nhạc & Video → Hình ảnh → Dự án → Tiệm Nhờ Vả → Góc tri thức → Tủ truyện), ảnh nổi bật, link Tiệm Nhờ Vả | Chỉ ảnh có metadata + `featuredOrder` hiện ở Home; asset đơn lẻ chưa là bài ảnh |
| Left menu / header | Treeview có icon cấp 1–2, tìm kiếm giữa header | Khách mới: nhánh đóng; bấm tên mục cha đến trang tổng quan và lưu nhánh đang mở, bấm mũi tên để chỉ mở/đóng nhánh; không còn dòng Xem tất cả; đổi trang/VI–EN giữ nhánh; điện thoại ≤767px đóng sidebar khi chọn link nội bộ, chạm ra ngoài hoặc nhấn Escape |
| VI / EN | Trang static mặc định VI và bản `/en/`, chung view/data | Dịch UI; không tự dịch thơ, truyện, mô tả, bình luận, CV. Giữ query/hash khi đổi ngôn ngữ |
| Knowledge authored | Articles, Notes, Projects, Series theo content schema | Draft không xuất bản; references hợp lệ; tags và domains khác nhau; series/order phải đi cùng khi schema yêu cầu |
| Knowledge chia sẻ | Form chọn article/note/poem, chuyên mục, tags, series/order → issue → JSON | `knowledge-approved`; escaped text, giữ xuống dòng; không compile user input thành MDX; nằm trong thư viện Knowledge, không tự nhập vào MDX/graph/topics authored |
| Chuỗi bài | Authored series và nhóm shared series | Shared dùng tên chuỗi chính xác, order số; hai kho lưu khác nhau. Shared series được giới thiệu từ trang Series |
| Tủ truyện | Genres → truyện → chương; thanh 3 nút Chương trước / Trang chủ truyện / Chương sau ở cả đầu và cuối chương, chặn nút không có chương kế cận | Giữ 84 chương import và URL cũ; không lẫn chương truyện vào danh sách bài kỹ thuật thông thường |
| Music & Video | Biểu diễn của Hiển, Knowledge domain music, nhạc/video được duyệt | Giữ URL `/music/`; `media-approved`; tags/category; URL kiểm tra host; chỉ tạo iframe từ provider đã cho phép, không nhận embed HTML |
| Hình ảnh | Album family/scenery/moments, description; Home dùng featuredOrder | Click mở nền đen, fit và 1:1, phím Escape/đổi ảnh/focus. Owner uploader tạo asset + metadata cùng commit; token chỉ ở bộ nhớ trình duyệt |
| Sổ lưu bút | Lời nhắn và bình luận theo trang | `guestbook-approved`; canonical page context bỏ locale; bình luận được duyệt hiện đúng trang và Sổ; replies trusted theo cơ chế cũ; không chuyển nhầm lời nhắn thành yêu cầu tác nghiệp |
| Tiệm Nhờ Vả | Yêu cầu, mong đợi, ưu tiên tự khai, tags, board/detail/timeline/result | [Contract riêng](requests.md): approval tách acceptance; owner-only updates; completion phải có result |
| Search / Graph | Pagefind HTML index; graph từ authored connections | Shared text tìm được qua trang chứa nó; không coi shared JSON là node graph nếu chưa implement adapter rõ ràng |
| About / Resume / Projects | Giới thiệu, CV iframe, case study | Giữ asset CV, iframe title và links cũ |

## Những khái niệm dễ nhầm

- **Loại** là hình thức nội dung (bài, ghi chú, thơ). **Chuyên mục** là nhóm nghiệp vụ (ví dụ Thơ & sáng tác). **Tag** là nhiều nhãn tự do. **Domain** của MDX là enum giới hạn trong `src/content.config.ts`.
- **Duyệt công khai** là cho phép xuất hiện trên website. **Nhận việc** là cam kết xử lý ở mức nghiệp vụ. `request-approved` không có nghĩa `accepted`.
- Gửi form website chỉ chuẩn bị URL. Khách phải đăng nhập và tạo issue trên GitHub; không có form gửi ẩn danh hay autosave cross-device.
- GitHub issue và file archive là công khai dù chưa duyệt. Gỡ label chỉ rút website sau deployment; không xóa issue, Git history, cache hoặc bản đã được người khác lưu.
- Website là snapshot build. Không có realtime socket, push notification, gửi email tự động, thanh toán, SLA hay DB riêng.

## Tiệm Nhờ Vả là phòng riêng

Sổ lưu bút giữ chức năng chào hỏi/bình luận. Các lời nhắn loại request cũ vẫn ở Sổ theo contract cũ, không tự migrate để tránh mất dữ liệu hoặc đổi quyền duyệt. Trang Home và Sổ dẫn sang Tiệm cho các yêu cầu mới cần theo dõi tiến độ. Một yêu cầu không tự động trở thành project/knowledge; muốn công bố kết quả thành bài viết phải đi qua luồng xuất bản tương ứng.

## Pilot bình luận qua API trong local

Phần đang chạy production vẫn là bảng trên. Khi bật đúng source/epoch ở môi trường local, pilot cho member gửi/sửa/xóa bình luận của mình, xem pending riêng và trả lời một cấp; sửa bình luận đã duyệt sẽ tạm ẩn để duyệt lại. Owner duyệt/ẩn/từ chối có lý do và version check, không sửa thay nội dung của người khác. Sổ lưu bút API đọc tổng hợp các thread và ghi lời nhắn mới vào thread chung. `My comments` giữ khả năng quản lý trả lời của mình khi parent bị ẩn; không tiết lộ nội dung parent chưa public. Tác giả import chưa liên kết Auth không được claim bằng tên trùng. Đây chưa là luồng đã cutover trên Pages.


## Posts/media và Requests trong local (Phase 3/4)

Đây là implementation pilot theo [ADR 0003](../decisions/0003-publications-requests-local.md), chưa bật trên production. Member tạo/sửa/xóa mềm bài và link của mình, lưu nháp/autosave, gửi duyệt; owner duyệt revision cụ thể hoặc gỡ công khai. Bản public không thay bằng bản sửa chưa duyệt; lịch sử giữ nội dung/actor/thời điểm. Preview chỉ render tập Markdown an toàn và provider đã validate; MDX/HTML người dùng không thực thi. Chuỗi bài thuộc namespace tác giả, vị trí không trùng trong chuỗi đó.

Nhờ vả có board/detail API và discussion theo entity. Approval chỉ quyết định công khai; chỉ owner nhận việc/đổi tiến độ/kết quả. Đổi scope giữ approval cũ như contract Git, nhưng reset status về new, accepted scope và result; owner phải nhận lại. Cả scope và status dùng version/scope CAS trong cùng row lock. Correction nối thêm event, không sửa event cũ. Import không suy quyền sở hữu từ tên GitHub; route số cũ đọc mapping có kiểm tra visibility. Sources posts/media/requests mặc định Git riêng từng feature; full migration/cutover chưa thực hiện.


Phase 5 rehearsal giữ bookmark `knowledge/#shared-post-N` qua mapping UUID importer (gồm bài thủ công số 0), chỉ đọc revision public, không fallback sang archive nếu DB thu hồi. Khi posts dùng API, Series dẫn sang danh sách chia sẻ hiện tại và không tính các thẻ/tên chuỗi Git thành dữ liệu DB. Metadata chuỗi/thứ tự vẫn hiện; Pagefind/graph authored giữ phạm vi static theo kế hoạch. Các nguồn production chưa đổi.
