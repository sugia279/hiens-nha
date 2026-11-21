/** Legacy v1 migration window. New v2 sessions have no app-imposed deadline (ADR0016). */
export const DEVICE_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export function deviceStorage(key: string, persistent: Storage | null, now = Date.now) {
  const memory = new Map<string, string>();
  let available = !!persistent;
  let deadline: number | null = null;
  let blocked=false;
  let seenSession = false;
  const remove = () => { blocked=true; memory.delete(key); deadline = null; try { persistent?.removeItem(key); } catch { available = false; } };
  function read() {
    let raw: string | null = null;
    try { raw = available ? persistent!.getItem(key) : memory.get(key) ?? null; } catch { available = false; raw = memory.get(key) ?? null; }
    if (!raw) { if(seenSession){blocked=true;deadline=null;}return null; }
    try {
      const record = JSON.parse(raw);
      if (typeof record.value !== 'string' || ![1,2].includes(record.version)) throw Error();
      if (record.version === 1 && (!Number.isFinite(record.expiresAt) || record.expiresAt <= now() || record.expiresAt > now() + DEVICE_SESSION_MS)) throw Error();
      const session = JSON.parse(record.value);
      if (!session || typeof session !== 'object' || Array.isArray(session)) throw Error();
      delete session.provider_token; delete session.provider_refresh_token;
      deadline = null;
      seenSession = true;
      blocked = false;
      if (record.version === 1) {
        const migrated = JSON.stringify({version:2,value:JSON.stringify(session)});
        memory.set(key, migrated);
        try { if (available) persistent!.setItem(key, migrated); } catch { available = false; }
      }
      return JSON.stringify(session);
    } catch { remove(); return null; }
  }
  return {
    key, clear: remove, beginLogin(){remove();blocked=false;seenSession=false;},
    get persistent() { return available; },
    expiresAt() { read(); return deadline; },
    getItem(name: string) { return name === key ? read() : memory.get(name) ?? null; },
    setItem(name: string, value: string) {
      // PKCE verifiers and provider tokens are deliberately not written to disk.
      if (name !== key) { memory.set(name, value); return; }
      const session = JSON.parse(value);
      delete session.provider_token; delete session.provider_refresh_token;
      read();
      if(blocked)return;
      const record = JSON.stringify({version:2,value:JSON.stringify(session)});
      memory.set(key, record);
      try { if (available) persistent!.setItem(key, record); } catch { available = false; }
    },
    removeItem(name: string) { if (name === key) remove(); else memory.delete(name); },
  };
}
