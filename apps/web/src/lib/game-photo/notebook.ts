import type { PhotoEmblem, PhotoMoment } from './moments';

/**
 * LE CARNET DE PROGRESSION (#9382) — conception, partie VI : « le carnet de
 * progression garde ces photos et montre le chemin parcouru ». Il vit sur
 * l'appareil, en IndexedDB : « la photo reste sur l'appareil tant qu'on ne la
 * partage pas » — la synchronisation avec le compte, privée et facultative,
 * relève d'une issue à part.
 *
 * Une entrée par MOMENT (son identité, `moments.ts`) : garder une photo prend
 * la place de l'attente du même moment, une reprise de la photo remplace la
 * précédente. « Plus tard » laisse le moment en attente SEPT JOURS ; passé ce
 * délai la lecture le purge. Une photo GARDÉE ne s'efface jamais toute seule.
 *
 * Chaque accès au stockage est sous `try/catch` : un stockage refusé (mode
 * privé, quota, base verrouillée) se lit « carnet vide » à la lecture et « non
 * gardé » à l'écriture — jamais une exception qui remonterait jusqu'à l'écran.
 * La réponse booléenne est ce que l'écran affiche (« Garder » a réussi, ou la
 * photo n'est que partagée).
 */

export type NotebookMode = 'selfie' | 'card' | 'gallery';

export type NotebookEntry = {
  /** L'identité du moment : une entrée par moment. */
  readonly id: string;
  readonly momentId: string;
  readonly emblem: PhotoEmblem;
  readonly kicker: string;
  readonly title: string;
  readonly status: 'pending' | 'kept';
  readonly createdAt: string;
  /** Seule une entrée en attente expire. */
  readonly expiresAt: string | null;
  readonly mode?: NotebookMode;
  readonly story?: Blob;
  readonly square?: Blob;
};

export type NotebookBackend = {
  readonly put: (entry: NotebookEntry) => Promise<void>;
  readonly get: (id: string) => Promise<NotebookEntry | undefined>;
  readonly all: () => Promise<readonly NotebookEntry[]>;
  readonly remove: (id: string) => Promise<void>;
};

const PENDING_DAYS = 7;
const DAY_MS = 86_400_000;

export type KeptPhoto = { readonly story: Blob; readonly square: Blob; readonly mode: NotebookMode };

export type Notebook = {
  readonly defer: (moment: PhotoMoment) => Promise<boolean>;
  readonly keep: (moment: PhotoMoment, photo: KeptPhoto) => Promise<boolean>;
  readonly list: () => Promise<readonly NotebookEntry[]>;
  readonly remove: (id: string) => Promise<boolean>;
};

const expired = (entry: NotebookEntry, now: Date): boolean =>
  entry.status === 'pending' && entry.expiresAt !== null && Date.parse(entry.expiresAt) <= now.getTime();

export function createNotebook(params: { readonly backend: NotebookBackend | null; readonly now: () => Date }): Notebook {
  const { backend, now } = params;

  const attempt = async (work: (store: NotebookBackend) => Promise<void>): Promise<boolean> => {
    if (backend === null) return false;
    try {
      await work(backend);
      return true;
    } catch {
      return false;
    }
  };

  return {
    defer: (moment) =>
      attempt(async (store) => {
        if ((await store.get(moment.id)) !== undefined) return;
        const created = now();
        await store.put({
          id: moment.id,
          momentId: moment.id,
          emblem: moment.emblem,
          kicker: moment.kicker,
          title: moment.title,
          status: 'pending',
          createdAt: created.toISOString(),
          expiresAt: new Date(created.getTime() + PENDING_DAYS * DAY_MS).toISOString(),
        });
      }),

    keep: (moment, photo) =>
      attempt((store) =>
        store.put({
          id: moment.id,
          momentId: moment.id,
          emblem: moment.emblem,
          kicker: moment.kicker,
          title: moment.title,
          status: 'kept',
          createdAt: now().toISOString(),
          expiresAt: null,
          mode: photo.mode,
          story: photo.story,
          square: photo.square,
        }),
      ),

    list: async () => {
      if (backend === null) return [];
      try {
        const current = now();
        const entries = await backend.all();
        const stale = entries.filter((entry) => expired(entry, current));
        await Promise.all(stale.map((entry) => backend.remove(entry.id).catch(() => undefined)));
        return entries
          .filter((entry) => !expired(entry, current))
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
      } catch {
        return [];
      }
    },

    remove: (id) => attempt((store) => store.remove(id)),
  };
}

const DB_NAME = 'meeshy-game-notebook';
const STORE = 'entries';

const settle = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB'));
  });

/** Le carnet sur IndexedDB ; `null` quand la base ne s'ouvre pas (absente, refusée, mode privé). */
export async function openIndexedDbBackend(factory: IDBFactory | undefined): Promise<NotebookBackend | null> {
  if (factory === undefined) return null;
  try {
    const request = factory.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    const db = await settle(request);
    const store = (mode: IDBTransactionMode): IDBObjectStore => db.transaction(STORE, mode).objectStore(STORE);
    return {
      put: async (entry) => void (await settle(store('readwrite').put(entry))),
      get: async (id) => (await settle(store('readonly').get(id))) as NotebookEntry | undefined,
      all: async () => (await settle(store('readonly').getAll())) as NotebookEntry[],
      remove: async (id) => void (await settle(store('readwrite').delete(id))),
    };
  } catch {
    return null;
  }
}

/**
 * Un carnet dont la base ne s'ouvre qu'AU PREMIER GESTE : l'écran Progression
 * ne paie pas l'ouverture d'IndexedDB tant que personne ne photographie ni ne
 * consulte. Une base qui ne s'ouvre pas fait lever chaque appel, ce que le
 * carnet absorbe (« non gardé », « carnet vide »).
 */
export function lazyBackend(open: () => Promise<NotebookBackend | null>): NotebookBackend {
  let opened: Promise<NotebookBackend | null> | null = null;
  const ready = async (): Promise<NotebookBackend> => {
    opened ??= open();
    const backend = await opened;
    if (backend === null) throw new Error('Carnet indisponible');
    return backend;
  };
  return {
    put: async (entry) => (await ready()).put(entry),
    get: async (id) => (await ready()).get(id),
    all: async () => (await ready()).all(),
    remove: async (id) => (await ready()).remove(id),
  };
}
