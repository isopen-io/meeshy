/**
 * Le cache en mémoire des témoins de la batterie (#14147) : `get`, `set` avec durée de vie,
 * `del`, `setnx` atomique et un ENSEMBLE (`addMember` / `removeMember` / `members`) — ce que
 * `CacheStore` et son client Redis offrent en production. Jamais `KEYS`.
 */
export function batteryCacheInMemory() {
  const entries = new Map<string, { value: string; ttl?: number }>();
  const sets = new Map<string, Set<string>>();
  return {
    entries,
    sets,
    get: (key: string) => Promise.resolve(entries.get(key)?.value ?? null),
    set: (key: string, value: string, ttl?: number) => {
      entries.set(key, { value, ttl });
      return Promise.resolve();
    },
    del: (key: string) => {
      entries.delete(key);
      return Promise.resolve();
    },
    setnx: (key: string, value: string, ttl?: number) => {
      if (entries.has(key)) return Promise.resolve(false);
      entries.set(key, { value, ttl });
      return Promise.resolve(true);
    },
    addMember: (key: string, member: string) => {
      sets.set(key, new Set([...(sets.get(key) ?? []), member]));
      return Promise.resolve();
    },
    removeMember: (key: string, member: string) => {
      sets.get(key)?.delete(member);
      return Promise.resolve();
    },
    members: (key: string) => Promise.resolve([...(sets.get(key) ?? [])]),
  };
}
