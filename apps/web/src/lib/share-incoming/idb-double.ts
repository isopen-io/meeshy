/**
 * **UN `IDBFactory` POUR LES DEUX CÔTÉS DE LA BOÎTE DE RÉCEPTION** (#8884).
 *
 * `bun test` (happy-dom) n'implémente pas IndexedDB. `public/sw-share-target.js`
 * (qui écrit) et `web-inbox.ts` (qui lit puis efface) sont des jumeaux : un seul
 * double servi aux deux est le témoin qui rougirait si leurs littéraux
 * (base, magasin, clé) divergeaient. Sous-ensemble strict : `open`,
 * `onupgradeneeded`, une transaction, `put` / `get` / `delete`, `oncomplete`.
 */
type Handler = ((event: { readonly target: unknown }) => void) | null;

class Request {
  result: unknown;
  error: unknown = null;
  onsuccess: Handler = null;
  onerror: Handler = null;
}

class Transaction {
  oncomplete: Handler = null;
  onerror: Handler = null;
  onabort: Handler = null;
  private pending = 0;

  constructor(private readonly rows: Map<string, unknown>) {}

  objectStore(): { put(value: unknown, key: string): Request; get(key: string): Request; delete(key: string): Request } {
    return {
      put: (value, key) => this.run(() => (this.rows.set(key, value), key)),
      get: (key) => this.run(() => this.rows.get(key)),
      delete: (key) => this.run(() => (this.rows.delete(key), undefined)),
    };
  }

  private run(operation: () => unknown): Request {
    const request = new Request();
    this.pending += 1;
    queueMicrotask(() => {
      request.result = operation();
      request.onsuccess?.({ target: request });
      this.pending -= 1;
      if (this.pending === 0) queueMicrotask(() => this.oncomplete?.({ target: this }));
    });
    return request;
  }
}

class Database {
  readonly stores = new Map<string, Map<string, unknown>>();
  readonly objectStoreNames = { contains: (name: string): boolean => this.stores.has(name) };

  createObjectStore(name: string): void {
    this.stores.set(name, new Map());
  }

  transaction(name: string): Transaction {
    const rows = this.stores.get(name);
    if (rows === undefined) throw new Error(`magasin absent : ${name}`);
    return new Transaction(rows);
  }

  close(): void {}
}

class OpenRequest extends Request {
  onupgradeneeded: Handler = null;
}

export type FakeIndexedDb = {
  readonly factory: IDBFactory;
  readonly rowsOf: (database: string, store: string) => ReadonlyMap<string, unknown>;
  readonly failOpen: () => void;
};

export function fakeIndexedDb(): FakeIndexedDb {
  const databases = new Map<string, Database>();
  let failing = false;
  const factory = {
    open(name: string) {
      const request = new OpenRequest();
      queueMicrotask(() => {
        if (failing) {
          request.error = new Error('stockage refusé');
          request.onerror?.({ target: request });
          return;
        }
        const known = databases.get(name);
        const database = known ?? new Database();
        databases.set(name, database);
        request.result = database;
        if (known === undefined) request.onupgradeneeded?.({ target: request });
        request.onsuccess?.({ target: request });
      });
      return request;
    },
  } as unknown as IDBFactory;
  return {
    factory,
    rowsOf: (database, store) => databases.get(database)?.stores.get(store) ?? new Map(),
    failOpen: () => {
      failing = true;
    },
  };
}
