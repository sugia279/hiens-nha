import type { BackendRuntime } from '../../lib/auth/runtime';
import { ApiError, type Comment } from '../../../supabase/functions/_shared/contracts';
export function mountModerationQueue(panel: HTMLElement, runtime: Pick<BackendRuntime, 'api' | 'subscribe' | 'current'>) {
  const vi = panel.dataset.locale === 'vi'; const copy = (a: string, b: string) => vi ? a : b;
  const status = panel.querySelector<HTMLElement>('[data-queue-status]')!;
  const list = panel.querySelector<HTMLElement>('[data-queue-list]')!;
  const more = panel.querySelector<HTMLButtonElement>('[data-queue-more]')!;
  const refresh = panel.querySelector<HTMLButtonElement>('[data-queue-refresh]')!;
  let generation = 0; let cursor: string | null = null; let loading = false; let writing = false; let writes = false;
  const owner = () => runtime.current().user?.role === 'owner' && !runtime.current().busy;
  const fail = (error: unknown) => { status.textContent = error instanceof ApiError && error.status === 409 ? copy('Phiên bản đã đổi. Tải lại trước khi duyệt.', 'Version changed. Refresh before reviewing.') : copy('Không tải/lưu được. Vui lòng thử lại.', 'Could not load/save. Please retry.'); };
  function render(item: Comment) {
    const article = document.createElement('article'); article.className = 'queue-item'; article.dataset.commentId = item.id;
    const label = document.createElement('p'); label.textContent = `${item.legacy_author_login ? '@' + item.legacy_author_login : copy('Thành viên', 'Member')} · ${item.parent_id ? copy('Trả lời', 'Reply') : copy('Bình luận', 'Comment')} · ${item.entity_id}`;
    const text = document.createElement('p'); text.className = 'queue-text'; text.textContent = item.body;
    const reason = document.createElement('input'); reason.maxLength = 500; reason.setAttribute('aria-label', copy('Lý do duyệt/ẩn', 'Moderation reason'));
    article.append(label, text, reason); list.append(article);
    for (const [next, caption] of [['approved', copy('Duyệt', 'Approve')], ['rejected', copy('Từ chối', 'Reject')], ['hidden', copy('Ẩn', 'Hide')]]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = caption!; button.disabled = !writes;
      button.addEventListener('click', async () => {
        if (!owner() || writing || !writes) return;
        if (!reason.value.trim()) { status.textContent = copy('Cần nhập lý do.', 'Enter a reason.'); return; }
        writing = true; article.querySelectorAll('button').forEach(el => { el.disabled = true; }); const current = generation;
        try {
          await runtime.api.moderate(item.id, next!, item.version, reason.value);
          if (current !== generation || !owner()) return;
          article.remove(); status.textContent = copy('Đã lưu quyết định duyệt.', 'Review saved.');
        } catch (error) { if (current === generation) fail(error); }
        finally { writing = false; if (current === generation) article.querySelectorAll('button').forEach(el => { el.disabled = !writes; }); }
      }); article.append(button);
    }
  }
  async function load(append: boolean) {
    if (!owner() || loading) return;
    if (!append) { generation++; list.replaceChildren(); cursor = null; more.hidden = true; }
    const current = generation; loading = true; more.disabled = true;
    try {
      const [page, state] = await Promise.all([runtime.api.moderation(append ? cursor : null), runtime.api.state()]);
      if (current !== generation || !owner()) return;
      writes = state.writes_enabled && state.source === 'api';
      page.items.forEach(render); cursor = page.nextCursor; more.hidden = !cursor;
      status.textContent = !writes ? copy('Chỉ đọc: thao tác duyệt đang tắt.', 'Read-only: moderation writes are disabled.') : page.items.length || append ? copy('Hàng đợi đã tải.', 'Queue loaded.') : copy('Không còn bình luận chờ duyệt.', 'No comments awaiting review.');
    } catch (error) { if (current === generation) fail(error); }
    finally { if (current === generation) { loading = false; more.disabled = false; } }
  }
  refresh.addEventListener('click', () => void load(false)); more.addEventListener('click', () => void load(true));
  let identity: string | null | undefined;
  const unsubscribe = runtime.subscribe(value => {
    const id = value.user?.role === 'owner' ? value.user.id : null; refresh.hidden = !id;
    if (identity !== id) { identity = id; generation++; loading = false; list.replaceChildren(); more.hidden = true;
      if (id) void load(false); else status.textContent = copy('Chỉ chủ nhà được xem hàng đợi duyệt.', 'Only the owner can view the review queue.');
    }
  });
  return () => { generation++; unsubscribe(); list.replaceChildren(); };
}
