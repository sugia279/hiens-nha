/** ADR0016 verified sessions; ADR0019 guest sessions last only in this tab. */
export const DEVICE_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
export function deviceStorage(
  key: string,
  persistent: Storage | null,
  now = Date.now,
  tab: Storage | null = null,
) {
  const memory = new Map<string, string>();
  let localAvailable = !!persistent,
    tabAvailable = !!tab,
    blocked = false,
    seen = false,
    memoryOnly = false;
  const remove = () => {
    blocked = true;
    memory.delete(key);
    try {
      persistent?.removeItem(key);
    } catch {
      localAvailable = false;
    }
    try {
      tab?.removeItem(key);
    } catch {
      tabAvailable = false;
    }
  };
  function store(value: string, guest: boolean) {
    memory.set(key, value);
    memoryOnly = guest ? !tabAvailable : !localAvailable;
    try {
      if (guest) {
        persistent?.removeItem(key);
        if (tabAvailable) tab!.setItem(key, value);
      } else {
        tab?.removeItem(key);
        if (localAvailable) persistent!.setItem(key, value);
      }
    } catch {
      memoryOnly = true;
      if (guest) tabAvailable = false;
      else localAvailable = false;
    }
  }
  function read() {
    let raw: string | null = null;
    try {
      if (localAvailable) raw = persistent!.getItem(key);
    } catch {
      localAvailable = false;
      memoryOnly = true;
    }
    try {
      if (!raw && tabAvailable) raw = tab!.getItem(key);
    } catch {
      tabAvailable = false;
      memoryOnly = true;
    }
    if (!raw && memoryOnly) raw = memory.get(key) ?? null;
    if (!raw) {
      if (seen) blocked = true;
      return null;
    }
    try {
      const record = JSON.parse(raw);
      if (typeof record.value !== 'string' || ![1, 2].includes(record.version))
        throw Error();
      if (
        record.version === 1 &&
        (!Number.isFinite(record.expiresAt) ||
          record.expiresAt <= now() ||
          record.expiresAt > now() + DEVICE_SESSION_MS)
      )
        throw Error();
      const session = JSON.parse(record.value);
      if (!session || typeof session !== 'object' || Array.isArray(session))
        throw Error();
      delete session.provider_token;
      delete session.provider_refresh_token;
      seen = true;
      blocked = false;
      const value = JSON.stringify(session);
      if (record.version === 1)
        store(
          JSON.stringify({ version: 2, value }),
          session.user?.is_anonymous === true,
        );
      return value;
    } catch {
      remove();
      return null;
    }
  }
  return {
    key,
    clear: remove,
    beginLogin() {
      remove();
      blocked = false;
      seen = false;
      memoryOnly = false;
    },
    get persistent() {
      return localAvailable;
    },
    expiresAt() {
      read();
      return null;
    },
    getItem(name: string) {
      return name === key ? read() : (memory.get(name) ?? null);
    },
    setItem(name: string, value: string) {
      if (name !== key) {
        memory.set(name, value);
        return;
      }
      const session = JSON.parse(value);
      delete session.provider_token;
      delete session.provider_refresh_token;
      read();
      if (blocked) return;
      store(
        JSON.stringify({ version: 2, value: JSON.stringify(session) }),
        session.user?.is_anonymous === true,
      );
    },
    removeItem(name: string) {
      if (name === key) remove();
      else memory.delete(name);
    },
  };
}
