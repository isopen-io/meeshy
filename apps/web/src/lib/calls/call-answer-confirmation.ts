/**
 * **LA CONFIRMATION QUE LE WORKER POSE AVANT D'OUVRIR L'ONGLET** (#18907).
 *
 * `?repondre=<id>` est une ADRESSE : n'importe qui peut en composer une et la
 * faire ouvrir. La lire comme un consentement faisait décrocher, sans geste,
 * l'appel qu'un tiers désignait — caméra et micro partis vers l'appelant. Seul
 * le worker a reçu le toucher « Répondre » ; il écrit donc `{ callId, until }`
 * dans une base à part, juste avant `openWindow`, et la page la LIT puis la
 * SUPPRIME : elle ne sert qu'une fois, pour cet appel, pendant sa sonnerie.
 * Une adresse forgée n'a rien posé : l'appel sonne et attend un toucher.
 *
 * Base dédiée, jamais `meeshy-push` : la poser là forcerait à monter sa version.
 * **JUMEAU GATÉ avec `public/sw-push.js`** (`CALL_INTENT_*`) — `sw-push-call.test.ts`
 * fait écrire le worker et lire ce module au travers du MÊME double IndexedDB.
 */
export const CALL_INTENT_DB_NAME = 'meeshy-call-intent';
export const CALL_INTENT_DB_VERSION = 1;
export const CALL_INTENT_STORE_NAME = 'intents';

export type CallAnswerConfirmationRequest = {
  readonly callId: string;
  readonly now: number;
  readonly indexedDB: IDBFactory | undefined;
};

const validFor = (entry: unknown, callId: string, now: number): boolean => {
  if (entry === null || typeof entry !== 'object') return false;
  const { callId: posted, until } = entry as { readonly callId?: unknown; readonly until?: unknown };
  return posted === callId && typeof until === 'number' && until >= now;
};

/** `true` seulement si le worker a posé cette confirmation et qu'elle n'a pas expiré ; l'entrée est retirée dans tous les cas. */
export function consumeCallAnswerConfirmation({ callId, now, indexedDB }: CallAnswerConfirmationRequest): Promise<boolean> {
  return new Promise((resolve) => {
    if (indexedDB === undefined) {
      resolve(false);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(CALL_INTENT_DB_NAME, CALL_INTENT_DB_VERSION);
    } catch {
      resolve(false);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CALL_INTENT_STORE_NAME)) db.createObjectStore(CALL_INTENT_STORE_NAME);
    };
    request.onerror = () => resolve(false);
    request.onsuccess = () => {
      const db = request.result;
      const finish = (confirmed: boolean): void => {
        db.close();
        resolve(confirmed);
      };
      if (!db.objectStoreNames.contains(CALL_INTENT_STORE_NAME)) {
        finish(false);
        return;
      }
      try {
        const store = db.transaction(CALL_INTENT_STORE_NAME, 'readwrite').objectStore(CALL_INTENT_STORE_NAME);
        const reading = store.get(callId);
        reading.onsuccess = () => {
          const confirmed = validFor(reading.result, callId, now);
          if (reading.result === undefined) {
            finish(false);
            return;
          }
          const removal = store.delete(callId);
          removal.onsuccess = () => finish(confirmed);
          removal.onerror = () => finish(false);
        };
        reading.onerror = () => finish(false);
      } catch {
        finish(false);
      }
    };
  });
}
