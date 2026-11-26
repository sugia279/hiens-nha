import type { BackendRuntime } from '../../lib/auth/runtime';
import { ApiError } from '../../../supabase/functions/_shared/contracts';
import {
  featurePayload,
  type HelpRequest,
} from '../../../supabase/functions/_shared/features';
import {
  requestStatuses,
  statusLabels,
  transitions,
} from '../../../supabase/functions/_shared/domain/requests.mjs';
import { mountComments } from '../comments/controller';
export function mountRequests(
  panel: HTMLElement,
  runtime: Pick<BackendRuntime, 'api' | 'subscribe' | 'current'>,
) {
  const vi = panel.dataset.locale === 'vi',
    copy = (a: string, b: string) => (vi ? a : b),
    mode = panel.dataset.mode!,
    base = panel.dataset.base!,
    labels = statusLabels[vi ? 'vi' : 'en'] as Record<string, string>;
  const status = panel.querySelector<HTMLElement>('[data-request-status]')!,
    list = panel.querySelector<HTMLElement>('[data-request-list]')!,
    detail = panel.querySelector<HTMLElement>('[data-request-detail]')!,
    more = panel.querySelector<HTMLButtonElement>('[data-request-more]')!;
  const form = panel.querySelector<HTMLFormElement>('[data-request-form]'),
    history = panel.querySelector<HTMLElement>('[data-request-history]')!,
    older = panel.querySelector<HTMLButtonElement>(
      '[data-request-history-more]',
    )!;
  let current: HelpRequest | null = null,
    cursor: string | null = null,
    historyCursor: string | null = null,
    generation = 0,
    writable = false,
    loading = false,
    writing = false,
    conflict = false,
    discussionCleanup: (() => void) | null = null;
  let retry: { signature: string; key: string } | null = null;
  const tell = (s: string) => {
    status.textContent = s;
  };
  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.status === 409) conflict = true;
    tell(
      e instanceof ApiError && e.status === 409
        ? copy(
            'Phạm vi hoặc tiến độ đã đổi. Nội dung nhập được giữ; tải lại và kiểm tra trước khi gửi tiếp.',
            'Scope or progress changed. Input kept; reload and review before retrying.',
          )
        : copy(
            'Không tải/lưu được yêu cầu. Vui lòng thử lại.',
            'Could not load/save request. Please retry.',
          ),
    );
  };
  const link = (r: HelpRequest) =>
    `${base}${vi ? '' : 'en/'}requests/detail/?id=${r.id}`;
  function button(label: string, fn: () => void | Promise<void>) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => void fn());
    return b;
  }
  function text(target: HTMLElement, value: string, tag = 'p') {
    const p = document.createElement(tag);
    p.textContent = value;
    target.append(p);
    return p;
  }
  function edit(row: HelpRequest | null) {
    if (!form) return;
    current = row;
    conflict = false;
    retry = null;
    const payload = row?.payload ?? {
      title: '',
      description: '',
      expectedResult: '',
      category: 'technology',
      priority: 'normal',
      tags: [],
    };
    for (const name of [
      'title',
      'description',
      'expectedResult',
      'category',
      'priority',
      'tags',
    ])
      (form.elements.namedItem(name) as HTMLInputElement).value =
        name === 'tags'
          ? (payload.tags as string[]).join(', ')
          : String(payload[name]);
    form.hidden = !runtime.current().user || !!runtime.current().user?.guest;
  }
  async function events(append = false) {
    if (!current) return;
    const tag = generation;
    if (!append) {
      history.replaceChildren();
      historyCursor = null;
    }
    try {
      const page = await runtime.api.requestHistory(
        current.id,
        append ? historyCursor : null,
      );
      if (tag !== generation) return;
      for (const e of page.items) {
        const article = document.createElement('article');
        article.dataset.eventId = String(e.id);
        text(
          article,
          `v${e.version} · scope ${e.scope_revision} · ${labels[String(e.status)]} · ${e.action}`,
          'h3',
        );
        text(article, `${e.id} · ${e.created_at} · ${e.actor_id ?? 'legacy'}`);
        text(article, String(e.message));
        if (e.result) text(article, String(e.result));
        if (e.corrects)
          text(
            article,
            copy('Đính chính cho sự kiện: ', 'Correction for event: ') +
              e.corrects,
          );
        history.append(article);
      }
      historyCursor = page.nextCursor;
      older.hidden = !historyCursor;
    } catch (e) {
      if (tag === generation) fail(e);
    }
  }
  async function mutate(
    row: HelpRequest,
    action: 'moderate' | 'transitions' | 'corrections',
    payload: Record<string, unknown>,
  ) {
    if (writing || !writable || conflict) return;
    writing = true;
    const tag = generation;
    try {
      await runtime.api.requestAction(
        row.id,
        action,
        {
          ...payload,
          expectedVersion: row.version,
          scopeRevision: row.scope_revision,
        },
        crypto.randomUUID(),
      );
      if (tag === generation) {
        await reload();
        tell(copy('Đã lưu cập nhật.', 'Update saved.'));
      }
    } catch (e) {
      if (tag === generation) fail(e);
    } finally {
      writing = false;
    }
  }
  function ownerActions(row: HelpRequest, target: HTMLElement) {
    if (runtime.current().user?.role !== 'owner') return;
    const reason = document.createElement('input');
    reason.maxLength = 2000;
    reason.setAttribute(
      'aria-label',
      copy('Nội dung cập nhật / lý do', 'Update message / reason'),
    );
    target.append(reason);
    for (const decision of ['approved', 'rejected', 'hidden'])
      target.append(
        button(copy('Công khai: ', 'Publication: ') + decision, () => {
          if (!reason.value.trim()) return;
          return mutate(row, 'moderate', { decision, reason: reason.value });
        }),
      );
    const select = document.createElement('select');
    select.setAttribute('aria-label', copy('Tiến độ mới', 'Next status'));
    for (const value of requestStatuses.filter(
      (s: string) =>
        s === row.status ||
        (transitions as Record<string, string[]>)[row.status]?.includes(s),
    )) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = labels[value]!;
      select.append(option);
    }
    select.value = row.status;
    const result = document.createElement('textarea');
    result.maxLength = 4000;
    result.value = row.result;
    result.setAttribute(
      'aria-label',
      copy('Kết quả hoàn thành', 'Completion result'),
    );
    target.append(
      select,
      result,
      button(copy('Cập nhật tiến độ', 'Update progress'), () => {
        if (!reason.value.trim()) return;
        return mutate(row, 'transitions', {
          status: select.value,
          message: reason.value,
          result: result.value,
        });
      }),
    );
    if (mode === 'detail') {
      const event = document.createElement('input');
      event.setAttribute(
        'aria-label',
        copy('ID sự kiện cần đính chính', 'Event ID to correct'),
      );
      target.append(
        event,
        button(copy('Thêm đính chính', 'Append correction'), () => {
          if (!reason.value.trim() || !event.value.trim()) return;
          return mutate(row, 'corrections', {
            eventId: event.value,
            message: reason.value,
          });
        }),
      );
    }
  }
  function card(row: HelpRequest) {
    const article = document.createElement('article');
    article.className = 'api-request-card';
    article.dataset.requestId = row.id;
    const h = document.createElement('h3'),
      a = document.createElement('a');
    a.href = link(row);
    a.textContent = String(row.payload.title);
    h.append(a);
    article.append(h);
    text(
      article,
      `${labels[row.status]} · ${row.moderation} · scope ${row.scope_revision}`,
    );
    text(article, String(row.payload.expectedResult));
    if (mode === 'admin') ownerActions(row, article);
    list.append(article);
  }
  async function read() {
    const tag = generation;
    try {
      const id = new URLSearchParams(location.search).get('id');
      const row = panel.dataset.legacyNumber
        ? await runtime.api.legacyRequest(Number(panel.dataset.legacyNumber))
        : id
          ? await runtime.api.helpRequest(id)
          : null;
      if (tag !== generation) return;
      if (!row) {
        tell(copy('Thiếu mã yêu cầu.', 'Request ID required.'));
        return;
      }
      current = row;
      detail.replaceChildren();
      text(detail, String(row.payload.title), 'h2');
      text(
        detail,
        `${labels[row.status]} · ${row.moderation} · scope ${row.scope_revision} · accepted ${row.accepted_scope_revision ?? '—'}`,
      );
      text(detail, String(row.payload.description));
      text(
        detail,
        copy('Kết quả mong đợi: ', 'Expected result: ') +
          row.payload.expectedResult,
      );
      text(
        detail,
        copy('Kết quả hiện tại: ', 'Current result: ') +
          (row.result || copy('Chưa xác nhận hoàn thành.', 'Not completed.')),
      );
      ownerActions(row, detail);
      if (form) {
        form.hidden = row.author_id !== runtime.current().user?.id;
        if (!form.hidden) edit(row);
      }
      panel.querySelector<HTMLElement>(
        '[data-request-history-section]',
      )!.hidden = false;
      await events();
      if (tag !== generation) return;
      const discussion = panel.querySelector<HTMLElement>(
        '[data-request-discussion]',
      );
      if (discussion) {
        discussion.hidden = false;
        const child = discussion.querySelector<HTMLElement>(
          '[data-api-comments]',
        )!;
        child.dataset.entityId = row.entity_id;
        discussionCleanup = mountComments(child, runtime);
      }
      tell(copy('Đã tải yêu cầu.', 'Request loaded.'));
    } catch (e) {
      if (tag === generation) fail(e);
    }
  }
  async function load(append = false) {
    if (loading) return;
    loading = true;
    const tag = generation;
    try {
      const view =
        mode === 'admin'
          ? 'all'
          : (panel.querySelector<HTMLSelectElement>('[data-request-view]')
              ?.value ?? 'public');
      if (view !== 'public' && !runtime.current().user) {
        tell(copy('Đăng nhập để xem.', 'Sign in to view.'));
        return;
      }
      const page = await runtime.api.requests(
        view,
        append ? cursor : null,
        panel.querySelector<HTMLSelectElement>('[data-request-filter]')?.value,
      );
      if (tag !== generation) return;
      if (!append) list.replaceChildren();
      page.items.forEach(card);
      cursor = page.nextCursor;
      more.hidden = !cursor;
      tell(copy('Đã tải bảng nhờ vả.', 'Request board loaded.'));
    } catch (e) {
      if (tag === generation) fail(e);
    } finally {
      if (tag === generation) loading = false;
    }
  }
  async function reload() {
    const tag = ++generation;
    loading = false;
    conflict = false;
    list.replaceChildren();
    detail.replaceChildren();
    history.replaceChildren();
    older.hidden = true;
    more.hidden = true;
    discussionCleanup?.();
    discussionCleanup = null;
    const d = panel.querySelector<HTMLElement>('[data-request-discussion]');
    if (d) d.hidden = true;
    if (form && mode === 'detail') form.hidden = true;
    try {
      const state = await runtime.api.featureState('requests');
      if (tag !== generation) return;
      writable =
        state.source === 'api' &&
        state.epoch === Number(panel.dataset.epoch) &&
        state.writes_enabled;
      if (
        state.source !== 'api' ||
        state.epoch !== Number(panel.dataset.epoch)
      ) {
        tell(copy('Nhờ vả đang bảo trì.', 'Requests are in maintenance.'));
        return;
      }
      if (mode === 'detail') await read();
      else if (mode === 'admin' && runtime.current().user?.role !== 'owner')
        tell(copy('Chỉ chủ nhà được quản trị.', 'Owner access required.'));
      else await load();
    } catch (e) {
      if (tag === generation) fail(e);
    }
  }
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (writing || !writable || conflict || (!runtime.current().user || runtime.current().user?.guest)) return;
    const tag = generation;
    writing = true;
    try {
      const fields = Object.fromEntries(new FormData(form));
      const payload = featurePayload('requests', fields),
        signature = JSON.stringify({
          payload,
          id: current?.id,
          version: current?.version,
        });
      if (!retry || retry.signature !== signature)
        retry = { signature, key: crypto.randomUUID() };
      const row = current
        ? await runtime.api.requestAction(
            current.id,
            'scope',
            {
              payload,
              expectedVersion: current.version,
              scopeRevision: current.scope_revision,
            },
            retry.key,
          )
        : await runtime.api.createRequest(payload, retry.key);
      if (tag !== generation) return;
      retry = null;
      current = row;
      tell(
        copy(
          'Đã lưu. Công khai khác với nhận việc.',
          'Saved. Publication is separate from acceptance.',
        ),
      );
      if (mode === 'board') {
        form.hidden = true;
        const a = document.createElement('a');
        a.href = link(row);
        a.textContent = copy('Xem yêu cầu vừa gửi', 'View your request');
        status.append(' ', a);
      } else await reload();
    } catch (e) {
      if (tag === generation) fail(e);
    } finally {
      writing = false;
    }
  });
  panel.querySelector('[data-request-new]')?.addEventListener('click', () => {
    if (!runtime.current().user || runtime.current().user?.guest) {
      tell(copy('Đăng nhập để gửi yêu cầu.', 'Sign in to submit a request.'));
      return;
    }
    edit(null);
  });
  panel
    .querySelector('[data-request-filter]')
    ?.addEventListener('change', () => void reload());
  panel
    .querySelector('[data-request-view]')
    ?.addEventListener('change', () => void reload());
  panel
    .querySelector('[data-request-refresh]')!
    .addEventListener('click', () => void reload());
  more.addEventListener('click', () => void load(true));
  older.addEventListener('click', () => void events(true));
  let identity: string | null | undefined;
  const unsubscribe = runtime.subscribe(({ user }) => {
    const id = user?.id ?? null;
    if (id !== identity) {
      identity = id;
      current = null;
      retry = null;
      if (form) {
        form.reset();
        form.hidden = true;
      }
      void reload();
    }
  });
  return () => {
    generation++;
    unsubscribe();
    discussionCleanup?.();
    list.replaceChildren();
    detail.replaceChildren();
    history.replaceChildren();
  };
}
