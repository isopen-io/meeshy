import type { SendPayload, SendPlanEntry } from './send-sheet-plan';
import { createSendRun, pendingKeysOf, type SendRun, type SendRunSnapshot, type SendSheetPorts } from './send-sheet-run';

/**
 * LA FILE D'ENVOI DURABLE (#10948, planche « partage unique », V6) — un envoi
 * lancé depuis l'écran de partage ne vit PAS dans la feuille : il vit ici.
 *
 * - **La feuille peut se fermer pendant l'envoi** : la file continue.
 * - **Hors ligne, rien n'est refusé** : la cible passe « En file » et part au
 *   retour du réseau, dans l'ordre d'arrivée des envois (FIFO).
 * - **Fermer l'application ne perd rien** : chaque progrès écrit l'envoi —
 *   son plan, son contenu (les fichiers compris, qu'IndexedDB sait garder) et
 *   l'instantané du moteur — et le lancement suivant le reprend où il
 *   s'était arrêté, sous les MÊMES identifiants de message (la passerelle
 *   dédoublonne ce dont l'accusé s'était perdu).
 *
 * Un envoi dont chaque cible est partie ou a été refusée pour de bon quitte le
 * stockage ; il reste en mémoire le temps que la feuille et le toast le lisent.
 * Le stockage est un PORT : IndexedDB en vrai (`idbSendQueueStorage`), la
 * mémoire si l'appareil le refuse (fenêtre privée) — jamais une erreur.
 */

export type StoredSendJob = {
  readonly id: string;
  readonly createdAt: number;
  readonly entries: readonly SendPlanEntry[];
  readonly payload: SendPayload;
  readonly language: string;
  /** Le nom de chaque cible, pour dire « Envoyé à Ana » sans relire un cache. */
  readonly labels: Readonly<Record<string, string>>;
  readonly snapshot?: SendRunSnapshot;
};

export type SendQueueStorage = {
  readonly load: () => Promise<readonly StoredSendJob[]>;
  readonly save: (jobs: readonly StoredSendJob[]) => Promise<void>;
};

export type QueuedSend = {
  readonly id: string;
  readonly run: SendRun;
  readonly labels: Readonly<Record<string, string>>;
};

export type SendQueue = {
  /** Écrit l'envoi, puis le joue à son tour. */
  readonly submit: (job: Omit<StoredSendJob, 'id' | 'createdAt' | 'snapshot'>, ports: SendSheetPorts) => QueuedSend;
  /** Relit le stockage (lancement) et rejoue ce qui n'était pas parti. */
  readonly resume: () => Promise<void>;
  /** Le réseau est revenu : rejoue, dans l'ordre, ce qui attendait. */
  readonly flush: () => Promise<void>;
  readonly jobs: () => readonly QueuedSend[];
  readonly subscribe: (listener: () => void) => () => void;
};

export function memorySendQueueStorage(initial: readonly StoredSendJob[] = []): SendQueueStorage & { readonly current: () => readonly StoredSendJob[] } {
  let rows = initial;
  return {
    load: async () => rows,
    save: async (jobs) => {
      rows = jobs;
    },
    current: () => rows,
  };
}

const KEPT_FINISHED = 5;

const randomId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function createSendQueue(params: {
  readonly storage: SendQueueStorage;
  /** Les ports d'un envoi relu au lancement — chargés seulement s'il y en a un. */
  readonly portsFor: (language: string) => Promise<SendSheetPorts>;
  readonly now?: () => number;
  readonly newId?: () => string;
}): SendQueue {
  const now = params.now ?? Date.now;
  const newId = params.newId ?? randomId;
  const stored = new Map<string, StoredSendJob>();
  const live = new Map<string, QueuedSend>();
  const listeners = new Set<() => void>();
  let chain: Promise<void> = Promise.resolve();
  let writing: Promise<void> = Promise.resolve();

  const notify = (): void => listeners.forEach((listener) => listener());

  /* Les écritures s'enchaînent : la dernière gagne toujours, jamais une plus ancienne qui finirait après. */
  const persist = (): void => {
    const rows = [...stored.values()].sort((a, b) => a.createdAt - b.createdAt);
    writing = writing.then(
      () => params.storage.save(rows).catch(() => undefined),
      () => undefined,
    );
  };

  const settle = (id: string, run: SendRun, snapshot: SendRunSnapshot): void => {
    const job = stored.get(id);
    if (job === undefined) return;
    if (pendingKeysOf(run.getState()).length === 0) stored.delete(id);
    else stored.set(id, { ...job, snapshot });
    persist();
    notify();
  };

  /* Les envois FINIS ne restent en mémoire que le temps d'être lus : les plus récents, pas toute la session. */
  const prune = (): void => {
    const finished = [...live.values()].filter((queued) => !stored.has(queued.id) && pendingKeysOf(queued.run.getState()).length === 0);
    finished.slice(0, Math.max(0, finished.length - KEPT_FINISHED)).forEach((queued) => live.delete(queued.id));
  };

  const enqueue = (work: () => Promise<void>): Promise<void> => {
    const next = chain.then(work, work);
    chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  const adopt = (job: StoredSendJob, ports: SendSheetPorts): QueuedSend => {
    const run = createSendRun({
      entries: job.entries,
      payload: job.payload,
      language: job.language,
      ports,
      ...(job.snapshot === undefined ? {} : { resume: job.snapshot }),
      onProgress: (snapshot) => settle(job.id, run, snapshot),
    });
    const queued: QueuedSend = { id: job.id, run, labels: job.labels };
    live.set(job.id, queued);
    return queued;
  };

  return {
    submit: (job, ports) => {
      prune();
      const full: StoredSendJob = { ...job, id: newId(), createdAt: now() };
      stored.set(full.id, full);
      persist();
      const queued = adopt(full, ports);
      notify();
      void enqueue(() => queued.run.start());
      return queued;
    },
    resume: async () => {
      const rows = await params.storage.load().catch(() => [] as readonly StoredSendJob[]);
      const fresh = rows.filter((row) => !live.has(row.id)).sort((a, b) => a.createdAt - b.createdAt);
      fresh.forEach((row) => stored.set(row.id, row));
      const adopted = await Promise.all(fresh.map(async (row) => adopt(row, await params.portsFor(row.language))));
      if (adopted.length > 0) notify();
      await Promise.all(adopted.map((queued) => enqueue(() => queued.run.start())));
    },
    flush: () =>
      enqueue(async () => {
        for (const queued of live.values()) {
          if (pendingKeysOf(queued.run.getState()).length > 0) await queued.run.retryFailed();
        }
      }),
    jobs: () => [...live.values()],
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

export const SEND_QUEUE_DB_NAME = 'meeshy-send-queue';
const SEND_QUEUE_DB_VERSION = 1;
const SEND_QUEUE_STORE = 'jobs';
const SEND_QUEUE_KEY = 'all';

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

const isStoredJob = (value: unknown): value is StoredSendJob => {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return typeof row['id'] === 'string' && typeof row['createdAt'] === 'number' && Array.isArray(row['entries']) && typeof row['payload'] === 'object' && typeof row['language'] === 'string';
};

/** IndexedDB, un seul enregistrement : la liste des envois. Indisponible ⇒ rejet, que la file avale. */
export function idbSendQueueStorage(factory: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB): SendQueueStorage {
  if (factory === undefined) return memorySendQueueStorage();
  return {
    load: () =>
      withStore(factory, 'readonly', (store) => store.get(SEND_QUEUE_KEY), (request) => {
        const value: unknown = request?.result;
        return Array.isArray(value) ? value.filter(isStoredJob) : [];
      }),
    save: (jobs) =>
      withStore(
        factory,
        'readwrite',
        (store) => (jobs.length === 0 ? store.delete(SEND_QUEUE_KEY) : store.put([...jobs], SEND_QUEUE_KEY)),
        () => undefined,
      ),
  };
}
