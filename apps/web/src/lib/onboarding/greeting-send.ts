import type { StoreApi } from 'zustand/vanilla';

import { confirmedCountOf, entriesOf, type OutboxEntry, type OutboxState } from '@/lib/send/outbox-store';

/**
 * **LE SALUT DE L'ACCUEIL NE PART QU'UNE FOIS** (#7729, carte 2) — même
 * après un échec.
 *
 * Un envoi refusé laisse son entrée `failed` dans l'outbox de Meeshy Global
 * (la bulle « Réessayer » du fil). Un nouveau tap sur « Envoyer » ne doit
 * donc JAMAIS ouvrir un second envoi à côté :
 * - **même texte** ⇒ la tentative en échec est REJOUÉE (`retrySend`, même
 *   `clientMessageId`) : si le premier appel avait atteint le serveur malgré
 *   le délai dépassé, l'idempotence par `clientMessageId` le reconnaît ;
 * - **texte réécrit** ⇒ l'ancien texte quitte l'outbox (`discard`, qui ne
 *   compte aucune confirmation) avant que le nouveau parte ;
 * - **l'entrée a disparu** ⇒ elle s'est CONFIRMÉE entre-temps (écho socket,
 *   « Réessayer » dans le fil) — `remove` est le seul autre geste qui retire
 *   une entrée : le salut est parti, rien ne repart.
 */

export type GreetingOutcome = 'sent' | 'failed' | 'offline';

export type GreetingInput = {
  readonly conversationId: string;
  readonly content: string;
  readonly language: string;
  readonly viewerId: string;
  readonly online: boolean;
};

export type GreetingSenderDeps = {
  readonly outbox: StoreApi<OutboxState>;
  readonly send: (input: GreetingInput) => Promise<void>;
  readonly retry: (input: { readonly conversationId: string; readonly clientMessageId: string; readonly online: boolean }) => Promise<void>;
};

type Attempt = { readonly conversationId: string; readonly clientMessageId: string };

export function createGreetingSender(deps: GreetingSenderDeps): (input: GreetingInput) => Promise<GreetingOutcome> {
  let attempt: Attempt | null = null;

  const entries = (conversationId: string): readonly OutboxEntry[] => entriesOf(deps.outbox.getState(), conversationId);
  const entryOf = (at: Attempt): OutboxEntry | undefined =>
    entries(at.conversationId).find((entry) => entry.message.clientMessageId === at.clientMessageId);

  const replay = async (at: Attempt): Promise<GreetingOutcome> => {
    await deps.retry({ ...at, online: true });
    if (entryOf(at) !== undefined) return 'failed';
    attempt = null;
    return 'sent';
  };

  const sendFresh = async (input: GreetingInput): Promise<GreetingOutcome> => {
    const known = new Set(entries(input.conversationId).map((entry) => entry.message.clientMessageId));
    const confirmedBefore = confirmedCountOf(deps.outbox.getState(), input.conversationId);
    await deps.send(input);
    const failed = entries(input.conversationId).find((entry) => !known.has(entry.message.clientMessageId) && entry.delivery === 'failed');
    if (failed !== undefined) {
      attempt = { conversationId: input.conversationId, clientMessageId: failed.message.clientMessageId };
      return 'failed';
    }
    return confirmedCountOf(deps.outbox.getState(), input.conversationId) > confirmedBefore ? 'sent' : 'failed';
  };

  return async (input) => {
    if (!input.online) return 'offline';
    const previous = attempt?.conversationId === input.conversationId ? attempt : null;
    if (previous === null) return sendFresh(input);

    const entry = entryOf(previous);
    if (entry === undefined) {
      attempt = null;
      return 'sent';
    }
    if (entry.delivery !== 'failed') return 'failed';
    if (entry.message.content === input.content) return replay(previous);

    deps.outbox.getState().discard(previous.conversationId, previous.clientMessageId);
    attempt = null;
    return sendFresh(input);
  };
}
