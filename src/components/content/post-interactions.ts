import type { BackendRuntime } from '../../lib/auth/runtime';
import { reactions, type PostReactions } from '../../lib/post-reactions';
import { openSignIn } from '../account/sign-in-dialog';
import { mountComments } from '../comments/controller';
import type { Publication } from '../../../supabase/functions/_shared/features';

type Runtime = Pick<BackendRuntime, 'api' | 'subscribe' | 'current'> &
  Partial<Pick<BackendRuntime, 'signIn'>>;
export function mountPostInteractions(
  card: HTMLElement,
  row: Publication,
  runtime: Runtime,
  options: {
    vi: boolean;
    base: string;
    template: HTMLTemplateElement | null;
    expanded: Set<string>;
  },
) {
  const { vi, base, template, expanded } = options;
  const copy = (a: string, b: string) => (vi ? a : b);
  const events = new AbortController();
  const footer = document.createElement('footer');
  footer.className = 'post-card-footer';
  const status = document.createElement('p');
  status.className = 'post-interaction-status';
  status.setAttribute('role', 'status');
  const url = new URL(
    `${base}${vi ? '' : 'en/'}community/post/?id=${encodeURIComponent(row.id)}#post-comments`,
    location.origin,
  ).href;
  const callback = `${base}${vi ? '' : 'en/'}account/callback/`;
  const login = () => openSignIn(runtime, vi, callback, events.signal);
  const signedIn = () => {
    if (!runtime.current().user) {
      login();
      return false;
    }
    return !runtime.current().busy;
  };
  let summary: PostReactions | null = null;
  let writing = false;
  let version = 0;
  const publicPost = !!row.published_revision;
  const buttons = new Map<string, HTMLButtonElement>();
  function button(label: string, action: () => void | Promise<void>) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', label);
    button.title = label;
    button.addEventListener('click', () => void action(), {
      signal: events.signal,
    });
    footer.append(button);
    return button;
  }
  function update(value: PostReactions, expectedVersion = version) {
    if (events.signal.aborted || expectedVersion !== version) return;
    summary = value;
    reactions.forEach((kind) => {
      const b = buttons.get(kind)!;
      b.setAttribute('aria-pressed', String(value.mine === kind));
      b.querySelector('[data-reaction-count]')!.textContent = String(
        value[kind],
      );
    });
    status.textContent = '';
  }
  function failure(expectedVersion = version) {
    if (!events.signal.aborted && expectedVersion === version)
      status.textContent = copy(
        'Chưa tải/lưu được cảm xúc. Bấm để thử lại.',
        'Could not load/save reactions. Select a reaction to retry.',
      );
  }
  for (const [kind, emoji, label] of [
    ['heart', '❤️', copy('Yêu thích', 'Heart')],
    ['laugh', '😆', copy('Haha', 'Laugh')],
    ['wow', '😮', copy('Wow', 'Wow')],
  ] as const) {
    const b = button(label, async () => {
      if (!signedIn() || writing || !publicPost) return;
      writing = true;
      buttons.forEach((b) => (b.disabled = true));
      version++;
      const actor = runtime.current().user!.id;
      try {
        let current = summary;
        if (!current) {
          const rows = await runtime.api.postReactions([row.id]);
          if (events.signal.aborted || runtime.current().user?.id !== actor)
            return;
          current = rows[0] ?? null;
          if (!current) {
            failure();
            return;
          }
          update(current);
        }
        const desired = current.mine === kind ? null : kind;
        const value = await runtime.api.setPostReaction(row.id, desired);
        if (runtime.current().user?.id === actor) update(value);
      } catch {
        if (runtime.current().user?.id === actor) failure();
      } finally {
        writing = false;
        if (!events.signal.aborted)
          buttons.forEach((b) => (b.disabled = false));
      }
    });
    b.dataset.reaction = kind;
    b.setAttribute('aria-pressed', 'false');
    const icon = document.createElement('span');
    icon.textContent = emoji;
    icon.setAttribute('aria-hidden', 'true');
    const count = document.createElement('span');
    count.dataset.reactionCount = '';
    count.textContent = '–';
    b.append(icon, count);
    b.disabled = !publicPost;
    buttons.set(kind, b);
  }
  const comments = document.createElement('div');
  comments.className = 'post-inline-comments';
  comments.id = `post-comments-${row.id}`;
  comments.hidden = true;
  let stopComments: (() => void) | null = null;
  const commentButton = button(copy('Bình luận', 'Comments'), () => {
    const opening = comments.hidden;
    if (opening) expanded.add(row.id);
    else expanded.delete(row.id);
    showComments(opening);
    if (!runtime.current().user) login();
  });
  commentButton.dataset.postComments = '';
  commentButton.setAttribute('aria-controls', comments.id);
  // These icons are fixed application markup; submitted text never enters HTML.
  commentButton.innerHTML =
    '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9.5 9.5 0 1 1 19 0Z"/></svg>';
  const commentLabel = document.createElement('span');
  commentLabel.textContent = copy('Bình luận', 'Comments');
  commentButton.append(commentLabel);
  function showComments(open: boolean) {
    comments.hidden = !open;
    commentButton.setAttribute('aria-expanded', String(open));
    if (!open || stopComments || !template) return;
    comments.append(template.content.cloneNode(true));
    const panel = comments.querySelector<HTMLElement>('[data-api-comments]')!;
    panel.dataset.inlinePost = 'true';
    panel.setAttribute(
      'aria-label',
      `${copy('Bình luận', 'Comments')}: ${String(row.payload.title)} · ${new Date(row.created_at).toLocaleString(vi ? 'vi-VN' : 'en-US')}`,
    );
    panel.dataset.entityId = row.entity_id;
    const textarea = panel.querySelector('textarea')!;
    textarea.id = `comment-body-${row.id}`;
    panel.querySelector('label')?.setAttribute('for', textarea.id);
    const prompt = document.createElement('button');
    prompt.type = 'button';
    prompt.dataset.signIn = '';
    prompt.textContent = copy('Đăng nhập để bình luận', 'Sign in to comment');
    prompt.hidden = !!runtime.current().user;
    prompt.addEventListener('click', login, { signal: events.signal });
    panel.querySelector('[data-comments-composer]')!.prepend(prompt);
    panel.addEventListener('comments-sign-in', login, {
      signal: events.signal,
    });
    stopComments = mountComments(panel, runtime);
  }
  const share = button(copy('Chia sẻ', 'Share'), async () => {
    if (!signedIn() || !publicPost) return;
    try {
      await navigator.clipboard.writeText(url);
      if (!events.signal.aborted)
        status.textContent = copy('Đã sao chép liên kết.', 'Link copied.');
    } catch {
      if (!events.signal.aborted) {
        fallback.hidden = false;
        fallback.focus();
        fallback.select();
        status.textContent = copy(
          'Sao chép liên kết bên dưới.',
          'Copy the link below.',
        );
      }
    }
  });
  share.dataset.postShare = '';
  share.disabled = !publicPost;
  share.innerHTML =
    '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m14 3 8 7-8 7v-4C7 13 4 16 2 21 2 11 7 7 14 7Z"/></svg>';
  const shareLabel = document.createElement('span');
  shareLabel.textContent = copy('Chia sẻ', 'Share');
  share.append(shareLabel);
  const fallback = document.createElement('input');
  fallback.type = 'url';
  fallback.readOnly = true;
  fallback.value = url;
  fallback.hidden = true;
  fallback.className = 'post-share-link';
  fallback.setAttribute(
    'aria-label',
    copy('Liên kết bài viết và bình luận', 'Post and comments link'),
  );
  card.append(footer, status, fallback, comments);
  showComments(expanded.has(row.id));
  return {
    update,
    failure,
    version: () => version,
    resetSelection() {
      version++;
      summary = null;
      buttons.forEach((button) => button.setAttribute('aria-pressed', 'false'));
    },
    dispose() {
      events.abort();
      stopComments?.();
    },
  };
}
