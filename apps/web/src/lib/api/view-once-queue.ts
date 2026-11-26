import { outcomeOf } from './outcome';
import type { Message } from './types';
import { sealViewOnce } from './view-once-seal';

/**
 * LA FILE DES VUES UNIQUES CONSOMMÉES SANS CONFIRMATION (#8015).
 *
 * Une vue unique fermée hors ligne est déjà « déjà ouverte » à l'écran, mais
 * le serveur ne l'a pas appris : sur un autre appareil, ou après un
 * rechargement qui relit la passerelle, le média redevenait ouvrable. La
 * consommation qui n'a pas pu partir entre donc ici, PERSISTÉE (le lecteur
 * peut fermer l'onglet hors ligne), et repart dans l'ORDRE d'entrée au retour
 * du réseau. Une panne garde l'entrée et tout ce qui la suit ; une réponse
 * définitive (succès ou refus) la retire. Même discipline que la file des
 * flammes-œil (`after-read.ts`), entrée par entrée puisque la route consomme
 * un message à la fois.
 */
export type ViewOnceQueueStorage = {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
  readonly removeItem: (key: string) => void;
};

export type ViewOnceQueueEntry = { readonly conversationId: string; readonly messageId: string };

export type ViewOnceQueue = {
  readonly enqueue: (conversationId: string, messageId: string) => void;
  readonly pendingFor: (conversationId: string) => ReadonlySet<string>;
  readonly flush: () => Promise<void>;
};

function isEntries(value: unknown): value is readonly ViewOnceQueueEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry: unknown) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { readonly conversationId?: unknown }).conversationId === 'string' &&
        typeof (entry as { readonly messageId?: unknown }).messageId === 'string',
    )
  );
}

export function createViewOnceQueue(deps: {
  readonly storage: ViewOnceQueueStorage | null;
  readonly key: string;
  readonly send: (entry: ViewOnceQueueEntry) => Promise<unknown>;
}): ViewOnceQueue {
  const { storage, key, send } = deps;

  const read = (): readonly ViewOnceQueueEntry[] => {
    try {
      const raw = storage?.getItem(key);
      if (raw === null || raw === undefined) return [];
      const parsed: unknown = JSON.parse(raw);
      return isEntries(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  let entries: readonly ViewOnceQueueEntry[] = read();
  let flushing: Promise<void> | null = null;

  const write = (next: readonly ViewOnceQueueEntry[]): void => {
    entries = next;
    try {
      if (next.length === 0) storage?.removeItem(key);
      else storage?.setItem(key, JSON.stringify(next));
    } catch {
      return;
    }
  };

  const same = (a: ViewOnceQueueEntry, b: ViewOnceQueueEntry): boolean =>
    a.conversationId === b.conversationId && a.messageId === b.messageId;

  const drain = async (): Promise<void> => {
    for (;;) {
      const head = entries[0];
      if (head === undefined) return;
      let result: unknown;
      try {
        result = await send(head);
      } catch {
        return;
      }
      if (outcomeOf(result) === 'transient') return;
      write(entries.filter((entry) => !same(entry, head)));
    }
  };

  return {
    enqueue: (conversationId, messageId) => {
      const entry = { conversationId, messageId };
      if (entries.some((held) => same(held, entry))) return;
      write([...entries, entry]);
    },
    pendingFor: (conversationId) =>
      new Set(entries.filter((entry) => entry.conversationId === conversationId).map((entry) => entry.messageId)),
    flush: () => {
      if (flushing !== null) return flushing;
      flushing = drain().finally(() => {
        flushing = null;
      });
      return flushing;
    },
  };
}

/**
 * « DÉJÀ OUVERT » SURVIT AU RECHARGEMENT (#8015) : tant que la file retient
 * une consommation, la rangée que la passerelle sert encore ouvrable est
 * scellée comme à l'ouverture locale. Rien à sceller ⇒ le MÊME tableau.
 */
export function sealPendingViewOnce(messages: readonly Message[], pending: ReadonlySet<string>): readonly Message[] {
  const opens = (m: Message): boolean => pending.has(m.id) && m.isViewOnce === true && m.consumedByMe !== true;
  if (pending.size === 0 || !messages.some(opens)) return messages;
  return messages.map((m) =>
    opens(m) ? { ...sealViewOnce(m), viewOnceCount: Math.max(1, m.viewOnceCount ?? 0) } : m,
  );
}
