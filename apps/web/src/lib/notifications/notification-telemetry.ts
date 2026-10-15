import type { SocialEventV2Input } from '@/lib/api/social-events-v2-types';

/**
 * **L'ENTONNOIR DES NOTIFICATIONS, CÔTÉ PAGE** (#10507) — le service worker
 * (`public/sw-push.js`, JUMEAU de ces trois noms) écrit `received`,
 * `displayed`, `opened` et `dismissed` dans IndexedDB ; la page, à son
 * chargement, VIDE la file et verse chaque événement dans la file v2, avec
 * l'`eventId` et l'heure que le worker leur a donnés (un rejeu ne recompte
 * rien). La file est vidée AVANT d'être versée : un double chargement ne
 * l'envoie pas deux fois.
 */
export const NOTIFICATION_TELEMETRY_DB_NAME = 'meeshy-telemetry';
export const NOTIFICATION_TELEMETRY_DB_VERSION = 1;
export const NOTIFICATION_TELEMETRY_STORE_NAME = 'outbox';
export const NOTIFICATION_TELEMETRY_KEY = 'notification-events';

type IdbRequest = { result: unknown; onsuccess: ((event: unknown) => void) | null; onerror: ((event: unknown) => void) | null };
type IdbStore = { get(key: string): IdbRequest; put(value: unknown, key: string): IdbRequest };
type IdbDatabase = {
  readonly objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string): unknown;
  transaction(name: string, mode?: 'readwrite'): { objectStore(name: string): IdbStore };
  close(): void;
};
type IdbOpenRequest = IdbRequest & { onupgradeneeded: ((event: unknown) => void) | null };
export type IdbFactoryLike = { open(name: string, version?: number): IdbOpenRequest };

const isNotificationEvent = (value: unknown): value is SocialEventV2Input =>
  value !== null && typeof value === 'object' && (value as { readonly type?: unknown }).type === 'notification';

function open(idb: IdbFactoryLike): Promise<IdbDatabase | null> {
  return new Promise((resolve) => {
    let request: IdbOpenRequest;
    try {
      request = idb.open(NOTIFICATION_TELEMETRY_DB_NAME, NOTIFICATION_TELEMETRY_DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result as IdbDatabase;
      if (!db.objectStoreNames.contains(NOTIFICATION_TELEMETRY_STORE_NAME)) db.createObjectStore(NOTIFICATION_TELEMETRY_STORE_NAME);
    };
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const db = request.result as IdbDatabase;
      resolve(db.objectStoreNames.contains(NOTIFICATION_TELEMETRY_STORE_NAME) ? db : null);
    };
  });
}

function takeAll(db: IdbDatabase): Promise<readonly unknown[]> {
  return new Promise((resolve) => {
    try {
      const store = db.transaction(NOTIFICATION_TELEMETRY_STORE_NAME, 'readwrite').objectStore(NOTIFICATION_TELEMETRY_STORE_NAME);
      const read = store.get(NOTIFICATION_TELEMETRY_KEY);
      read.onsuccess = () => {
        const pending = Array.isArray(read.result) ? (read.result as readonly unknown[]) : [];
        if (pending.length === 0) {
          resolve([]);
          return;
        }
        const clear = store.put([], NOTIFICATION_TELEMETRY_KEY);
        clear.onsuccess = () => resolve(pending);
        clear.onerror = () => resolve([]);
      };
      read.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/** Vide la file du worker vers `record` ; rend le nombre d'événements versés. */
export async function drainNotificationTelemetry(
  idb: IdbFactoryLike | Pick<IDBFactory, 'open'> | undefined,
  record: (event: SocialEventV2Input) => void,
): Promise<number> {
  if (idb === undefined) return 0;
  /* Le vrai `IDBFactory` porte des rappels typés par `this` ; ce module n'en
     lit que le sous-ensemble ci-dessus, le même que le double des témoins. */
  const db = await open(idb as IdbFactoryLike);
  if (db === null) return 0;
  const pending = await takeAll(db);
  db.close();
  const events = pending.filter(isNotificationEvent);
  events.forEach(record);
  return events.length;
}
