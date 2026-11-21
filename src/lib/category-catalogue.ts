import type { BackendRuntime } from './auth/runtime';
import { categoryLabel, categoryIdentity, defaultCategories, findCategory, type CategoryScope, type ContentCategory } from './content-categories';
type Runtime = Pick<BackendRuntime, 'api' | 'current'>;
const catalogues = new WeakMap<Runtime, ReturnType<typeof createCatalogue>>();
function createCatalogue(runtime: Runtime) {
  let items = [...defaultCategories];
  const listeners = new Set<() => void>(), pending = new Map<string, Promise<ContentCategory>>();
  function notify() { listeners.forEach(fn => fn()); }
  return {
    items: () => items,
    subscribe(fn: () => void) { listeners.add(fn); fn(); return () => { listeners.delete(fn); }; },
    async refresh() {
      const rows = await runtime.api.contentCategories();
      if (!Array.isArray(rows) || rows.length > 300 || rows.some(row => !['photos','media','posts'].includes(row.scope) || !/^(?:[a-z]+|cat-[0-9a-f-]{36})$/.test(row.id) || categoryLabel(row.label) !== row.label)) throw new Error('Invalid category catalogue');
      items = [...new Map([...items,...rows].map(row => [row.id,row])).values()];
      notify();
    },
    ensure(scope: CategoryScope, input: string): Promise<ContentCategory> {
      const label = categoryLabel(input), existing = findCategory(items, scope, label);
      if (existing) return Promise.resolve(existing);
      const actor = runtime.current().user?.id;
      if (!actor || runtime.current().busy) return Promise.reject(new Error('Sign in to add a category'));
      const key = `${scope}:${categoryIdentity(label)}`;
      if (!pending.has(key)) pending.set(key, runtime.api.createContentCategory(scope, label).then(row => {
        if (!items.some(item => item.id === row.id)) { items = [...items, row]; notify(); }
        return row;
      }).finally(() => { pending.delete(key); }));
      return pending.get(key)!;
    },
  };
}
export function categoryCatalogue(runtime: Runtime) {
  if (!catalogues.has(runtime)) catalogues.set(runtime, createCatalogue(runtime));
  return catalogues.get(runtime)!;
}
