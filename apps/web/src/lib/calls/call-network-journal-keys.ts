import type { SafeStorage } from '../storage';

/**
 * **OÙ VIT LE JOURNAL RÉSEAU D'UN COMPTE** (#8698) — sous SA clé
 * (`meeshy.call-journal.u_<id>` pour l'index, une clé par appel dessous),
 * comme les brouillons (D-142). Module sans dépendance : la fin d'un compte
 * (`account-caches.ts`, `accounts.ts`) l'efface sans charger le journal.
 */

export const CALL_JOURNAL_PREFIX = 'meeshy.call-journal.';

export type CallJournalKeys = { readonly index: string; readonly call: (callId: string) => string };

export function callJournalKeys(userId: string): CallJournalKeys {
  const index = `${CALL_JOURNAL_PREFIX}u_${userId}`;
  return { index, call: (callId) => `${index}.${callId}` };
}

/** Un appel journalisé, le plus récemment écrit en tête de l'index. */
export type JournalIndexEntry = { readonly id: string; readonly at: number };

const isEntry = (value: unknown): value is JournalIndexEntry =>
  typeof value === 'object' && value !== null && 'id' in value && typeof value.id === 'string' && 'at' in value && typeof value.at === 'number';

export function readJournalIndex(storage: Pick<SafeStorage, 'getItem'>, userId: string): readonly JournalIndexEntry[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(callJournalKeys(userId).index) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

export function forgetCallJournal(storage: SafeStorage, userId: string): void {
  const keys = callJournalKeys(userId);
  try {
    readJournalIndex(storage, userId).forEach((entry) => storage.removeItem(keys.call(entry.id)));
    storage.removeItem(keys.index);
  } catch {
    /* stockage refusé : rien à effacer */
  }
}
