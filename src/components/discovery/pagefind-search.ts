import { onPageMount, type PageScope } from '../../lib/page-lifecycle';
/**
 * Pagefind search browser controller.
 * Loaded only on /search/. Binds Pagefind to SearchForm and SearchResults.
 * Fails gracefully if Pagefind is unavailable.
 *
 * Registry: Browser component, M10.
 * No build-time imports; browser-only execution.
 */

// ---------------------------------------------------------------------------
// Pagefind type declarations (no published @types/pagefind)
// ---------------------------------------------------------------------------

interface PagefindResult {
  id: string;
  data: () => Promise<PagefindResultData>;
}

interface PagefindResultData {
  url: string;
  title?: string;
  excerpt: string;
  meta?: Record<string, string>;
}

interface PagefindAPI {
  init: () => Promise<void>;
  search: (query: string) => Promise<{ results: PagefindResult[] }>;
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

const BASE = import.meta.env.BASE_URL as string;
const isVi = () => document.documentElement.lang === 'vi';
const copy = (english: string, vietnamese: string) => isVi() ? vietnamese : english;

function getStatusEl(): HTMLElement | null {
  return document.getElementById('search-status');
}
function getResultListEl(): HTMLElement | null {
  return document.getElementById('search-result-list');
}

function setStatus(msg: string): void {
  const el = getStatusEl();
  if (el) el.textContent = msg;
}

function clearResults(): void {
  const el = getResultListEl();
  if (el) el.innerHTML = '';
}

function renderResults(results: PagefindResultData[]): void {
  const el = getResultListEl();
  if (!el) return;
  el.innerHTML = '';

  if (results.length === 0) {
    setStatus(copy('No results found.', 'Không tìm thấy kết quả.'));
    return;
  }

  setStatus(isVi() ? `${results.length} kết quả` : `${results.length} result${results.length !== 1 ? 's' : ''}`);
  for (const r of results) {
    const li = document.createElement('li');
    li.className = 'search-results__item';
    const link = document.createElement('a');
    link.href = r.url; link.className = 'search-results__link'; link.textContent = r.meta?.title ?? r.title ?? r.url;
    const excerpt = document.createElement('p');
    excerpt.className = 'search-results__excerpt'; excerpt.textContent = r.excerpt.replace(/<\/?mark>/g, '');
    li.append(link, excerpt);
    el.appendChild(li);
  }
}

function getQueryFromUrl(): string {
  return new URLSearchParams(window.location.search).get('q') ?? '';
}

function pushQueryToUrl(query: string): void {
  const url = new URL(window.location.href);
  if (query) {
    url.searchParams.set('q', query);
  } else {
    url.searchParams.delete('q');
  }
  window.history.pushState(window.history.state, '', url.toString());
}

async function initSearch(page: PageScope): Promise<void> {
  if (!document.getElementById('search-input')) return;
  // Load Pagefind runtime from the built artifact path
  let pagefind: PagefindAPI;
  try {
    pagefind = (await import(/* @vite-ignore */ `${BASE}pagefind/pagefind.js`)) as PagefindAPI;
    await pagefind.init();
  } catch {
    setStatus(copy('Search is temporarily unavailable.', 'Tìm kiếm tạm thời chưa sẵn sàng.'));
    return;
  }

  if (page.signal.aborted) return;
  const input = document.getElementById('search-input') as HTMLInputElement | null;
  const form = input?.closest('form');
  if (!form || !input) return;

  async function runSearch(query: string): Promise<void> {
    const trimmed = query.trim();
    if (!trimmed) {
      setStatus('');
      clearResults();
      return;
    }
    setStatus(copy('Searching…', 'Đang tìm…'));
    try {
      const { results } = await pagefind.search(trimmed);
      const data = await Promise.all(results.slice(0, 30).map((r) => r.data()));
      if (page.signal.aborted) return;
      renderResults(data);
    } catch {
      if (page.signal.aborted) return;
      setStatus(copy('Search failed. Please try again.', 'Tìm kiếm chưa thành công. Bạn thử lại nhé.'));
      clearResults();
    }
  }

  // Run search for URL query on load
  const initialQuery = getQueryFromUrl();
  if (initialQuery) {
    input.value = initialQuery;
    await runSearch(initialQuery);
  }

  // Bind form submit
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = input.value;
    pushQueryToUrl(query);
    void runSearch(query);
  });

  // Bind input for live search
  let debounceTimer: ReturnType<typeof setTimeout>;
  page.cleanup(() => clearTimeout(debounceTimer));
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      void runSearch(input.value);
    }, 250);
  });

  // Handle browser back/forward
  page.listen(window, 'popstate', () => {
    const query = getQueryFromUrl();
    input.value = query;
    void runSearch(query);
  });
}

onPageMount(page => { void initSearch(page); });
