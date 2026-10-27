export const SEND_QUEUE_DB_NAME = 'meeshy-send-queue';
const SEND_QUEUE_DB_VERSION = 1;
const SEND_QUEUE_STORE = 'jobs';

const withStore = <T,>(factory: IDBFactory, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest | null, read: (request: IDBRequest | null) => T): Promise<T> =>
  new Promise((resolve, reject) => {
    try {
      const open = factory.open(SEND_QUEUE_DB_NAME, SEND_QUEUE_DB_VERSION);
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains(SEND_QUEUE_STORE)) open.result.createObjectStore(SEND_QUEUE_STORE);
      };
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        try {
          const transaction = db.transaction(SEND_QUEUE_STORE, mode);
          const request = work(transaction.objectStore(SEND_QUEUE_STORE));
          transaction.oncomplete = () => {
            db.close();
            resolve(read(request));
          };
          transaction.onerror = () => {
            db.close();
            reject(transaction.error);
          };
          transaction.onabort = () => {
            db.close();
            reject(transaction.error);
          };
        } catch (error) {
          db.close();
          reject(error);
        }
      };
    } catch (error) {
      reject(error);
    }
  });

/**
 * **LES ENREGISTREMENTS DE LA BASE DES ENVOIS** (#13416) — la file y tient sa
 * liste (`all`), le studio ses publications non envoyées : une seule base sur
 * l'appareil pour tout ce qui attend de partir, jamais un troisième magasin.
 * `save(key, undefined)` efface. IndexedDB garde les `File` tels quels.
 */
export type DeviceRecords = {
  readonly load: (key: string) => Promise<unknown>;
  readonly save: (key: string, value: unknown) => Promise<void>;
};

export function memoryDeviceRecords(): DeviceRecords {
  const rows = new Map<string, unknown>();
  return {
    load: async (key) => rows.get(key),
    save: async (key, value) => {
      if (value === undefined) rows.delete(key);
      else rows.set(key, value);
    },
  };
}

/** Indisponible (navigation privée, quota, aucun IndexedDB) ⇒ chaque accès REJETTE, et l'appelant le dit. */
export function idbDeviceRecords(factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB): DeviceRecords {
  if (factory === undefined) {
    const unavailable = () => Promise.reject(new Error('IndexedDB indisponible'));
    return { load: unavailable, save: unavailable };
  }
  return {
    load: (key) => withStore(factory, 'readonly', (store) => store.get(key), (request): unknown => request?.result),
    save: (key, value) =>
      withStore(
        factory,
        'readwrite',
        (store) => (value === undefined ? store.delete(key) : store.put(value, key)),
        () => undefined,
      ),
  };
}
