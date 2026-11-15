/**
 * Le cache en mémoire des témoins de la batterie (#14147) : `get`, `set` avec durée de vie,
 * `del`, `setnx` atomique et `keys` à motif — ce que `CacheStore` offre en production.
 */
export function batteryCacheInMemory() {
  const entries = new Map<string, { value: string; ttl?: number }>();
  const pattern = (glob: string) => new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
  return {
    entries,
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
    keys: (glob: string) => Promise.resolve([...entries.keys()].filter((key) => pattern(glob).test(key))),
  };
}
