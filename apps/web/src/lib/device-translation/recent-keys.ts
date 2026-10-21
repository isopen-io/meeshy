/**
 * **UNE MÉMOIRE BORNÉE** (#9899) — ce que la session a déjà fait (un partage
 * posté, une demande de lecture envoyée) ou déjà ouvert (une traduction
 * partagée), et qu'elle ne refait pas. La plus ancienne entrée sort la première,
 * et se rafraîchit quand on la rejoue : une session longue ne grossit pas, un
 * fil ouvert cent fois ne coûte pas cent requêtes.
 */
export type RecentMap<V> = {
  readonly get: (key: string) => V | undefined;
  readonly has: (key: string) => boolean;
  readonly set: (key: string, value: V) => void;
  /** Une demande qui n'a pas abouti se retire : elle se refera. */
  readonly delete: (key: string) => void;
};

export function createRecentMap<V>(limit: number): RecentMap<V> {
  const entries = new Map<string, V>();
  return {
    get: (key) => entries.get(key),
    has: (key) => entries.has(key),
    set: (key, value) => {
      entries.delete(key);
      entries.set(key, value);
      if (entries.size <= limit) return;
      const oldest = entries.keys().next();
      if (!oldest.done) entries.delete(oldest.value);
    },
    delete: (key) => void entries.delete(key),
  };
}

export type RecentKeys = {
  readonly has: (key: string) => boolean;
  readonly add: (key: string) => void;
  readonly delete: (key: string) => void;
};

export function createRecentKeys(limit: number): RecentKeys {
  const keys = createRecentMap<true>(limit);
  return { has: keys.has, add: (key) => keys.set(key, true), delete: keys.delete };
}
