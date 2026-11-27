import type { BackendRuntime, LoginProvider } from '../../lib/auth/runtime';

export type SocialRuntime = Pick<BackendRuntime, 'api' | 'current' | 'subscribe'> &
  Partial<Pick<BackendRuntime, 'ensureSocialIdentity' | 'signIn' | 'signOut'>>;
const pending = new WeakMap<object, Promise<void>>();

/** First interaction prompts only after commit; explicit edits reuse the same dialog. */
export function identifyGuest(runtime: SocialRuntime, vi: boolean, base: string, signal: AbortSignal, edit = false): Promise<void> {
  const auth = runtime.current();
  if (!auth.user || (!auth.user.guest && !edit) || signal.aborted || (edit && (auth.busy || auth.socialBusy))) return Promise.resolve();
  const existing = pending.get(runtime);
  if (existing) return existing;
  const task = show().finally(() => pending.delete(runtime));
  pending.set(runtime, task);
  return task;

  async function show() {
    const actor = runtime.current().user!.id, guest = !!runtime.current().user?.guest;
    const identity = guest ? await runtime.api.guestIdentity() : { display_name: '', chosen: true };
    if ((identity.chosen && !edit) || signal.aborted || runtime.current().user?.id !== actor) return;
    const template = document.querySelector<HTMLTemplateElement>('[data-guest-identity-template]');
    if (!template) throw Error('Identity template unavailable');
    await new Promise<void>((resolve) => {
      const dialog = template.content.firstElementChild!.cloneNode(true) as HTMLDialogElement;
      const q = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
      const name = q<HTMLInputElement>('input'), label = q<HTMLLabelElement>('label');
      const status = q<HTMLParagraphElement>('[role="status"]');
      const ok = q<HTMLButtonElement>('[data-identity-ok]'), cancel = q<HTMLButtonElement>('[data-identity-cancel]'), reset = q<HTMLButtonElement>('[data-identity-reset]');
      const providers = [...dialog.querySelectorAll<HTMLButtonElement>('[data-provider]')];
      const feedback = (code: string) => { status.textContent = dialog.dataset[code] ?? ''; };
      if (edit) { q('h2').textContent = dialog.dataset.editTitle!; name.value = identity.display_name; }
      label.hidden = ok.hidden = !guest;
      q('[data-guest-note]').hidden = !edit || !guest;
      q('[data-account-note]').hidden = !edit || guest;
      reset.hidden = !edit || !runtime.signOut;
      let available: Record<LoginProvider, boolean> | null = null, saving = false, closed = false, unsubscribe = () => {};
      const locked = () => saving || runtime.current().busy || !!runtime.current().socialBusy;
      function close() {
        if (closed) return;
        closed = true; unsubscribe(); signal.removeEventListener('abort', close);
        dialog.close(); dialog.remove(); resolve();
      }
      function update() {
        const current = runtime.current();
        if (current.user?.id !== actor || (!edit && !current.user.guest)) { close(); return; }
        ok.disabled = cancel.disabled = reset.disabled = locked();
        providers.forEach(b => { b.disabled = locked() || !available?.[b.dataset.provider as LoginProvider]; });
        if (current.error) feedback('failed');
      }
      async function choose(value: string | null) {
        if (locked()) return;
        if (value !== null && !value.trim()) { feedback('invalid'); name.focus(); return; }
        saving = true; update();
        try {
          await runtime.api.guestIdentity(value, true);
          if (edit) window.dispatchEvent(new Event('hiens:identity'));
          close();
        } catch { feedback('retry'); }
        finally { saving = false; update(); }
      }
      providers.forEach(b => b.addEventListener('click', () => {
        const provider = b.dataset.provider as LoginProvider;
        if (!locked() && available?.[provider]) void runtime.signIn?.(`${base}${vi ? '' : 'en/'}account/callback/`, provider);
      }));
      reset.addEventListener('click', async () => {
        if (locked()) return;
        saving = true; update();
        try { await runtime.signOut?.(); if (!runtime.current().user) close(); }
        catch { feedback('retry'); }
        finally { saving = false; update(); }
      });
      ok.addEventListener('click', () => void choose(name.value));
      const cancelChoice = () => { if (edit) close(); else void choose(null); };
      cancel.addEventListener('click', cancelChoice);
      dialog.addEventListener('cancel', e => { e.preventDefault(); if (!locked()) cancelChoice(); });
      name.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); void choose(name.value); } });
      signal.addEventListener('abort', close, {once:true});
      document.body.append(dialog); dialog.showModal(); if (guest) name.focus();
      unsubscribe = runtime.subscribe(update); if (closed) unsubscribe();
      void runtime.api.authProviders().then(value => {
        if (closed) return;
        available = value;
        providers.forEach(b => { if (!value[b.dataset.provider as LoginProvider]) b.textContent += dialog.dataset.unavailable; });
        update();
      }).catch(() => { if (!closed) feedback('offline'); });
    });
  }
}
