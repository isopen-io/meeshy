import type { SafeStorage } from '../storage';

import { boundedJournal, isJournalEvent, type JournalEvent } from './call-network-journal';
import { callJournalKeys, readJournalIndex, type JournalIndexEntry } from './call-network-journal-keys';

export { callJournalKeys, forgetCallJournal } from './call-network-journal-keys';

/**
 * **LE JOURNAL RÉSEAU PERSISTÉ** (#8698) — chaque appel sous sa clé, dans
 * l'espace de SON compte ; il survit au rechargement et se relit dans la fiche
 * de l'appel. Borné : {@link MAX_JOURNALED_CALLS} appels, {@link
 * JOURNAL_MAX_AGE_MS} de garde, 150 événements par appel. Un stockage plein
 * ou refusé n'interrompt jamais un appel : le journal se tait.
 */

export const MAX_JOURNALED_CALLS = 20;
export const JOURNAL_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type CallJournalStore = {
  readonly append: (userId: string, callId: string, events: readonly JournalEvent[]) => void;
  readonly read: (userId: string, callId: string) => readonly JournalEvent[];
};

function readEvents(storage: SafeStorage, key: string): readonly JournalEvent[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isJournalEvent) : [];
  } catch {
    return [];
  }
}

function quietly(write: () => void): void {
  try {
    write();
  } catch {
    /* stockage plein ou refusé : le journal se tait, l'appel continue */
  }
}

export function createCallJournalStore({ storage, now }: { readonly storage: SafeStorage; readonly now: () => number }): CallJournalStore {
  return {
    append: (userId, callId, events) => {
      if (events.length === 0) return;
      const keys = callJournalKeys(userId);
      const at = now();
      const others = readJournalIndex(storage, userId).filter((entry) => entry.id !== callId);
      const fresh = others.filter((entry) => at - entry.at <= JOURNAL_MAX_AGE_MS).slice(0, MAX_JOURNALED_CALLS - 1);
      const kept: readonly JournalIndexEntry[] = [{ id: callId, at }, ...fresh];
      others.filter((entry) => !fresh.includes(entry)).forEach((entry) => quietly(() => storage.removeItem(keys.call(entry.id))));
      quietly(() => storage.setItem(keys.call(callId), JSON.stringify(boundedJournal([...readEvents(storage, keys.call(callId)), ...events]))));
      quietly(() => storage.setItem(keys.index, JSON.stringify(kept)));
    },
    read: (userId, callId) => readEvents(storage, callJournalKeys(userId).call(callId)),
  };
}
