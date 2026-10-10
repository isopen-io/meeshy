/**
 * **LE CACHE DES TRADUCTIONS FAITES SUR L'APPAREIL** (#9898) — il ne quitte
 * jamais l'appareil. La clé porte le message, la langue cible et une
 * empreinte du texte : un message modifié se retraduit, un fil rouvert se
 * peint traduit sans recalcul (cache d'abord, jamais un moteur relancé pour
 * un texte déjà traduit).
 */
export type KeyValueStore = {
  readonly get: (key: string) => Promise<string | undefined>;
  readonly set: (key: string, value: string) => Promise<void>;
};

const fnv1a = (text: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

/** L'empreinte courte d'un texte : sa longueur et son hachage. Deux états d'un message ne la partagent pas, sauf collision — qui ne coûte qu'un recalcul. */
export const textStamp = (text: string): string => `${text.length}.${fnv1a(text)}`;

export const deviceCacheKey = (params: { readonly messageId: string; readonly target: string; readonly text: string }): string =>
  `${params.messageId}|${params.target}|${textStamp(params.text)}`;

export type CachedDeviceTranslation = { readonly text: string; readonly engine: string };

export type DeviceTranslationCache = {
  readonly read: (key: string) => Promise<CachedDeviceTranslation | undefined>;
  readonly write: (key: string, value: CachedDeviceTranslation) => Promise<void>;
};

const MEMORY_LIMIT = 500;

export function createDeviceTranslationCache(params: { readonly store: KeyValueStore }): DeviceTranslationCache {
  const memory = new Map<string, CachedDeviceTranslation>();
  const remember = (key: string, value: CachedDeviceTranslation): void => {
    memory.delete(key);
    memory.set(key, value);
    if (memory.size > MEMORY_LIMIT) memory.delete(memory.keys().next().value as string);
  };

  return {
    read: async (key) => {
      const held = memory.get(key);
      if (held !== undefined) return held;
      try {
        const stored = await params.store.get(key);
        if (stored === undefined) return undefined;
        const parsed = JSON.parse(stored) as Partial<CachedDeviceTranslation>;
        if (typeof parsed.text !== 'string' || typeof parsed.engine !== 'string') return undefined;
        const value = { text: parsed.text, engine: parsed.engine };
        remember(key, value);
        return value;
      } catch {
        return undefined;
      }
    },
    write: async (key, value) => {
      remember(key, value);
      try {
        await params.store.set(key, JSON.stringify(value));
      } catch {
        return;
      }
    },
  };
}

export function createMemoryStore(): KeyValueStore {
  const entries = new Map<string, string>();
  return {
    get: async (key) => entries.get(key),
    set: async (key, value) => void entries.set(key, value),
  };
}

const DB_NAME = 'meeshy-device-translation';
const STORE = 'translations';

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/** IndexedDB, quand le navigateur l'offre ; sinon la mémoire seule (navigation privée). */
export function createIndexedDbStore(factory: IDBFactory | undefined = globalThis.indexedDB): KeyValueStore {
  if (factory === undefined) return createMemoryStore();
  const open = factory.open(DB_NAME, 1);
  open.onupgradeneeded = () => open.result.createObjectStore(STORE);
  const db = request(open);
  return {
    get: async (key) => (await request((await db).transaction(STORE).objectStore(STORE).get(key))) as string | undefined,
    set: async (key, value) => void (await request((await db).transaction(STORE, 'readwrite').objectStore(STORE).put(value, key))),
  };
}
