import { renderPostDetails, renderPostImages } from './post-presentation';
import { mountPostInteractions } from './post-interactions';
import { homeAuthorName } from '../../config/home-feed';
import { homeAuthorId } from '../../config/home-feed';
import type { BackendRuntime } from '../../lib/auth/runtime';
import { ApiError } from '../../../supabase/functions/_shared/contracts';
import {
  featurePayload,
  type Publication,
} from '../../../supabase/functions/_shared/features';
import { mediaEmbed } from '../../../supabase/functions/_shared/domain/media-links.mjs';
import { renderMarkdown } from './safe-preview';
import { mountComments } from '../comments/controller';
import { categoryCatalogue } from '../../lib/category-catalogue';
import { categoryTags, categoryLabel, defaultCategories, findCategory, matchesCategory } from '../../lib/content-categories';
export function mountPublications(
  panel: HTMLElement,
  runtime: Pick<BackendRuntime, 'api' | 'subscribe' | 'current'> & Partial<Pick<BackendRuntime, 'signIn'>>,
) {
  const mediaCleanups: (()=>void)[] = [];
  const interactions = new Map<string, ReturnType<typeof mountPostInteractions>>();
  const expandedPosts = new Set<string>();
  const clearMedia = ()=>{mediaCleanups.splice(0).forEach(cleanup=>cleanup()); interactions.forEach(view => view.dispose()); interactions.clear();};
  function loadReactions(ids: string[]) {
    if (!ids.length) return;
    const tag = generation, views = new Map([...interactions].map(([id, view]) => [id, {view, version: view.version()}]));
    for (let offset = 0; offset < ids.length; offset += 50) {
      const batch = ids.slice(offset, offset + 50);
      void runtime.api.postReactions(batch).then(rows => {
        if (tag === generation) rows.forEach(row => { const saved = views.get(row.post_id); saved?.view.update(row, saved.version); });
      }).catch(() => { if (tag === generation) batch.forEach(id => { const saved = views.get(id); saved?.view.failure(saved.version); }); });
    }
  }
  const thought = panel.closest('[data-home-composer]')?.querySelector<HTMLTextAreaElement>('[data-home-thought]');
  const note = panel.closest('[data-home-composer]')?.querySelector<HTMLElement>('[data-composer-note]');
  const composerEvents = new AbortController();
  const vi = panel.dataset.locale === 'vi',
    copy = (a: string, b: string) => (vi ? a : b),
    mode = panel.dataset.mode!,
    ownerOnly = panel.dataset.ownerOnly === 'true',
    homeFeed = panel.dataset.homeFeed === 'true',
    base = panel.dataset.base!;
  const status = panel.querySelector<HTMLElement>('[data-feature-status]')!,
    list = panel.querySelector<HTMLElement>('[data-feature-list]')!,
    preview = panel.querySelector<HTMLElement>('[data-publication-preview]')!,
    more = panel.querySelector<HTMLButtonElement>('[data-feature-more]')!;
  const legacyAnchors = JSON.parse(
    panel.dataset.legacyAnchors ?? '{}',
  ) as Record<string, string>;
  const form = panel.querySelector<HTMLFormElement>(
    'form[data-publication-form]',
  );
  const select = panel.querySelector<HTMLSelectElement>(
    '[data-feature-select]',
  );
  if (select) select.value = panel.dataset.feature!;
  let feature = panel.dataset.feature as 'posts' | 'media',
    current: Publication | null = null,
    cursor: string | null = null,
    historyCursor: string | null = null;
  let generation = 0,
    loading = false,
    writable = false,
    savePromise: Promise<void> | null = null,
    timer: ReturnType<typeof setTimeout> | null = null,
    lastSaved = '',
    conflicted = false;
  let retry: { signature: string; key: string } | null = null,
    discussionCleanup: (() => void) | null = null;
  const tell = (value: string) => {
    status.textContent = value;
  };
  const fail = (error: unknown) => {
    if (error instanceof ApiError && error.status === 409) conflicted = true;
    tell(
      error instanceof ApiError && error.status === 409
        ? copy(
            'Phiên bản đã đổi. Bản đang nhập được giữ; tải lại để xem bản lưu trước khi gửi tiếp.',
            'Version changed. Draft kept; reload and review the saved version before continuing.',
          )
        : copy(
            'Không tải/lưu được. Bản đang nhập được giữ; vui lòng thử lại.',
            'Could not load/save. Draft kept; please retry.',
          ),
    );
  };
  const link = (type: string, id: string) =>
    `${base}${vi ? '' : 'en/'}community/${type}/?id=${encodeURIComponent(id)}`;
  function button(text: string, fn: () => void | Promise<void>) {
    const el = document.createElement('button');
    el.type = 'button';
    el.textContent = text;
    el.addEventListener('click', () => void fn());
    return el;
  }
  const input = (name: string) =>
    form!.elements.namedItem(name) as HTMLInputElement;
  function payload() {
    const value: Record<string, unknown> = feature === 'posts'
      ? {
          ...(current?.payload.social ? {social:current.payload.social} : {}),
          title: input('title').value,
          body: input('body').value,
          kind: input('kind').value,
          category: input('category').value,
          tags: input('tags').value,
          series: input('series').value,
          order: Number(input('order').value),
        }
      : {
          title: input('title').value,
          description: input('description').value,
          category: input('mediaCategory').value,
          tags: input('tags').value,
          url: input('url').value,
        };
    const picker = form?.querySelector<HTMLInputElement>(`[data-taxonomy-input="${feature}"]`);
    if (feature === 'posts' && picker && (picker.value !== current?.payload.category || picker.value.length <= 40)) {
      value.category = findCategory(categoryCatalogue(runtime).items(),'posts',picker.value)?.label ?? categoryLabel(picker.value);
      value.tags = categoryTags(value.tags,String(value.category));
    }
    const folder = form?.elements.namedItem('mediaFolder') as HTMLInputElement | null;
    if (feature === 'media' && folder) {
      const category = findCategory(categoryCatalogue(runtime).items(),'media',folder.value);
      if (category?.id === 'music' || category?.id === 'video') value.category = category.id;
      value.tags = categoryTags(value.tags,category?.label ?? folder.value);
    }
    return value;
  }
  function drawBody(target: HTMLElement, p: Record<string, unknown>) {
    target.replaceChildren();
    if (feature === 'posts') { renderPostDetails(target,p,vi);const text=document.createElement('div');renderMarkdown(text,String(p.body??''),base);target.append(text);mediaCleanups.push(renderPostImages(target,p,runtime,vi)); }
    else {
      const text = document.createElement('p');
      text.className = 'publication-text';
      text.textContent = String(p.description ?? '');
      target.append(text);
      const embed = typeof p.url === 'string' ? mediaEmbed(p.url) : null;
      if (embed) {
        const frame = document.createElement('iframe');
        frame.className = 'publication-player';
        frame.title = String(p.title);
        frame.src = embed;
        frame.loading = 'lazy';
        frame.allowFullscreen = true;
        target.append(frame);
        const fallback = document.createElement('a');
        fallback.href = String(p.url);
        fallback.target = '_blank';
        fallback.rel = 'noopener noreferrer';
        fallback.textContent = copy(
          'Mở video trên nền tảng gốc',
          'Open on provider',
        );
        target.append(fallback);
      }
    }
  }
  function populate(row: Publication | null) {
    generation++;
    loading = false;
    if (timer) clearTimeout(timer);
    current = row;
    conflicted = false;
    retry = null;
    if (!form) return;
    const p = row?.payload ?? {
      title: '',
      body: '',
      kind: 'article',
      category: 'Dự Án',
      tags: ['chia-se'],
      series: '',
      order: 1,
      url: '',
      description: '',
    };
    for (const name of [
      'title',
      'body',
      'kind',
      'category',
      'series',
      'order',
      'url',
      'description',
    ])
      input(name).value = String(
        name === 'url' ? (p.sourceUrl ?? p.url ?? '') : (p[name] ?? ''),
      );
    input('mediaCategory').value = String(
      feature === 'media' && ['music', 'video'].includes(String(p.category))
        ? p.category
        : 'music',
    );
    input('tags').value = Array.isArray(p.tags) ? p.tags.join(', ') : '';
    const mediaFolder = form.elements.namedItem('mediaFolder') as HTMLInputElement | null;
    if (mediaFolder) mediaFolder.value = categoryCatalogue(runtime).items().find(c => c.scope === 'media' && Array.isArray(p.tags) && p.tags.includes(c.label))?.label
      ?? defaultCategories.find(c => c.scope === 'media' && c.id === (p.category === 'music' ? 'music' : 'video'))!.label;
    if (feature === 'posts') input('category').maxLength = Math.max(40,String(p.category ?? '').length);
    panel.querySelectorAll<HTMLElement>('[data-post-field]').forEach((e) => {
      e.hidden = feature !== 'posts';
    });
    panel.querySelectorAll<HTMLElement>('[data-media-field]').forEach((e) => {
      e.hidden = feature !== 'media';
    });
    panel.querySelector<HTMLElement>('[data-delete-publication]')!.hidden =
      !row;
    lastSaved = row ? JSON.stringify(featurePayload(feature, payload())) : '';
    if (thought) thought.value = input('body').value;
    drawBody(preview, p);
    void history(false);
  }
  async function history(append: boolean) {
    const area = panel.querySelector<HTMLElement>('[data-publication-history]'),
      older = panel.querySelector<HTMLButtonElement>('[data-history-more]');
    if (!area || !older) return;
    if (!append) {
      area.replaceChildren();
      historyCursor = null;
    }
    if (!current) {
      older.hidden = true;
      return;
    }
    const tag = generation;
    try {
      const page = await runtime.api.publicationHistory(
        feature,
        current.id,
        append ? historyCursor : null,
      );
      if (tag !== generation) return;
      for (const row of page.items) {
        const el = document.createElement('pre');
        el.className = 'publication-text';
        el.textContent = `r${row.revision} · ${row.status} · ${row.created_at} · ${row.actor_id ?? 'legacy'}\n${row.title}\n${row.body}\n${row.category ?? ''} · ${Array.isArray(row.tags) ? row.tags.join(', ') : ''}${row.source_url ? '\n' + row.source_url : ''}`;
        area.append(el);
      }
      historyCursor = page.nextCursor;
      older.hidden = !historyCursor;
    } catch (error) {
      if (tag === generation) fail(error);
    }
  }
  async function save() {
    if (!form || !runtime.current().user || (ownerOnly && runtime.current().user?.role !== 'owner') || !writable || conflicted) return;
    if (savePromise) {
      await savePromise;
      return save();
    }
    let normalized: Record<string, unknown>;
    try {
      normalized = featurePayload(feature, payload());
    } catch {
      tell(
        copy(
          'Bản đang nhập chưa đủ thông tin để lưu.',
          'Draft needs valid fields before saving.',
        ),
      );
      return;
    }
    const signature = JSON.stringify(normalized);
    if (current && lastSaved === signature) return;
    const tag = generation,
      actor = runtime.current().user!.id;
    if (!retry || retry.signature !== signature)
      retry = { signature, key: crypto.randomUUID() };
    const key = retry.key;
    savePromise = (async () => {
      try {
        const picker = form.querySelector<HTMLInputElement>(`[data-taxonomy-input="${feature}"]`);
        if (picker && (feature !== 'posts' || picker.value !== current?.payload.category)) await categoryCatalogue(runtime).ensure(feature,picker.value);
        if (tag !== generation || runtime.current().user?.id !== actor) return;
        const row = await runtime.api.savePublication(
          feature,
          normalized,
          key,
          current,
        );
        if (tag !== generation || runtime.current().user?.id !== actor) return;
        current = row;
        lastSaved = signature;
        retry = null;
        tell(copy('Đã lưu nháp riêng tư.', 'Private draft saved.'));
        panel.querySelector<HTMLElement>('[data-delete-publication]')!.hidden =
          false;
        void history(false);
      } catch (error) {
        if (tag === generation) fail(error);
        throw error;
      } finally {
        savePromise = null;
      }
    })();
    await savePromise;
  }
  async function action(
    row: Publication,
    which: 'submit' | 'moderate' | 'unpublish' | 'delete',
    decision?: string,
    reason?: string,
  ) {
    const tag = generation;
    try {
      const payload = {
        expectedVersion: row.version,
        ...(decision ? { decision, revision: row.revision } : {}),
        ...(reason ? { reason } : {}),
      };
      const saved = await runtime.api.publicationAction(
        feature,
        row.id,
        which,
        payload,
        crypto.randomUUID(),
      );
      if (tag !== generation) return;
      if (which === 'delete') populate(null);
      else if (mode === 'editor') current = saved;
      await reload();
      tell(
        copy(
          'Đã lưu thao tác. Nội dung public chỉ đổi sau khi được duyệt.',
          'Saved. Public content changes only after approval.',
        ),
      );
    } catch (error) {
      if (tag === generation) fail(error);
    }
  }
  function card(row: Publication) {
    if (homeFeed && row.author_id !== homeAuthorId && !(runtime.current().user?.role==='owner'&&row.author_id===runtime.current().user?.id)) return;
    const el = document.createElement('article');
    el.className = 'publication-card';
    if (list.querySelector(`[data-publication-id="${row.id}"]`)) return;
    el.dataset.publicationId = row.id;
    if (legacyAnchors[row.id]) el.id = legacyAnchors[row.id]!;
    const h = document.createElement('h3');
    const a = document.createElement('a');
    a.href =
      link(feature === 'posts' ? 'post' : 'media', row.id) +
      (mode === 'editor' || mode === 'admin' ? '&view=working' : '');
    a.textContent = String(row.payload.title);
    h.append(a);
    const meta = document.createElement('p');
    meta.textContent = `${row.status} · r${row.revision} · ${String(row.payload.category)} · ${(row.payload.tags as string[]).join(', ')}`;
    if (homeFeed) meta.textContent = `${new Date(row.created_at).toLocaleDateString(vi ? 'vi-VN' : 'en-US')} · ${(row.payload.tags as string[]).join(', ')}`;
    if(homeFeed){
      const header=document.createElement('header');header.className='post-card-header';
      const avatar=document.createElement('img');avatar.src=document.querySelector<HTMLImageElement>('[data-profile-avatar]')?.src??`${base}resume/SuDuyHien_Profile.png`;avatar.alt='';avatar.width=avatar.height=44;avatar.setAttribute('data-shared-avatar','');
      const identity=document.createElement('div'),name=document.createElement('strong');name.textContent=homeAuthorName;
      const time=document.createElement('time');time.dateTime=row.created_at;time.textContent=new Date(row.created_at).toLocaleString(vi?'vi-VN':'en-US',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
      const visibility=document.createElement('span');visibility.textContent=row.published_revision?(vi?' · Công khai':' · Public'):(vi?' · Chỉ mình tôi':' · Only me');
      meta.replaceChildren(time,visibility);identity.append(name,meta);header.append(avatar,identity);
      if(runtime.current().user?.role==='owner'&&row.author_id===runtime.current().user?.id)header.append(button(copy('Sửa','Edit'),()=>{window.dispatchEvent(new CustomEvent('home-post-edit',{detail:{id:row.id}}));}));
      el.append(header);el.classList.add('social-post-card');
      if(!row.payload.social)el.append(h);
    }else el.append(h,meta);
    if (row.payload.series) {
      const series = document.createElement('p');
      series.textContent = `${row.payload.series} · #${row.payload.order}`;
      el.append(series);
    }
    if (mode === 'editor')
      el.append(
        button(copy('Sửa bản của tôi', 'Edit mine'), () => populate(row)),
      );
    if (mode === 'admin') {
      const reason = document.createElement('input');
      reason.setAttribute(
        'aria-label',
        copy('Lý do duyệt nội dung', 'Content review reason'),
      );
      reason.maxLength = 500;
      el.append(reason);
      if (row.status === 'pending')
        for (const decision of ['approve', 'reject'])
          el.append(
            button(
              decision === 'approve'
                ? copy('Duyệt', 'Approve')
                : copy('Từ chối', 'Reject'),
              () => {
                if (!writable || !reason.value.trim()) {
                  tell(copy('Cần nhập lý do.', 'Enter a reason.'));
                  return;
                }
                return action(row, 'moderate', decision, reason.value);
              },
            ),
          );
      if (row.published_revision)
        el.append(
          button(copy('Gỡ công khai', 'Unpublish'), () => {
            if (!writable || !reason.value.trim()) return;
            return action(row, 'unpublish', undefined, reason.value);
          }),
        );
      const body = document.createElement('div');
      drawBody(body, row.payload);
      el.append(body);
    }
    if (homeFeed) {
      const body = document.createElement('div'); body.className='post-card-body'; drawBody(body, row.payload); el.append(body);
      interactions.set(row.id, mountPostInteractions(el, row, runtime, {vi, base, expanded: expandedPosts, template: panel.querySelector<HTMLTemplateElement>('[data-post-comments-template]')}));
    }
    list.append(el);
  }
  async function read() {
    const id = new URLSearchParams(location.search).get('id'),
      working = new URLSearchParams(location.search).get('view') === 'working';
    if (!id) {
      tell(copy('Thiếu mã nội dung.', 'Content ID required.'));
      return;
    }
    if (working && !runtime.current().user) {
      tell(
        copy(
          'Đăng nhập để xem bản riêng của mình.',
          'Sign in to view your private draft.',
        ),
      );
      return;
    }
    const tag = generation;
    try {
      const row = await runtime.api.publication(feature, id, working);
      if (tag !== generation) return;
      preview.replaceChildren();
      const h = document.createElement('h1');
      h.textContent = String(row.payload.title);
      preview.append(h);
      const body = document.createElement('div');
      drawBody(body, row.payload);
      preview.append(body);
      tell(
        row.status === 'approved'
          ? copy('Bản đã duyệt.', 'Approved revision.')
          : copy('Bản riêng/chờ duyệt.', 'Private / review revision.'),
      );
      const discussion = panel.querySelector<HTMLElement>(
        '[data-object-discussion]',
      );
      if (discussion) {
        discussionCleanup?.();
        discussion.hidden = false;
        const child = discussion.querySelector<HTMLElement>(
          '[data-api-comments]',
        )!;
        child.dataset.entityId = row.entity_id;
        discussionCleanup = mountComments(child, runtime);
      }
    } catch (error) {
      if (tag === generation) fail(error);
    }
  }
  async function load(append: boolean) {
    if (loading) return;
    loading = true;
    const tag = generation;
    try {
      const filterId = mode === 'list' && !homeFeed ? panel.dataset.filterCategory ?? new URLSearchParams(location.search).get('category') : null;
      let filter = filterId ? categoryCatalogue(runtime).items().find(c => c.id === filterId && c.scope === feature) : undefined;
      if (filterId && !filter) {
        await categoryCatalogue(runtime).refresh();
        if (tag !== generation) return;
        filter = categoryCatalogue(runtime).items().find(c => c.id === filterId && c.scope === feature);
        if (!filter) { tell(copy('Không tìm thấy danh mục này.','Category not found.')); return; }
      }
      const view =
        mode === 'admin'
          ? (panel.querySelector<HTMLSelectElement>('[data-view]')?.value ??
            'pending')
          : mode === 'editor'
            ? 'mine'
            : homeFeed&&runtime.current().user?.role==='owner'?'mine':'public';
      const page = await runtime.api.publications(
        feature,
        view,
        append ? cursor : null,
      );
      if (tag !== generation) return;
      if (!append) { clearMedia();list.replaceChildren(); }
      page.items.filter(row => !filter || matchesCategory(row.payload,filter)).forEach(card);
      if (homeFeed) {
        loadReactions(page.items.filter(row => row.published_revision && interactions.has(row.id)).map(row => row.id));
      }
      const oldId = Object.entries(legacyAnchors).find(
        ([, anchor]) => '#' + anchor === location.hash,
      )?.[0];
      if (
        !append &&
        oldId &&
        !list.querySelector(`[data-publication-id="${oldId}"]`)
      ) {
        const legacy = await runtime.api.publication('posts', oldId);
        if (tag !== generation) return;
        card(legacy);
      }
      if (oldId)
        document
          .getElementById(legacyAnchors[oldId]!)
          ?.scrollIntoView({ block: 'start' });
      cursor = page.nextCursor;
      more.hidden = !cursor;
      if (filter) { tell(list.childElementCount ? displayFilter(filter.label) : copy(cursor ? 'Chưa có nội dung phù hợp ở trang này. Chọn Xem thêm.' : 'Chưa có nội dung trong danh mục này.',cursor ? 'No matches on this page. Select More.' : 'No content in this category yet.')); return; }
      tell(homeFeed && !list.childElementCount ? copy(cursor ? 'Chưa có bài của Hiển trong trang này; chọn Xem thêm.' : 'Chưa có bài đăng của Hiển.', cursor ? 'No posts by Hien on this page; select More.' : 'No posts by Hien yet.') : homeFeed ? '' : copy('Đã tải nội dung.', 'Content loaded.'));
    } catch (error) {
      if (tag === generation) fail(error);
    } finally {
      if (tag === generation) loading = false;
    }
  }
  function displayFilter(label: string) { return copy('Danh mục: ','Category: ') + label; }
  async function reload() {
    generation++;
    loading = false;
    clearMedia();
    list.replaceChildren();
    preview.replaceChildren();
    more.hidden = true;
    discussionCleanup?.();
    discussionCleanup = null;
    const d = panel.querySelector<HTMLElement>('[data-object-discussion]');
    if (d) d.hidden = true;
    const tag = generation;
    try {
      const state = await runtime.api.featureState(feature);
      if (tag !== generation) return;
      writable =
        state.source === 'api' &&
        state.epoch === Number(panel.dataset.epoch) &&
        state.writes_enabled;
      if (
        state.source !== 'api' ||
        state.epoch !== Number(panel.dataset.epoch)
      ) {
        tell(copy('Nội dung đang bảo trì.', 'Content is in maintenance.'));
        return;
      }
      if (ownerOnly && runtime.current().user?.role !== 'owner') return;
      if (mode === 'reader') {
        await read();
        return;
      }
      if ((mode === 'editor' || mode === 'admin') && !runtime.current().user) {
        tell(copy('Đăng nhập để tiếp tục.', 'Sign in to continue.'));
        return;
      }
      if (mode === 'admin' && runtime.current().user?.role !== 'owner') {
        tell(copy('Chỉ chủ nhà được duyệt.', 'Owner access required.'));
        return;
      }
      await load(false);
    } catch (error) {
      if (tag === generation) fail(error);
    }
  }
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (timer) clearTimeout(timer);
    void save().catch(() => {});
  });
  form?.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    try {
      drawBody(preview, featurePayload(feature, payload()));
    } catch {}
    timer = setTimeout(() => void save().catch(() => {}), 1800);
  });
  panel
    .querySelector('[data-submit-review]')
    ?.addEventListener('click', async () => {
      if (timer) clearTimeout(timer);
      try {
        await save();
        if (
          current &&
          !conflicted &&
          JSON.stringify(featurePayload(feature, payload())) === lastSaved
        )
          await action(current, 'submit');
      } catch (error) {
        fail(error);
      }
    });
  const publishKeys = new Map<string, string>();
  const publishKey = (row: Publication, action: string) => {
    const signature = `${runtime.current().user?.id}:${row.id}:${row.version}:${action}`;
    if (!publishKeys.has(signature)) publishKeys.set(signature, crypto.randomUUID());
    return publishKeys.get(signature)!;
  };
  panel.querySelector('[data-publish-home]')?.addEventListener('click', async () => {
    if (!ownerOnly || runtime.current().user?.role !== 'owner' || !writable || !form || form.inert) return;
    if (timer) clearTimeout(timer);
    const actor = runtime.current().user!.id;
    const tag = generation;
    const valid = () => tag === generation && runtime.current().user?.id === actor && runtime.current().user?.role === 'owner';
    form.inert = true;
    form.setAttribute('aria-busy', 'true');
    try {
      await save();
      if (!valid() || !current || conflicted || JSON.stringify(featurePayload(feature, payload())) !== lastSaved) return;
      let row: Publication = current;
      if (row.status === 'approved') { tell(copy('Bài đã được đăng.', 'Post is already published.')); return; }
      if (row.status !== 'pending') {
        row = await runtime.api.publicationAction(feature, row.id, 'submit', { expectedVersion: row.version }, publishKey(row, 'submit'));
        if (!valid()) return;
        current = row;
      }
      row = await runtime.api.publicationAction(feature, row.id, 'moderate', {
        expectedVersion: row.version, revision: row.revision, decision: 'approve', reason: 'Owner published from Home',
      }, publishKey(row, 'approve'));
      if (!valid()) return;
      current = row;
      window.dispatchEvent(new Event('home-publication-published'));
      await reload();
      tell(copy('Đã đăng bài công khai.', 'Post published.'));
    } catch (error) { if (valid()) fail(error); }
    finally { form.inert = false; form.removeAttribute('aria-busy'); }
  });
  const refreshHome = () => { if (homeFeed) void reload(); };
  window.addEventListener('home-publication-published', refreshHome);
  panel
    .querySelector('[data-delete-publication]')
    ?.addEventListener('click', () => {
      if (current) void action(current, 'delete');
    });
  panel
    .querySelector('[data-new]')
    ?.addEventListener('click', () => populate(null));
  select?.addEventListener('change', () => {
    if (timer) clearTimeout(timer);
    feature = select.value as 'posts' | 'media';
    populate(null);
    void reload();
  });
  if (form?.elements.namedItem('mediaFolder')) {
    input('mediaCategory').addEventListener('change', () => {
      input('mediaFolder').value = defaultCategories.find(c => c.scope === 'media' && c.id === input('mediaCategory').value)!.label;
    }, {signal:composerEvents.signal});
  }
  panel
    .querySelector('[data-view]')
    ?.addEventListener('change', () => void reload());
  panel
    .querySelector('[data-feature-refresh]')!
    .addEventListener('click', () => void reload());
  more.addEventListener('click', () => void load(true));
  panel
    .querySelector('[data-history-more]')
    ?.addEventListener('click', () => void history(true));
  thought?.addEventListener('focus', () => {
    if (runtime.current().user?.role !== 'owner') return;
    panel.dataset.composerExpanded = 'true';
    panel.hidden = false;
  }, { signal: composerEvents.signal });
  thought?.addEventListener('input', () => {
    if (runtime.current().user?.role !== 'owner' || !form) return;
    input('body').value = thought.value;
    form.dispatchEvent(new Event('input', { bubbles: true }));
  }, { signal: composerEvents.signal });
  form?.addEventListener('input', () => {
    if (thought) thought.value = input('body').value;
  }, { signal: composerEvents.signal });
  let identity: string | null | undefined;
  const unsubscribe = runtime.subscribe(({ user }) => {
    if (thought) { thought.disabled = user?.role !== 'owner'; if (user?.role !== 'owner') { thought.value = ''; delete panel.dataset.composerExpanded; } }
    if (note) note.hidden = user?.role === 'owner';
    if (ownerOnly) panel.hidden = user?.role !== 'owner' || (panel.dataset.compactComposer === 'true' && panel.dataset.composerExpanded !== 'true');
    if (form) form.hidden = !user || (ownerOnly && user.role !== 'owner');
    const id = user ? `${user.id}:${user.role}` : null;
    if (id !== identity) {
      const previous = identity;
      identity = id;
      // Public feed stays mounted for guest/member changes: retain reply targets and drafts.
      // Owner transitions still reload to add/remove private posts.
      if (homeFeed && previous !== undefined && !previous?.endsWith(':owner') && user?.role !== 'owner' && interactions.size && !loading) {
        generation++;
        interactions.forEach(view => view.resetSelection());
        loadReactions([...interactions.keys()]);
        return;
      }
      generation++;
      if (timer) clearTimeout(timer);
      current = null;
      lastSaved = '';
      if (form) populate(null);
      void reload();
    }
  });
  return () => {
    generation++;
    if (timer) clearTimeout(timer);
    window.removeEventListener('home-publication-published', refreshHome);
    composerEvents.abort();
    unsubscribe();
    discussionCleanup?.();
    clearMedia();
    list.replaceChildren();
    preview.replaceChildren();
  };
}
