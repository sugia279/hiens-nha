import { reactionEmoji, type PostReactions } from '../../lib/post-reactions';
import {
  identifyGuest,
  type SocialRuntime,
} from '../account/guest-identity-dialog';
import { openSignIn } from '../account/sign-in-dialog';
import { mountComments } from '../comments/controller';
import type { Publication } from '../../../supabase/functions/_shared/features';

type Runtime = SocialRuntime;
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
  const picker = document.createElement('div');
  picker.className = 'reaction-picker';
  picker.id = 'reaction-picker-' + row.id;
  picker.hidden = true;
  picker.setAttribute('role', 'group');
  picker.setAttribute('aria-label', copy('Chọn cảm xúc', 'Choose a reaction'));
  const control = button(copy('Cảm xúc', 'React'), () => {
    picker.hidden = !picker.hidden;
    control.setAttribute('aria-expanded', String(!picker.hidden));
    if (!picker.hidden) buttons.get(summary?.mine ?? 'heart')?.focus();
  });
  control.dataset.reactionControl = '';
  control.textContent = copy('♡ Cảm xúc', '♡ React');
  control.setAttribute('aria-controls', picker.id);
  control.setAttribute('aria-expanded', 'false');
  control.disabled = !publicPost;
  const total = button(
    copy('Xem cảm xúc', 'View reactions'),
    () => void details(),
  );
  total.dataset.reactionTotal = '';
  total.textContent = '–';
  total.disabled = !publicPost;
  footer.append(picker);
  const dismiss = () => {
    picker.hidden = true;
    control.setAttribute('aria-expanded', 'false');
  };
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (
        !picker.contains(e.target as Node) &&
        !control.contains(e.target as Node)
      )
        dismiss();
    },
    { signal: events.signal },
  );
  picker.addEventListener(
    'keydown',
    (e) => {
      const list = [...buttons.values()];
      let index = list.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'Escape') {
        dismiss();
        control.focus();
      } else if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        index =
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? 2
              : (index + (e.key === 'ArrowRight' ? 1 : 2)) % 3;
        list[index]?.focus();
      }
    },
    { signal: events.signal },
  );
  async function details() {
    if (document.querySelector('[data-reaction-details]')) return;
    const dialog = document.createElement('dialog');
    dialog.dataset.reactionDetails = '';
    dialog.className = 'social-dialog';
    dialog.setAttribute('aria-label', copy('Cảm xúc', 'Reactions'));
    const heading = document.createElement('h2');
    heading.textContent = copy('Cảm xúc', 'Reactions');
    const list = document.createElement('ul');
    list.dataset.originalContent = '';
    const note = document.createElement('p');
    note.setAttribute('role', 'status');
    const more = document.createElement('button');
    more.type = 'button';
    more.textContent = copy('Xem thêm', 'More');
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = copy('Đóng', 'Close');
    let cursor: string | null = null,
      busy = false,
      closed = false;
    function dispose() {
      if (closed) return;
      closed = true;
      dialog.close();
      dialog.remove();
      events.signal.removeEventListener('abort', dispose);
      if (!events.signal.aborted) total.focus();
    }
    async function load() {
      if (busy) return;
      busy = true;
      more.disabled = true;
      try {
        const page = await runtime.api.postReactionDetails(row.id, cursor);
        if (closed) return;
        page.items.forEach((item) => {
          const li = document.createElement('li');
          const avatar = document.createElement('span');
          avatar.textContent = '👤';
          if (item.avatar_url && item.avatar_url.startsWith('https://')) {
            const img = document.createElement('img');
            img.src = item.avatar_url;
            img.alt = '';
            img.width = 32;
            img.height = 32;
            img.referrerPolicy = 'no-referrer';
            img.addEventListener(
              'error',
              () => img.replaceWith(document.createTextNode('👤')),
              { once: true },
            );
            avatar.replaceChildren(img);
          }
          const name = document.createElement('span');
          name.textContent = item.display_name || 'Người Lạ';
          const emoji = document.createElement('span');
          emoji.textContent = reactionEmoji[item.reaction];
          li.append(avatar, name, emoji);
          list.append(li);
        });
        cursor = page.nextCursor;
        more.hidden = !cursor;
        note.textContent = list.children.length
          ? ''
          : copy('Chưa có cảm xúc.', 'No reactions yet.');
      } catch {
        if (!closed) {
          note.textContent = copy(
            'Không tải được. Thử lại.',
            'Could not load. Retry.',
          );
          more.hidden = false;
        }
      } finally {
        busy = false;
        more.disabled = false;
      }
    }
    dialog.append(heading, list, note, more, close);
    close.addEventListener('click', dispose);
    dialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      dispose();
    });
    more.addEventListener('click', () => void load());
    events.signal.addEventListener('abort', dispose, { once: true });
    document.body.append(dialog);
    dialog.showModal();
    void load();
  }
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
    control.textContent = value.mine
      ? reactionEmoji[value.mine]
      : copy('♡ Cảm xúc', '♡ React');
    total.textContent = String(value.heart + value.laugh + value.wow);
    buttons.forEach((button, kind) =>
      button.setAttribute('aria-pressed', String(value.mine === kind)),
    );
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
    ['laugh', '😊', copy('Cười', 'Smile')],
    ['wow', '😮', copy('Wow', 'Wow')],
  ] as const) {
    const b = button(label, async () => {
      if (runtime.current().busy || writing || !publicPost) return;
      dismiss();
      writing = true;
      buttons.forEach((b) => (b.disabled = true));
      version++;
      let actor = runtime.current().user?.id;
      try {
        await runtime.ensureSocialIdentity?.();
        actor = runtime.current().user?.id;
        if (!actor) throw Error('Guest unavailable');
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
        if (runtime.current().user?.id === actor) {
          update(value);
          // Identity follows commit; never repeat the reaction during this transition.
          try {
            await identifyGuest(runtime, vi, base, events.signal);
          } catch {
            status.textContent = copy(
              'Đã lưu cảm xúc; chưa tải được tên.',
              'Reaction saved; identity unavailable.',
            );
          }
        }
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
    b.append(icon);
    picker.append(b);
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
      control.textContent = copy('♡ Cảm xúc', '♡ React');
      dismiss();
    },
    dispose() {
      events.abort();
      stopComments?.();
    },
  };
}
