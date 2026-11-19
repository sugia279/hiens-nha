import type { BackendRuntime, AuthSnapshot } from '../../lib/auth/runtime';
import { canonicalPageContext } from '../../../supabase/functions/_shared/page-context';
import { ApiError, bodyText, type Comment, type CommentState } from '../../../supabase/functions/_shared/contracts';
import { homeAuthorId, homeAuthorName } from '../../config/home-feed';

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
  const composer = panel.querySelector<HTMLElement>('[data-comments-composer]');
  const opener = panel.dataset.homeComments === 'true' ? document.querySelector<HTMLButtonElement>('[data-open-home-comments]') : null;
  const events = new AbortController();
  let composeOpen = panel.dataset.homeComments !== 'true';
  let mine = false;
  let auth: AuthSnapshot = runtime.current(); let entity = ''; let state: CommentState | null = null;
  let generation = 0; let cursor: string | null = null; let loading = false; let writing = false;
  let editing: Comment | null = null; let parent: Comment | null = null;
  let retry: { fingerprint: string; key: string } | null = null;
  const writable = () => !!auth.user && !auth.busy && !!entity && !writing && state?.source === 'api' && state.epoch === Number(panel.dataset.epoch) && state.writes_enabled;
  const updateForm = () => {
    if (composer) composer.hidden = !composeOpen;
    form.hidden = !auth.user || !composeOpen;
    mineButton.hidden = !auth.user;
    save.disabled = !writable();
    body.disabled = writing;
    opener?.setAttribute('aria-expanded', String(composeOpen));
  };
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
  function openCompose() {
    composeOpen = true; updateForm();
    if (auth.user) body.focus();
    else panel.querySelector<HTMLButtonElement>('[data-sign-in]')?.focus();
  }
  function resetCompose() { editing = parent = null; context.textContent = ''; cancel.hidden = true; }
  function render(item: Comment, target: HTMLElement) {
    const previous = [...target.children].find(el => (el as HTMLElement).dataset.commentId === item.id); previous?.remove();
    const article = document.createElement('article'); article.className = 'api-comment'; article.dataset.commentId = item.id;
    const author = item.author_id === auth.user?.id ? copy('Bạn', 'You') : item.author_id === homeAuthorId ? homeAuthorName : item.legacy_author_login ? '@' + item.legacy_author_login : copy('Thành viên', 'Member');
    const avatar = document.createElement('span'); avatar.className = 'comment-avatar'; avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = author.replace(/^@/, '').split(/\s+/).slice(0, 2).map(p => p[0]).join('').toLocaleUpperCase();
    const content = document.createElement('div'); content.className = 'comment-content';
    const line = document.createElement('div'); line.className = 'comment-line';
    const bubble = document.createElement('div'); bubble.className = 'comment-bubble';
    const name = document.createElement('strong'); name.className = 'comment-author'; name.textContent = author;
    const text = document.createElement('p'); text.className = 'comment-text'; text.textContent = item.body;
    bubble.append(name, text); line.append(bubble); content.append(line); article.append(avatar, content); target.append(article);
    if (item.status !== 'approved') {
      const label = document.createElement('p'); label.className = 'comment-status';
      const labels = { pending: copy('Chờ duyệt', 'Pending review'), rejected: copy('Từ chối', 'Rejected'), hidden: copy('Đã ẩn', 'Hidden') };
      label.textContent = labels[item.status]; bubble.append(label);
    }
    const actions = document.createElement('div'); actions.className = 'comment-actions';
    const time = document.createElement('time'); time.dateTime = item.created_at;
    const date = new Date(item.created_at);
    time.textContent = Number.isNaN(date.getTime()) ? '' : date.toLocaleString(vi ? 'vi-VN' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    if (item.version > 1) time.title = copy('Đã chỉnh sửa hoặc cập nhật', 'Edited or updated');
    actions.append(time); content.append(actions);
    if (panel.dataset.feed === 'all' && item.context_path) {
      const path = canonicalPageContext(item.context_path, panel.dataset.base!);
      if (path) { const link = document.createElement('a'); link.className = 'comment-page-link'; link.href = path; link.textContent = copy('Xem trang được bình luận', 'View the commented page'); content.append(link); }
    }
    const own = !!item.author_id && item.author_id === auth.user?.id;
    if (own || auth.user?.role === 'owner') {
      const menu = document.createElement('details'); menu.className = 'comment-menu';
      const summary = document.createElement('summary'); summary.textContent = '•••'; summary.setAttribute('aria-label', copy('Tùy chọn bình luận', 'Comment options'));
      const options = document.createElement('div'); options.className = 'comment-menu-panel'; menu.append(summary, options); line.append(menu);
      if (own) {
        options.append(button(copy('Sửa', 'Edit'), () => {
          if (writing) return;
          editing = item; parent = null; body.value = item.body;
          context.textContent = copy('Chỉnh sửa bình luận', 'Edit comment'); cancel.hidden = false; menu.open = false; openCompose();
        }));
        options.append(button(copy('Xóa', 'Delete'), async () => {
          if (!writable()) return; writing = true; updateForm(); const actor = auth.user!.id;
          try { await runtime.api.deleteComment(item.id, item.version); if (runtime.current().user?.id !== actor || events.signal.aborted) return; await reload(); tell(copy('Đã xóa bình luận.', 'Comment deleted.')); }
          catch (error) { if (runtime.current().user?.id === actor && !events.signal.aborted) failure(error); } finally { writing = false; updateForm(); }
        }));
      }
      if (auth.user?.role === 'owner') {
        const reason = document.createElement('input'); reason.className = 'moderation-reason'; reason.maxLength = 500; reason.placeholder = copy('Lý do ẩn / xét duyệt', 'Reason for moderation'); reason.setAttribute('aria-label', copy('Lý do duyệt/ẩn', 'Moderation reason')); options.append(reason);
        for (const [next, label] of [['approved', copy('Duyệt', 'Approve')], ['rejected', copy('Từ chối', 'Reject')], ['hidden', copy('Ẩn', 'Hide')]]) {
          if (next === item.status) continue;
          options.append(button(label!, async () => {
            if (!writable()) return;
            if (!reason.value.trim()) { tell(copy('Cần nhập lý do.', 'Enter a reason.')); reason.focus(); return; }
            writing = true; updateForm(); const actor = auth.user!.id;
            try { await runtime.api.moderate(item.id, next!, item.version, reason.value); if (runtime.current().user?.id !== actor || events.signal.aborted) return; await reload(); tell(copy('Đã cập nhật bình luận.', 'Comment updated.')); }
            catch (error) { if (runtime.current().user?.id === actor && !events.signal.aborted) failure(error); } finally { writing = false; updateForm(); }
          }));
        }
      }
    }
    if (!item.parent_id) {
      const replies = document.createElement('div'); replies.className = 'comment-replies';
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
      actions.append(loadReplies);
      if (item.status === 'approved' || auth.user?.role === 'owner') actions.append(button(copy('Trả lời', 'Reply'), () => {
        if (writing) return;
        editing = null; parent = item; context.textContent = copy('Trả lời ', 'Reply to ') + author; cancel.hidden = false; openCompose();
      }));
      content.append(replies);
    }
  }
  async function load(append: boolean) {
    if (loading) return; loading = true; more.disabled = true; const current = generation;
    try {
      const page = panel.dataset.feed === 'all' ? await runtime.api.commentFeed(append ? cursor : null, mine) : await runtime.api.comments(entity, append ? cursor : null, undefined, mine);
      if (current !== generation) return;
      if (!append) list.replaceChildren(); page.items.forEach(item => render(item, list)); cursor = page.nextCursor; more.hidden = !cursor;
      tell(page.items.length || append ? '' : copy('Chưa có bình luận. Hãy là người đầu tiên để lại vài dòng nhé.', 'No comments yet. Be the first to leave a few words.'));
      return true;
    } catch (error) { if (current === generation) failure(error); }
    finally { if (current === generation) { loading = false; more.disabled = false; } }
  }
  async function reload() {
    generation++; loading = false; state = null; updateForm(); list.replaceChildren(); cursor = null; more.hidden = true; const current = generation;
    try {
      const [registered, backendState] = await Promise.all([panel.dataset.entityId ? Promise.resolve({id:panel.dataset.entityId}) : runtime.api.resolveEntity(panel.dataset.context!), runtime.api.state()]);
      if (current !== generation) return; entity = registered.id; state = backendState; updateForm();
      if (state.source !== 'api' || state.epoch !== Number(panel.dataset.epoch)) { tell(copy('Bình luận đang bảo trì. Vui lòng thử lại sau.', 'Comments are in maintenance. Please retry later.')); return; }
      const loaded = await load(false);
      if (current !== generation) return false;
      if (state && !state.writes_enabled) tell(copy('Bình luận đang ở chế độ chỉ đọc.', 'Comments are read-only.'));
      return loaded;
    } catch (error) { if (current === generation) { state = null; updateForm(); failure(error); } }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (!writable()) return;
    let value: string; try { value = bodyText(body.value); } catch { tell(copy('Nhập từ 1 đến 4.000 ký tự.', 'Enter 1-4,000 characters.')); return; }
    writing = true; updateForm(); const actor = auth.user!.id;
    try {
      const fingerprint = JSON.stringify({ entity: parent?.entity_id ?? entity, parent: parent?.id, body: value });
      if (!retry || retry.fingerprint !== fingerprint) retry = { fingerprint, key: crypto.randomUUID() };
      const result = editing ? await runtime.api.editComment(editing.id, value, editing.version) : await runtime.api.createComment(parent?.entity_id ?? entity, value, retry.key, parent?.id);
      if (runtime.current().user?.id !== actor || events.signal.aborted) return;
      const replyTo = parent?.id; body.value = ''; retry = null; resetCompose(); const refreshed = await reload();
      if (runtime.current().user?.id !== actor || events.signal.aborted) return;
      if (replyTo) { const area = list.querySelector<HTMLElement>(`[data-comment-id="${replyTo}"] .comment-replies`); if (area) render(result, area); }
      if (!refreshed) return;
      if (!replyTo && !list.querySelector(`[data-comment-id="${result.id}"]`)) { render(result, list); list.prepend(list.lastElementChild!); }
      tell(result.status === 'approved' ? copy('Đã gửi bình luận.', 'Comment sent.') : result.status === 'pending' ? copy('Đã lưu bình luận, đang chờ Hiển duyệt.', "Comment saved, awaiting Hien's review.") : copy('Đã lưu chỉnh sửa. Bình luận vẫn đang ẩn.', 'Changes saved. This comment remains hidden.'));
    } catch (error) { if (runtime.current().user?.id === actor && !events.signal.aborted) failure(error); } finally { writing = false; updateForm(); }
  }, {signal: events.signal});
  mineButton.addEventListener('click', () => { mine = !mine; mineButton.textContent = mine ? copy('Tất cả bình luận', 'All comments') : copy('Bình luận của tôi', 'My comments'); resetCompose(); void reload(); }, {signal: events.signal});
  cancel.addEventListener('click', () => { resetCompose(); body.value = ''; }, {signal: events.signal});
  more.addEventListener('click', () => void load(true), {signal: events.signal});
  panel.querySelector('[data-comments-refresh]')!.addEventListener('click', () => void reload(), {signal: events.signal});
  opener?.addEventListener('click', () => { resetCompose(); openCompose(); }, {signal: events.signal});
  panel.querySelector('[data-comment-emoji]')?.addEventListener('click', () => {
    if (!auth.user || writing) return;
    body.setRangeText('🙂', body.selectionStart, body.selectionEnd, 'end'); body.focus();
  }, {signal: events.signal});
  let identity: string | null | undefined;
  const unsubscribe = runtime.subscribe(next => {
    auth = next; updateForm(); const id = next.user?.id ?? null;
    if (id !== identity) {
      if (identity) { body.value = ''; retry = null; }
      const previousIdentity = identity; identity = id; mine = false; mineButton.textContent = copy('Bình luận của tôi', 'My comments'); if (previousIdentity || !id) resetCompose(); list.replaceChildren(); void reload();
    }
  });
  return () => { generation++; events.abort(); unsubscribe(); list.replaceChildren(); };
}
