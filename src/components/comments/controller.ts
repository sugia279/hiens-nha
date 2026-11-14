import type { BackendRuntime, AuthSnapshot } from '../../lib/auth/runtime';
import { canonicalPageContext } from '../../../supabase/functions/_shared/page-context';
import { ApiError, bodyText, type Comment, type CommentState } from '../../../supabase/functions/_shared/contracts';
export function mountComments(panel: HTMLElement, runtime: Pick<BackendRuntime, 'api' | 'subscribe' | 'current'>) {
  const vi = panel.dataset.locale === 'vi';
  const copy = (a: string, b: string) => vi ? a : b;
  const status = panel.querySelector<HTMLElement>('[data-comments-status]')!;
  const list = panel.querySelector<HTMLElement>('[data-comment-list]')!;
  const form = panel.querySelector<HTMLFormElement>('[data-comment-form]')!;
  const body = form.querySelector<HTMLTextAreaElement>('textarea')!;
  const context = panel.querySelector<HTMLElement>('[data-compose-context]')!;
  const cancel = panel.querySelector<HTMLButtonElement>('[data-compose-cancel]')!;
  const more = panel.querySelector<HTMLButtonElement>('[data-comments-more]')!;
  const save = panel.querySelector<HTMLButtonElement>('[data-comment-save]')!;
  const mineButton = panel.querySelector<HTMLButtonElement>('[data-comments-mine]')!;
  let mine = false;
  let auth: AuthSnapshot = runtime.current(); let entity = ''; let state: CommentState | null = null;
  let generation = 0; let cursor: string | null = null; let loading = false; let writing = false;
  let editing: Comment | null = null; let parent: Comment | null = null;
  let retry: { fingerprint: string; key: string } | null = null;
  const writable = () => !!auth.user && !auth.busy && !writing && state?.source === 'api' && state.epoch === Number(panel.dataset.epoch) && state.writes_enabled;
  const updateForm = () => { form.hidden = !auth.user; mineButton.hidden = !auth.user; save.disabled = !writable(); };
  const tell = (message: string) => { status.textContent = message; };
  const failure = (error: unknown) => tell(error instanceof ApiError && error.status === 409
    ? copy('Nội dung đã thay đổi. Tải lại và kiểm tra phiên bản trước khi gửi lại; bản đang nhập được giữ.', 'Content changed. Reload and review its version before retrying; your draft is kept.')
    : error instanceof ApiError && error.status === 429
      ? copy('Gửi quá nhanh. Chờ một phút rồi thử lại; bản đang nhập được giữ.', 'Too many writes. Wait a minute and retry; your draft is kept.')
      : copy('Không tải/lưu được bình luận. Thử lại; bản đang nhập được giữ.', 'Could not load/save comments. Retry; your draft is kept.'));
  function button(text: string, action: () => void | Promise<void>) {
    const el = document.createElement('button'); el.type = 'button'; el.textContent = text;
    el.addEventListener('click', () => void action()); return el;
  }
  function resetCompose() { editing = parent = null; context.textContent = ''; cancel.hidden = true; }
  function render(item: Comment, target: HTMLElement) {
    const previous = [...target.children].find(el => (el as HTMLElement).dataset.commentId === item.id); previous?.remove();
    const article = document.createElement('article'); article.className = 'api-comment'; article.dataset.commentId = item.id;
    const meta = document.createElement('p'); meta.className = 'comment-status';
    const labels = { pending: copy('Chờ duyệt', 'Pending review'), approved: copy('Đã duyệt', 'Approved'), rejected: copy('Từ chối', 'Rejected'), hidden: copy('Đã ẩn', 'Hidden') };
    meta.textContent = `${item.author_id === auth.user?.id ? copy('Bạn', 'You') : item.legacy_author_login ? '@' + item.legacy_author_login : copy('Thành viên', 'Member')} · ${labels[item.status]}`;
    const text = document.createElement('p'); text.className = 'comment-text'; text.textContent = item.body;
    article.append(meta, text); target.append(article);
    if (panel.dataset.feed === 'all' && item.context_path) {
      const path = canonicalPageContext(item.context_path, panel.dataset.base!);
      if (path) { const link = document.createElement('a'); link.href = path; link.textContent = copy('Xem trang được bình luận', 'View the commented page'); article.append(link); }
    }
    if (item.author_id && item.author_id === auth.user?.id) {
      article.append(button(copy('Sửa', 'Edit'), () => { editing = item; parent = null; body.value = item.body; context.textContent = copy('Đang sửa bình luận; gửi lại sẽ được xét duyệt.', 'Editing comment; resubmission is reviewed.'); cancel.hidden = false; body.focus(); }));
      article.append(button(copy('Xóa', 'Delete'), async () => {
        if (!writable()) return; writing = true; updateForm();
        try { await runtime.api.deleteComment(item.id, item.version); await reload(); tell(copy('Đã xóa bình luận.', 'Comment deleted.')); }
        catch (error) { failure(error); } finally { writing = false; updateForm(); }
      }));
    }
    if (!item.parent_id) {
      const replies = document.createElement('div'); replies.className = 'comment-replies'; article.append(replies);
      let replyCursor: string | null | undefined; let replyLoading = false;
      const loadReplies = button(copy('Xem trả lời', 'Show replies'), async () => {
        if (replyLoading) return; replyLoading = true; loadReplies.disabled = true; const current = generation;
        try {
          const page = await runtime.api.comments(item.entity_id, replyCursor, item.id); if (generation !== current) return;
          page.items.forEach(reply => render(reply, replies)); replyCursor = page.nextCursor;
          loadReplies.hidden = !replyCursor; loadReplies.textContent = copy('Thêm trả lời', 'More replies');
        } catch (error) { if (generation === current) failure(error); }
        finally { replyLoading = false; loadReplies.disabled = false; }
      });
      article.append(loadReplies);
      if (auth.user && (item.status === 'approved' || auth.user.role === 'owner')) article.append(button(copy('Trả lời', 'Reply'), () => {
        editing = null; parent = item; context.textContent = copy('Trả lời: ', 'Reply to: ') + item.body.slice(0, 100); cancel.hidden = false; body.focus();
      }));
    }
    if (auth.user?.role === 'owner') {
      const reason = document.createElement('input'); reason.className = 'moderation-reason'; reason.maxLength = 500; reason.setAttribute('aria-label', copy('Lý do duyệt/ẩn', 'Moderation reason')); article.append(reason);
      for (const [next, label] of [['approved', copy('Duyệt', 'Approve')], ['rejected', copy('Từ chối', 'Reject')], ['hidden', copy('Ẩn', 'Hide')]]) article.append(button(label!, async () => {
        if (!writable() || !reason.value.trim()) { tell(copy('Cần nhập lý do.', 'Enter a reason.')); return; }
        writing = true; updateForm();
        try { await runtime.api.moderate(item.id, next!, item.version, reason.value); await reload(); tell(copy('Đã cập nhật duyệt.', 'Moderation saved.')); }
        catch (error) { failure(error); } finally { writing = false; updateForm(); }
      }));
    }
  }
  async function load(append: boolean) {
    if (loading) return; loading = true; more.disabled = true; const current = generation;
    try {
      const page = panel.dataset.feed === 'all' ? await runtime.api.commentFeed(append ? cursor : null, mine) : await runtime.api.comments(entity, append ? cursor : null, undefined, mine);
      if (current !== generation) return;
      if (!append) list.replaceChildren(); page.items.forEach(item => render(item, list)); cursor = page.nextCursor; more.hidden = !cursor;
      tell(page.items.length || append ? copy('Đã tải bình luận.', 'Comments loaded.') : copy('Chưa có bình luận được hiển thị.', 'No visible comments yet.'));
    } catch (error) { if (current === generation) failure(error); }
    finally { if (current === generation) { loading = false; more.disabled = false; } }
  }
  async function reload() {
    generation++; loading = false; list.replaceChildren(); cursor = null; more.hidden = true; const current = generation;
    try {
      const [registered, backendState] = await Promise.all([panel.dataset.entityId ? Promise.resolve({id:panel.dataset.entityId}) : runtime.api.resolveEntity(panel.dataset.context!), runtime.api.state()]);
      if (current !== generation) return; entity = registered.id; state = backendState; updateForm();
      if (state.source !== 'api' || state.epoch !== Number(panel.dataset.epoch)) { tell(copy('Bình luận đang bảo trì. Vui lòng thử lại sau.', 'Comments are in maintenance. Please retry later.')); return; }
      await load(false);
      if (!state.writes_enabled) tell(copy('Bình luận đang ở chế độ chỉ đọc.', 'Comments are read-only.'));
    } catch (error) { if (current === generation) { state = null; updateForm(); failure(error); } }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (!writable()) return;
    let value: string; try { value = bodyText(body.value); } catch { tell(copy('Nhập từ 1 đến 4.000 ký tự.', 'Enter 1–4,000 characters.')); return; }
    writing = true; updateForm(); const actor = auth.user!.id;
    try {
      const fingerprint = JSON.stringify({ entity: parent?.entity_id ?? entity, parent: parent?.id, body: value });
      if (!retry || retry.fingerprint !== fingerprint) retry = { fingerprint, key: crypto.randomUUID() };
      const result = editing ? await runtime.api.editComment(editing.id, value, editing.version) : await runtime.api.createComment(parent?.entity_id ?? entity, value, retry.key, parent?.id);
      if (runtime.current().user?.id !== actor) return;
      const replyTo = parent?.id; body.value = ''; retry = null; resetCompose(); await reload();
      // The committed reply is visible immediately without depending on root pagination.
      if (runtime.current().user?.id !== actor) return;
      if (replyTo) { const area = list.querySelector<HTMLElement>(`[data-comment-id="${replyTo}"] .comment-replies`); if (area) render(result, area); }
      tell(result.status === 'approved' ? copy('Đã lưu và duyệt bình luận.', 'Comment saved and approved.') : copy('Đã lưu bình luận, đang chờ Hiển duyệt.', 'Comment saved, awaiting Hien’s review.'));
    } catch (error) { failure(error); } finally { writing = false; updateForm(); }
  });
  mineButton.addEventListener('click', () => { mine = !mine; mineButton.textContent = mine ? copy('Xem tất cả bình luận', 'All comments') : copy('Bình luận của tôi', 'My comments'); resetCompose(); void reload(); });
  cancel.addEventListener('click', resetCompose);
  more.addEventListener('click', () => void load(true));
  panel.querySelector('[data-comments-refresh]')!.addEventListener('click', () => void reload());
  let identity: string | null | undefined;
  const unsubscribe = runtime.subscribe(next => {
    auth = next; updateForm(); const id = next.user?.id ?? null;
    if (id !== identity) { if (identity) body.value = ''; identity = id; mine = false; mineButton.textContent = copy('Bình luận của tôi', 'My comments'); resetCompose(); list.replaceChildren(); void reload(); }
  });
  return () => { generation++; unsubscribe(); list.replaceChildren(); };
}
