import { siteConfig } from '../config/site';

export type Locale = 'vi' | 'en';
export function localeFromPath(path: string): Locale {
  return path.startsWith(`${siteConfig.base}en/`) ? 'en' : 'vi';
}

/** Keep the same page when switching languages; assets never get an /en/ prefix. */
export function localeUrl(path: string, locale: Locale): string {
  const base = siteConfig.base;
  const relative = path.startsWith(base) ? path.slice(base.length) : path.replace(/^\//, '');
  const logical = relative.replace(/^en(?:\/|$)/, '');
  return `${base}${locale === 'en' ? 'en/' : ''}${logical}`;
}

export const viCopy: Record<string, string> = {
  'Music & Video': 'Âm nhạc & Video', 'Favorite music': 'Âm nhạc yêu thích', 'Favorite videos': 'Video yêu thích', 'Share a link': 'Gửi liên kết',
  'Shared writing': 'Bài viết & sáng tác', 'Add Knowledge': 'Thêm nội dung',
  'Help shop': 'Tiệm Nhờ Vả', 'Request board': 'Bảng nhờ vả', 'Send request': 'Gửi nhờ vả',
  Xianxia: 'Tiên Hiệp', Fantasy: 'Kỳ ảo', Mystery: 'Trinh thám', Performances: 'Hiển chơi đàn', 'Music knowledge': 'Kiến thức âm nhạc',
  'Cultivation and immortal adventures.': 'Hành trình tu luyện và những câu chuyện tiên hiệp.',
  'Comics and graphic stories.': 'Truyện tranh và những câu chuyện qua hình vẽ.',
  'Stories of imaginary worlds and magic.': 'Những thế giới tưởng tượng và phép thuật.',
  'Mysteries and detective stories.': 'Những bí ẩn và câu chuyện phá án.',
  Photos: 'Hình ảnh', Family: 'Gia đình', Scenery: 'Phong cảnh', Moments: 'Khoảnh khắc', 'Add photo': 'Thêm ảnh',
  Home: 'Trang chủ', Knowledge: 'Góc tri thức', Novels: 'Tủ truyện', Music: 'Âm nhạc',
  Guestbook: 'Sổ lưu bút', About: 'Về Hiển', Resume: 'Hồ sơ', Articles: 'Bài viết',
  Notes: 'Ghi chú', Projects: 'Dự án', Series: 'Chuỗi bài', Topics: 'Chủ đề', Graph: 'Bản đồ tri thức',
  Article: 'Bài viết', Note: 'Ghi chú', Project: 'Dự án', Search: 'Tìm kiếm',
  Chapter: 'Chương',
  'Knowledge Graph': 'Bản đồ tri thức', 'View Resume': 'Xem hồ sơ', Links: 'Liên kết',
  'Long-form engineering writing, tutorials, and knowledge essays.': 'Bài viết chuyên sâu, hướng dẫn và những điều Hiển muốn chia sẻ.',
  'Evolving knowledge notes, ideas, and observations.': 'Ghi chép, ý tưởng và kiến thức được bổ sung theo thời gian.',
  'Evolving notes, observations, and working knowledge.': 'Ghi chép, quan sát và kiến thức đang được hoàn thiện.',
  'Engineering projects and case studies.': 'Các sản phẩm và dự án Hiển xây dựng.',
  'Curated ordered learning paths across topics.': 'Những chuỗi bài được sắp xếp để đọc hoặc học theo thứ tự.',
  'Browse all topics across articles, notes, projects, and series.': 'Khám phá nội dung theo chủ đề.',
  'Search articles, notes, projects, and series.': 'Tìm bài viết, ghi chú, truyện, âm nhạc và dự án.',
  'Nothing published here yet.': 'Chưa có nội dung được đăng ở đây.',
  'Browse all content': 'Về trang chủ', 'Skip to main content': 'Đi tới nội dung chính',
  'Search articles, notes, projects, topics…': 'Tìm bài viết, truyện, âm nhạc, dự án…',
  'Search the knowledge garden': 'Tìm trong Hiên Nhà', 'Search the garden': 'Tìm trong Hiên Nhà',
  'Search query': 'Nội dung tìm kiếm', 'Search content': 'Tìm nội dung',
  'Search…': 'Tìm kiếm…', 'Search articles, notes, projects…': 'Tìm bài viết, ghi chú, dự án…',
  'Submit search': 'Tìm kiếm', 'Search results': 'Kết quả tìm kiếm',
  'Enter a search term above to get started.': 'Nhập từ khóa để bắt đầu tìm kiếm.',
  'Searching…': 'Đang tìm…', 'No results found.': 'Không tìm thấy kết quả.',
  'Toggle navigation': 'Mở hoặc thu gọn menu', 'Primary navigation': 'Menu chính',
  'Main navigation': 'Điều hướng chính', 'Mobile navigation': 'Menu trên điện thoại',
  'Collection navigation': 'Loại nội dung', 'Social links': 'Liên kết cá nhân', Language: 'Ngôn ngữ',
  'Table of contents': 'Mục lục', 'On this page': 'Trong trang này',
  Previous: 'Trước', Next: 'Sau', 'Part of': 'Thuộc', Published: 'Đăng ngày', '· Updated': '· Cập nhật',
  'Learning path': 'Thứ tự bài viết', 'Read article': 'Đọc bài viết', 'Read note': 'Đọc ghi chú',
  'Related content': 'Nội dung liên quan', 'Related Content': 'Nội dung liên quan',
  'Reader comments': 'Gửi bình luận cho Hiển',
  articles: 'Bài viết', notes: 'Ghi chú', projects: 'Dự án', series: 'Chuỗi bài',
  Prerequisites: 'Kiến thức cần trước', Explains: 'Giải thích', Extensions: 'Mở rộng',
  Contrasts: 'Đối chiếu', 'Applied to': 'Áp dụng cho', 'Derived from': 'Phát triển từ',
  'Contrasts with': 'Đối chiếu với', 'Related knowledge': 'Tri thức liên quan',
  references: 'tham chiếu', 'referenced by': 'được tham chiếu bởi', 'connected to': 'liên kết với',
  'Featured': 'Nổi bật', 'Featured article': 'Bài viết nổi bật',
  Status: 'Trạng thái', Role: 'Vai trò', Period: 'Thời gian', Skills: 'Kỹ năng', Tools: 'Công cụ',
  Repository: 'Mã nguồn', Live: 'Website', Seed: 'Ý tưởng mới', Growing: 'Đang bổ sung',
  Evergreen: 'Đã hoàn thiện', Active: 'Đang phát triển', Maintained: 'Đang duy trì',
  Completed: 'Hoàn thành', Archived: 'Lưu trữ',
  Domain: 'Lĩnh vực', Domains: 'Lĩnh vực', Collection: 'Loại nội dung',
  'Connection type': 'Loại liên kết', 'All domains': 'Tất cả lĩnh vực',
  'All collections': 'Tất cả loại nội dung', 'All types': 'Tất cả loại liên kết',
  'Reset filters': 'Xóa bộ lọc', 'Apply filters': 'Áp dụng',
  'Selected node details': 'Chi tiết mục đã chọn', 'Interactive graph visualization': 'Bản đồ tri thức tương tác',
  'Select a node in the graph to explore its connections.': 'Chọn một mục để khám phá các liên kết tri thức.',
  'Graph visualization requires JavaScript. Use the list below to explore connections.': 'Dùng danh sách bên dưới để khám phá; bản đồ tương tác cần JavaScript.',
  'No published entries in the graph yet.': 'Chưa có nội dung trong bản đồ tri thức.',
  'No connections for this entry.': 'Mục này chưa có liên kết tri thức.',
  'All graph connections': 'Tất cả liên kết tri thức', Connections: 'Liên kết tri thức',
  Outgoing: 'Liên kết đi', Incoming: 'Liên kết đến', Related: 'Có liên quan',
  Engineering: 'Kỹ thuật', 'Artificial Intelligence': 'Trí tuệ nhân tạo',
  'Reading & Literature': 'Đọc sách & văn học', 'Philosophy & Life': 'Suy ngẫm & cuộc sống',
  '(opens in new tab)': '(mở trong tab mới)',
  'Page not found': 'Không tìm thấy trang', 'Back to home': 'Về trang chủ',
  'The page you are looking for does not exist or has moved.': 'Trang anh/chị tìm không còn ở địa chỉ này.',
  'A home for Hien’s knowledge, projects, stories, music, and friends.': 'Ngôi nhà của Hiển: tri thức, dự án, truyện, âm nhạc và bạn bè.',
  'Short observations, references, and evolving knowledge.': 'Ghi chép ngắn, tài liệu tham khảo và kiến thức được bổ sung dần.',
  'Professional and creative project case studies.': 'Những dự án công việc, sáng tạo và thử nghiệm của Hiển.',
  'Return home': 'Về trang chủ', 'The requested page could not be found.': 'Không tìm thấy trang được yêu cầu.',
  'Page not found. The URL may have changed or the content may have moved.': 'Không tìm thấy trang. Địa chỉ có thể đã thay đổi hoặc nội dung đã được chuyển đi.',
};

/** UI copy only. Authored Markdown and user messages are explicitly excluded. */
export function ui(text: string, locale: Locale): string {
  if (locale === 'en') return text;
  const key = text.trim().replace(/\s+/g, ' ');
  const translated = viCopy[key]
    ?? (key.startsWith("Hiên Nhà — ") ? "Hiên Nhà — Ngôi nhà của Hiển" : undefined)
    ?? (key.startsWith('All content tagged with ') ? key.replace('All content tagged with ', 'Nội dung có chủ đề ') : undefined)
    ?? (key.endsWith(" | Hiên Nhà") && viCopy[key.split(' | ')[0]!] ? `${viCopy[key.split(' | ')[0]!]} | Hiên Nhà` : undefined)
    ?? (/^(?:·\s*)?\d+ min read$/.test(key) ? key.replace(' min read', ' phút đọc') : undefined)
    ?? (/^\+\d+ more$/.test(key) ? key.replace(' more', ' nhãn khác') : undefined)
    ?? (/^Explore semantic connections across \d+ published entries\.$/.test(key) ? key.replace('Explore semantic connections across ', 'Khám phá các liên kết tri thức giữa ').replace(' published entries.', ' nội dung đã đăng.') : undefined)
    ?? (/^All connections \(\d+\)$/.test(key) ? key.replace('All connections', 'Tất cả liên kết') : undefined);
  return translated ? text.replace(text.trim(), translated) : text;
}
