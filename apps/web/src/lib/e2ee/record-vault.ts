/**
 * LES ENREGISTREMENTS SCELLÉS du bout en bout web (#14592), miroir de
 * `E2EERecordVault.swift` : identité, pré-clés, sessions et clairs déchiffrés.
 *
 * Modèle de menace : un tiers qui lit le disque du navigateur (profil copié,
 * extension qui lit IndexedDB) n'y trouve que du chiffré. Chaque ligne est
 * scellée par AES-256-GCM sous une clé WebCrypto NON EXTRACTIBLE gardée dans la
 * même base : le navigateur la conserve opaque, aucune API ne la rend en octets.
 * L'identifiant de la ligne (nature + clé) est la donnée associée : une ligne
 * déplacée vers une autre case ne s'ouvre pas. Hors modèle : un script qui
 * s'exécute dans l'origine (XSS) peut appeler la clé sans la lire, comme il
 * pourrait lire l'écran — c'est la limite de toute clé web, consignée.
 *
 * Concurrence : un ratchet qui bifurque perd des messages. Chaque transaction
 * tient un verrou (Web Locks entre onglets, file en mémoire sinon), relit la
 * base si un autre onglet l'a avancée, et range ses écritures d'un seul tenant.
 */
import type { RecordReader, RecordWrite } from './engine';

export type SealedRow = { readonly id: string; readonly iv: Uint8Array; readonly sealed: Uint8Array };

/** Le support des lignes scellées : IndexedDB en production, la mémoire dans les témoins. */
export interface SealedRecordBackend {
  sealKey(): Promise<CryptoKey>;
  loadAll(): Promise<{ readonly version: number; readonly rows: readonly SealedRow[] }>;
  version(): Promise<number>;
  /** Range les lignes (`sealed: null` efface) et la version d'un seul tenant. */
  commit(rows: readonly { readonly id: string; readonly row: SealedRow | null }[], version: number): Promise<void>;
  erase(): Promise<void>;
}

export type RecordLock = <T>(work: () => Promise<T>) => Promise<T>;

export type RecordTransaction = {
  readonly read: RecordReader;
  /** Les écritures de la transaction se relisent avant leur rangement. */
  readonly stage: (writes: readonly RecordWrite[]) => void;
};

export interface RecordVault {
  read(kind: string, key: string): Promise<Uint8Array | undefined>;
  /** Une transaction : lecture cohérente, écritures rangées ensemble ou pas du tout. */
  transact<T>(work: (transaction: RecordTransaction) => T | Promise<T>): Promise<T>;
  erase(): Promise<void>;
}

const recordId = (kind: string, key: string): string => `${kind}\u0000${key}`;

const encoder = new TextEncoder();

const asBuffer = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer;

async function seal(key: CryptoKey, id: string, value: Uint8Array): Promise<SealedRow> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: asBuffer(iv), additionalData: asBuffer(encoder.encode(id)) },
    key,
    asBuffer(value),
  );
  return { id, iv, sealed: new Uint8Array(sealed) };
}

async function unseal(key: CryptoKey, row: SealedRow): Promise<Uint8Array> {
  const opened = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: asBuffer(row.iv), additionalData: asBuffer(encoder.encode(row.id)) },
    key,
    asBuffer(row.sealed),
  );
  return new Uint8Array(opened);
}

export class RecordVaultCorrupted extends Error {
  constructor() {
    super('e2ee: une ligne scellée ne s\'ouvre pas');
    this.name = 'RecordVaultCorrupted';
  }
}

/** Le verrou par défaut : Web Locks quand le navigateur l'a (entre onglets), une file en mémoire sinon. */
export function defaultRecordLock(name: string): RecordLock {
  let tail: Promise<unknown> = Promise.resolve();
  const local: RecordLock = (work) => {
    const run = tail.then(work, work);
    tail = run.catch(() => undefined);
    return run;
  };
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return local;
  return (work) => local(() => locks.request(name, { mode: 'exclusive' }, work));
}

export function createRecordVault(params: { readonly backend: SealedRecordBackend; readonly lock: RecordLock }): RecordVault {
  const { backend, lock } = params;
  let cache: { version: number; values: Map<string, Uint8Array> } | null = null;

  const fresh = async (): Promise<Map<string, Uint8Array>> => {
    const current = await backend.version();
    if (cache && cache.version === current) return cache.values;
    const key = await backend.sealKey();
    const loaded = await backend.loadAll();
    const entries = await Promise.all(
      loaded.rows.map(async (row) => {
        try {
          return [row.id, await unseal(key, row)] as const;
        } catch {
          throw new RecordVaultCorrupted();
        }
      }),
    );
    cache = { version: loaded.version, values: new Map(entries) };
    return cache.values;
  };

  return {
    read: (kind, key) => lock(async () => (await fresh()).get(recordId(kind, key))),
    transact: (work) =>
      lock(async () => {
        const values = await fresh();
        const staged = new Map<string, Uint8Array | null>();
        const read: RecordReader = (kind, key) => {
          const id = recordId(kind, key);
          if (staged.has(id)) return staged.get(id) ?? undefined;
          return values.get(id);
        };
        const stage = (writes: readonly RecordWrite[]) => writes.forEach((write) => staged.set(recordId(write.kind, write.key), write.value));
        const result = await work({ read, stage });
        if (staged.size === 0) return result;
        const key = await backend.sealKey();
        const rows = await Promise.all(
          [...staged].map(async ([id, value]) => ({ id, row: value === null ? null : await seal(key, id, value) })),
        );
        const version = (cache?.version ?? 0) + 1;
        await backend.commit(rows, version);
        staged.forEach((value, id) => (value === null ? values.delete(id) : values.set(id, value)));
        cache = { version, values };
        return result;
      }),
    erase: () =>
      lock(async () => {
        await backend.erase();
        cache = null;
      }),
  };
}

/** Le support en mémoire (témoins) : même scellement, même atomicité. */
export function memorySealedBackend(): SealedRecordBackend & { readonly rows: Map<string, SealedRow> } {
  const rows = new Map<string, SealedRow>();
  let version = 0;
  let key: Promise<CryptoKey> | null = null;
  return {
    rows,
    sealKey: () => (key ??= crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])),
    loadAll: async () => ({ version, rows: [...rows.values()] }),
    version: async () => version,
    commit: async (changes, next) => {
      changes.forEach(({ id, row }) => (row === null ? rows.delete(id) : rows.set(id, row)));
      version = next;
    },
    erase: async () => {
      rows.clear();
      version = 0;
      key = null;
    },
  };
}

const STORE_ROWS = 'rows';
const STORE_META = 'meta';

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB'));
  });

const done = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB'));
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB abort'));
  });

const isRow = (value: unknown): value is SealedRow =>
  typeof value === 'object' &&
  value !== null &&
  typeof Reflect.get(value, 'id') === 'string' &&
  Reflect.get(value, 'iv') instanceof Uint8Array &&
  Reflect.get(value, 'sealed') instanceof Uint8Array;

/** Le support IndexedDB : une base PAR COMPTE, la clé de scellement non extractible dans la même base. */
export function indexedDbSealedBackend(params: { readonly name: string; readonly factory?: IDBFactory }): SealedRecordBackend {
  const factory = params.factory ?? indexedDB;
  let database: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> =>
    (database ??= new Promise((resolve, reject) => {
      const req = factory.open(params.name, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE_ROWS, { keyPath: 'id' });
        req.result.createObjectStore(STORE_META);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB'));
    }));
  let sealKey: Promise<CryptoKey> | null = null;
  return {
    sealKey: () =>
      (sealKey ??= (async () => {
        const db = await open();
        const existing: unknown = await request(db.transaction(STORE_META).objectStore(STORE_META).get('sealKey'));
        if (existing instanceof CryptoKey) return existing;
        const created = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
        const write = db.transaction(STORE_META, 'readwrite');
        write.objectStore(STORE_META).put(created, 'sealKey');
        await done(write);
        return created;
      })()),
    loadAll: async () => {
      const db = await open();
      const transaction = db.transaction([STORE_ROWS, STORE_META]);
      const [rows, version] = await Promise.all([
        request(transaction.objectStore(STORE_ROWS).getAll()),
        request(transaction.objectStore(STORE_META).get('version')),
      ]);
      return { version: typeof version === 'number' ? version : 0, rows: rows.filter(isRow) };
    },
    version: async () => {
      const db = await open();
      const version: unknown = await request(db.transaction(STORE_META).objectStore(STORE_META).get('version'));
      return typeof version === 'number' ? version : 0;
    },
    commit: async (changes, version) => {
      const db = await open();
      const transaction = db.transaction([STORE_ROWS, STORE_META], 'readwrite');
      const rows = transaction.objectStore(STORE_ROWS);
      changes.forEach(({ id, row }) => (row === null ? rows.delete(id) : rows.put(row)));
      transaction.objectStore(STORE_META).put(version, 'version');
      await done(transaction);
    },
    erase: async () => {
      const db = await open();
      db.close();
      database = null;
      sealKey = null;
      await request(factory.deleteDatabase(params.name));
    },
  };
}

export const e2eeDatabaseName = (userId: string): string => `meeshy-e2ee-${userId}`;
