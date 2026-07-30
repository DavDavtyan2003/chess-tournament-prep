const NAMESPACE = "chess-prep:";

function ns(key) {
  return `${NAMESPACE}${key}`;
}

export const storage = {
  async list(prefix = "") {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const fullKey = localStorage.key(i);
      if (!fullKey || !fullKey.startsWith(NAMESPACE)) continue;
      const key = fullKey.slice(NAMESPACE.length);
      if (key.startsWith(prefix)) keys.push(key);
    }
    return { keys };
  },

  async get(key) {
    const value = localStorage.getItem(ns(key));
    return value === null ? null : { value };
  },

  async set(key, value) {
    localStorage.setItem(ns(key), value);
    return { ok: true };
  },

  async delete(key) {
    localStorage.removeItem(ns(key));
    return { ok: true };
  },
};
