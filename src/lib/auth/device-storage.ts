/** A browser convenience window, never an authority or a server session limit. */
export const DEVICE_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export function deviceStorage(key: string, persistent: Storage | null, now = Date.now) {
  const memory = new Map<string, string>();
  let available = !!persistent;
  let deadline: number | null = null;
  let blocked=false;
  const remove = () => { blocked=true; memory.delete(key); deadline = null; try { persistent?.removeItem(key); } catch { available = false; } };
  function read() {
    let raw: string | null = null;
    try { raw = available ? persistent!.getItem(key) : memory.get(key) ?? null; } catch { available = false; raw = memory.get(key) ?? null; }
    if (!raw) { if(deadline!==null){blocked=true;deadline=null;}return null; }
    try {
      const record = JSON.parse(raw);
      if (record.version !== 1 || !Number.isFinite(record.expiresAt) || record.expiresAt <= now() || record.expiresAt > now() + DEVICE_SESSION_MS || typeof record.value !== 'string') throw Error();
      deadline = record.expiresAt;
      return record.value as string;
    } catch { remove(); return null; }
  }
  return {
    key, clear: remove, beginLogin(){remove();blocked=false;},
    get persistent() { return available; },
    expiresAt() { read(); return deadline; },
    getItem(name: string) { return name === key ? read() : memory.get(name) ?? null; },
    setItem(name: string, value: string) {
      // PKCE verifiers and provider tokens are deliberately not written to disk.
      if (name !== key) { memory.set(name, value); return; }
      const session = JSON.parse(value);
      delete session.provider_token; delete session.provider_refresh_token;
      const previous = read();
      if(blocked)return;
      const expiresAt = previous && deadline ? deadline : now() + DEVICE_SESSION_MS;
      const record = JSON.stringify({version:1,expiresAt,value:JSON.stringify(session)});
      deadline = expiresAt; memory.set(key, record);
      try { if (available) persistent!.setItem(key, record); } catch { available = false; }
    },
    removeItem(name: string) { if (name === key) remove(); else memory.delete(name); },
  };
}
