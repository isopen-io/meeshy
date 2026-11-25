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

type IntentEntry = { readonly callId?: unknown; readonly until?: unknown };

const asEntry = (entry: unknown): IntentEntry | null => (entry !== null && typeof entry === 'object' ? (entry as IntentEntry) : null);

const validFor = (entry: unknown, callId: string, now: number): boolean => {
  const parsed = asEntry(entry);
  return parsed !== null && parsed.callId === callId && typeof parsed.until === 'number' && parsed.until >= now;
};

const expired = (entry: unknown, now: number): boolean => {
  const until = asEntry(entry)?.until;
  return typeof until !== 'number' || until < now;
};

/**
 * `true` seulement si le worker a posé cette confirmation, qu'elle n'a pas expiré, et que son retrait est VALIDÉ
 * (`oncomplete` de la transaction, jamais le seul succès de la requête : une validation qui échoue la laisserait
 * resservir — #19244). L'entrée de cet appel est retirée dans tous les cas, et les entrées périmées d'appels jamais
 * décrochés sont purgées au passage : la base ne s'accumule pas.
 */
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
      let done = false;
      const finish = (confirmed: boolean): void => {
        if (done) return;
        done = true;
        db.close();
        resolve(confirmed);
      };
      if (!db.objectStoreNames.contains(CALL_INTENT_STORE_NAME)) {
        finish(false);
        return;
      }
      try {
        const transaction = db.transaction(CALL_INTENT_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(CALL_INTENT_STORE_NAME);
        let confirmed = false;
        transaction.oncomplete = () => finish(confirmed);
        transaction.onerror = () => finish(false);
        transaction.onabort = () => finish(false);
        const keys = store.getAllKeys();
        const values = store.getAll();
        values.onsuccess = () => {
          const entries = keys.result.map((key, index) => [key, values.result[index]] as const);
          confirmed = entries.some(([key, entry]) => key === callId && validFor(entry, callId, now));
          entries.filter(([key, entry]) => key === callId || expired(entry, now)).forEach(([key]) => store.delete(key));
        };
      } catch {
        finish(false);
      }
    };
  });
}
