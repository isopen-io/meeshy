import type { IncomingShare } from './incoming-share';

/**
 * LA BOÎTE DE RÉCEPTION DU WEB (#8884) — ce que `public/sw-share-target.js` a
 * rangé en recevant le `POST /share` du système. La page le lit UNE fois et le
 * purge dans la même transaction : un partage ne se rejoue pas, et les fichiers
 * d'un tiers ne restent pas sur l'appareil au-delà de leur usage.
 *
 * **JUMEAU GATÉ** avec le worker (un script classique n'importe aucun module) :
 * les quatre littéraux ci-dessous sont les siens, et
 * `sw-share-target.test.ts` écrit avec l'un et lit avec l'autre sur le même
 * double d'IndexedDB.
 */
export const SHARE_DB_NAME = 'meeshy-share';
export const SHARE_DB_VERSION = 1;
export const SHARE_STORE_NAME = 'incoming';
export const SHARE_KEY = 'current';

/** Un partage qui attend plus longtemps (connexion, onglet oublié) n'est plus celui que l'utilisateur pense envoyer. */
export const SHARE_MAX_AGE_MS = 60 * 60 * 1000;

type StoredShare = { readonly receivedAt: number; readonly files: readonly File[]; readonly text: string; readonly title: string; readonly url: string };

const isStoredShare = (value: unknown): value is StoredShare => {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record['receivedAt'] === 'number' &&
    Array.isArray(record['files']) &&
    record['files'].every((file) => file instanceof File) &&
    typeof record['text'] === 'string' &&
    typeof record['title'] === 'string' &&
    typeof record['url'] === 'string'
  );
};

const lastResort: IDBFactory | undefined = typeof indexedDB === 'undefined' ? undefined : indexedDB;

/**
 * Lit puis efface, dans UNE transaction. Un partage expiré ou malformé est
 * purgé et rend `null` ; un stockage indisponible aussi — jamais une erreur qui
 * remonterait à l'écran (le partage est perdu, l'application reste).
 */
export function takeWebShare(
  params: { readonly indexedDB?: IDBFactory | undefined; readonly now?: () => number } = {},
): Promise<IncomingShare | null> {
  const factory = 'indexedDB' in params ? params.indexedDB : lastResort;
  const now = params.now ?? Date.now;
  return new Promise((resolve) => {
    if (factory === undefined) {
      resolve(null);
      return;
    }
    let taken: unknown;
    try {
      const open = factory.open(SHARE_DB_NAME, SHARE_DB_VERSION);
      open.onupgradeneeded = () => {
        if (!open.result.objectStoreNames.contains(SHARE_STORE_NAME)) open.result.createObjectStore(SHARE_STORE_NAME);
      };
      open.onerror = () => resolve(null);
      open.onsuccess = () => {
        const db = open.result;
        const settle = (): void => {
          db.close();
          resolve(isStoredShare(taken) && now() - taken.receivedAt <= SHARE_MAX_AGE_MS ? incomingOf(taken) : null);
        };
        try {
          const tx = db.transaction(SHARE_STORE_NAME, 'readwrite');
          const rows = tx.objectStore(SHARE_STORE_NAME);
          const read = rows.get(SHARE_KEY);
          read.onsuccess = () => {
            taken = read.result;
            rows.delete(SHARE_KEY);
          };
          tx.oncomplete = settle;
          tx.onerror = () => {
            taken = undefined;
            settle();
          };
          tx.onabort = tx.onerror;
        } catch {
          taken = undefined;
          settle();
        }
      };
    } catch {
      resolve(null);
    }
  });
}

const incomingOf = ({ files, text, title, url }: StoredShare): IncomingShare => ({ files, text, title, url });
