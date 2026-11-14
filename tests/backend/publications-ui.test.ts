// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderMarkdown } from '../../src/components/content/safe-preview';
import { mountPublications } from '../../src/components/content/publications';
import type { BackendRuntime, AuthSnapshot } from '../../src/lib/auth/runtime';
describe('publication editor contracts', () => {
  it('keeps HTML, MDX and unsafe links inert, preserving poem lines and safe provider-independent text', () => {
    const target = document.createElement('div');
    renderMarkdown(
      target,
      '# Title\nDòng một\nDòng hai\n<img src=x onerror=alert(1)>\n{import("evil")}\n[bad](javascript:alert(1))\n[ok](https://example.test)\n```\n<script>bad()</script>\n```',
      '/hiens-nha/',
    );
    expect(target.querySelector('img,script,iframe')).toBeNull();
    expect(target.textContent).toContain('Dòng mộtDòng hai');
    expect(target.querySelectorAll('a')).toHaveLength(1);
    expect(target.querySelector('a')?.href).toBe('https://example.test/');
    expect(target.querySelector('pre')?.textContent).toContain('<script>');
  });
  it('serial autosave retries reuse the key; logout clears text and invalidates an in-flight response', async () => {
    document.body.innerHTML =
      '<section data-mode="editor" data-feature="posts" data-locale="vi" data-base="/hiens-nha/" data-epoch="1"><p data-feature-status></p><div data-feature-list></div><div data-publication-preview></div><button data-feature-more></button><button data-feature-refresh></button><button data-delete-publication></button><form data-publication-form>' +
      [
        'title',
        'body',
        'kind',
        'category',
        'series',
        'order',
        'url',
        'description',
        'tags',
        'mediaCategory',
      ]
        .map((name) => `<input name="${name}">`)
        .join('') +
      '</form></section>';
    const el = document.querySelector('section')!,
      form = el.querySelector('form')!;
    let snapshot: AuthSnapshot = {
      user: { id: 'a', role: 'member' },
      busy: false,
      error: null,
    };
    let listener: (s: AuthSnapshot) => void = () => {};
    const save = vi.fn().mockRejectedValueOnce(new Error('network'));
    const api = {
      featureState: vi
        .fn()
        .mockResolvedValue({ source: 'api', epoch: 1, writes_enabled: true }),
      publications: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      savePublication: save,
      publicationHistory: vi
        .fn()
        .mockResolvedValue({ items: [], nextCursor: null }),
    };
    const runtime = {
      api,
      current: () => snapshot,
      subscribe(fn: (s: AuthSnapshot) => void) {
        listener = fn;
        fn(snapshot);
        return () => {};
      },
    } as unknown as Pick<BackendRuntime, 'api' | 'current' | 'subscribe'>;
    const stop = mountPublications(el, runtime);
    await vi.waitFor(() => expect(api.publications).toHaveBeenCalled());
    const values = {
      title: 'A valid post',
      body: 'Private draft',
      kind: 'poem',
      category: 'Poetry',
      series: '',
      order: '1',
      tags: 'tag',
    };
    for (const [name, value] of Object.entries(values))
      (form.elements.namedItem(name) as HTMLInputElement).value = value;
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(el.textContent).toContain('được giữ');
    let resolve: (v: unknown) => void = () => {};
    save.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]![2]).toBe(save.mock.calls[0]![2]);
    snapshot = { ...snapshot, user: null };
    listener(snapshot);
    resolve({ id: 'late', version: 1, payload: values });
    await Promise.resolve();
    await Promise.resolve();
    expect((form.elements.namedItem('body') as HTMLInputElement).value).toBe(
      '',
    );
    expect(el.textContent).not.toContain('Private draft');
    stop();
  });
});
