**21 November 2026 — Safari media and deletion:** [ADR0017](../decisions/0017-media-resources-post-layouts.md) adds JPEG fallback when WebP encoding is unavailable, distinct file errors, 50 MiB original file selection/video Storage limits, and owner Home deletion with confirmation using the existing version-checked soft-delete API. Photos remain optimized to 1600 pixels / 2 MiB; up to four attachments, private byte policies, historical retention and source/role controls remain. Browser regression coverage emulates unsupported WebP output, uploads a real MOV larger than 20 MiB, and verifies cancel/confirm deletion.

**21 November 2026 — inline post interactions:** [ADR0016](../decisions/0016-inline-post-interactions.md) adds exactly Heart/Laugh/Wow under Home posts, one reaction per signed-in account/post; selecting the active reaction removes it. Comments expand under that post, with existing author-only editing, immediate publication and owner moderation. Guest clicks on reaction/comment/share open a login chooser. Public comments can be read while sign-in is offered. Share copies the existing post/discussion link, with a selectable fallback if clipboard access fails. Private posts cannot be reacted to or shared. Sessions survive reopening in the same browser without an app deadline, until logout, browser removal or server invalidation; provider tokens/PKCE remain memory-only. Google/Facebook work only after their OAuth apps are configured; currently only GitHub is enabled. Existing owner/visitor permissions and VI/EN routes remain. SQL is applied to both hosted environments; [PR61](https://github.com/sugia279/hiens-nha/pull/61)/Pages tracks frontend delivery, with [verification](inline-post-interactions-verification-2026-11-20.md) distinguishing completed observations from remaining checks.

**19 November 2026 — navigation and categories:** The sidebar now groups Home, Photos (Family/Scenery/Moments/add album), Video (favorite videos/music/add category), Writing (Projects/Series/Novels/add category), and About (Introduction/Resume). Old routes remain; Guestbook/Help Shop have secondary footer links. Enter or blur creates a nonempty category; Escape cancels, failed writes keep the input. Signed-in users explicitly create public labels; no new publishing/moderation or upload rights are granted. Category names are 1–40 characters and appear as tags on corresponding uploads/posts. Editable pickers share the same catalogue. Media retains `music/video` as a separate technical format. Attachment album tags do not publish private photo bytes into the gallery. [ADR0015](../decisions/0015-content-categories.md) supersedes older fixed-menu/album descriptions below.

**Update 19 November 2026 — Home and comments:** [ADR0014](../decisions/0014-immediate-social-comments.md) supersedes the earlier pending-on-create/edit comment policy. New signed-in comments/replies publish immediately; author edits to hidden/rejected content retain that status. No bulk approval of old records. Home removes room cards/promotion and routine success text, and expands its inline composer from “Để lại vài dòng cho Hiển”. Feed, routes, author/owner checks and API/epoch markers remain. Source is prepared locally; hosted migration and Pages rollout are not established by this document.
**Update 19 November 2026 — resource catalog and media frames:** [ADR0017](../decisions/0017-media-resources-post-layouts.md) adds private media resource/asset tables, revision-scoped resource references and Banner-compatible layouts/frames. Home previews up to four mixed photos/videos under a shorter text field; MP4/WebM videos are capped at 20 MiB. Successful posting refreshes the Home feed. Existing images remain readable without moving files. Only current-project Storage is active; remote resource brokers and automatic capacity routing are not enabled.

**Update 19 November 2026 — social composer and device sessions:** [ADR0013](../decisions/0013-device-session-social-composer.md) supersedes the earlier memory-only lifetime. Sessions can survive reload/new tabs for up to seven days in the same browser, with API verification before private UI actions and device-local logout. Home uses an owner status dialog with manually entered people/place/feeling, up to four private Storage image attachments, and Public/Only me selection. The feed uses newest-first cards; only the owner sees own drafts. Account editing and existing per-post discussions remain. No source/epoch/role assignment changes.

# Chức năng và business hiện tại

**Production18/11/2026:** comments/posts/media/requests đã chuyển sang API/epoch1; writers bật, legacy Git publication bị khóa. Xem [biên bản Phase 5 V1](phase5-release-2026-11-18.md). Khách đăng nhập GitHub trên website để gửi/quản lý nội dung của mình; draft/pending chỉ hiện theo quyền, owner duyệt công khai. Posts và Media dùng `/account/content/`, quản trị dùng `/admin/`, nhờ vả dùng `/requests/`. Phê duyệt công khai vẫn tách nhận việc, chỉ owner đổi tiến độ và hoàn thành phải có kết quả. Bản import giữ nguyên receipt và tác giả chưa claim; không suy quyền chỉnh sửa theo tên GitHub. Các bảng mô tả Issue/archive và đoạn pilot/local dưới đây là contract/lịch sử legacy, không phải đường gửi đang hoạt động.

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
