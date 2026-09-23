/**
 * **UN `IDBFactory` MINIMAL, POUR LES DEUX CÔTÉS D'UN MÊME JUMEAU** (#7368, W4).
 *
 * `bun test` (happy-dom) n'implémente PAS IndexedDB (`typeof indexedDB ===
 * 'undefined'`, mesuré) : ni la page ni le service worker ne peuvent être
 * témoignés contre la vraie API. Ce double porte le sous-ensemble que
 * `delivery-receipt-credential.ts` (côté page) et `public/sw-push.js` (côté
 * worker, jumeau gardé de ses trois littéraux) utilisent l'un et l'autre —
 * `open`, `onupgradeneeded`, une transaction, `put`/`get` — rien de plus.
 *
 * **Une seule instance servie aux deux témoins prouve l'ABSENCE de dérive** :
 * écrire avec le module TS puis lire avec la logique brute copiée du worker,
 * sur le MÊME magasin, est le seul témoin qui aurait rougi si les trois noms
 * (base, magasin, clé) avaient divergé entre les deux fichiers.
 */

type Listener = ((event: { readonly target: unknown }) => void) | null;

class FakeIDBRequest {
  result: unknown;
  error: unknown = null;
  onsuccess: Listener = null;
  onerror: Listener = null;

  succeed(result: unknown): void {
    this.result = result;
    queueMicrotask(() => this.onsuccess?.({ target: this }));
  }

  fail(error: unknown): void {
    this.error = error;
    queueMicrotask(() => this.onerror?.({ target: this }));
  }
}

class FakeIDBOpenRequest extends FakeIDBRequest {
  onupgradeneeded: Listener = null;
}

class FakeObjectStore {
  constructor(private readonly rows: Map<string, unknown>) {}

  put(value: unknown, key: string): FakeIDBRequest {
    const request = new FakeIDBRequest();
    this.rows.set(key, value);
    request.succeed(key);
    return request;
  }

  get(key: string): FakeIDBRequest {
    const request = new FakeIDBRequest();
    request.succeed(this.rows.get(key));
    return request;
  }
}

class FakeTransaction {
  onerror: Listener = null;

  constructor(private readonly stores: Map<string, Map<string, unknown>>) {}

  set oncomplete(listener: (() => void) | null) {
    if (listener !== null) queueMicrotask(listener);
  }

  objectStore(name: string): FakeObjectStore {
    const rows = this.stores.get(name);
    if (rows === undefined) throw new Error(`aucun magasin « ${name} »`);
    return new FakeObjectStore(rows);
  }
}

class FakeDatabase {
  readonly stores = new Map<string, Map<string, unknown>>();
  readonly objectStoreNames = { contains: (name: string): boolean => this.stores.has(name) };

  createObjectStore(name: string): void {
    this.stores.set(name, new Map());
  }

  transaction(name: string): FakeTransaction {
    if (!this.stores.has(name)) throw new Error(`aucun magasin « ${name} »`);
    return new FakeTransaction(this.stores);
  }

  close(): void {
    /* Rien à libérer — le double garde la base tant que le test la référence. */
  }
}

/** Un `IDBFactory` de test : une base par nom, persistante pour la durée du témoin. */
export type FakeIndexedDB = {
  open(name: string, version?: number): FakeIDBOpenRequest;
  /** Écrit directement, hors du protocole asynchrone — pour PRÉ-SEMER un
   * témoin sans dépendre du module qu'on teste par ailleurs. */
  seed(name: string, store: string, key: string, value: unknown): void;
};

export function createFakeIndexedDB(): FakeIndexedDB {
  const databases = new Map<string, FakeDatabase>();

  const databaseOf = (name: string): FakeDatabase => {
    const existing = databases.get(name);
    if (existing !== undefined) return existing;
    const created = new FakeDatabase();
    databases.set(name, created);
    return created;
  };

  return {
    open(name, _version) {
      const request = new FakeIDBOpenRequest();
      const isNew = !databases.has(name);
      const db = databaseOf(name);
      request.result = db;
      queueMicrotask(() => {
        if (isNew) request.onupgradeneeded?.({ target: request });
        request.succeed(db);
      });
      return request;
    },
    seed(name, store, key, value) {
      const db = databaseOf(name);
      if (!db.stores.has(store)) db.createObjectStore(store);
      db.stores.get(store)?.set(key, value);
    },
  };
}
