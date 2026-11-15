import type { QueryClient } from '@tanstack/react-query';
import type { StoreApi } from 'zustand/vanilla';

import { withdrawLastMessage } from '@/lib/api/list-preview';
import { latestSurvivingThreadMessage } from '@/lib/api/messages';
import { mayHaveReachedServer } from '@/lib/api/outcome';
import type { Message } from '@/lib/api/types';

import { entriesOf, type OutboxState } from './outbox-store';

export type DiscardDeps = {
  readonly queryClient: QueryClient;
  readonly outbox: StoreApi<OutboxState>;
};

/** `uncertain` : l'échec laisse ouverte la possibilité que le serveur ait déjà reçu l'envoi (`mayHaveReachedServer`). */
export type DiscardOutcome = { readonly uncertain: boolean };

const timeOf = (message: Message): number => new Date(message.createdAt as unknown as string).getTime();

const newest = (messages: readonly Message[]): Message | undefined =>
  messages.reduce<Message | undefined>((latest, m) => (latest === undefined || timeOf(m) > timeOf(latest) ? m : latest), undefined);

/**
 * ABANDONNER UN ENVOI EN ÉCHEC (#12632) — le SITE UNIQUE de la règle, à côté de
 * `performSend` qui l'a posé : l'entrée quitte l'outbox sans compter de
 * confirmation, ET la ligne de liste rend sa place au message qui le précède
 * (le plus récent du fil confirmé ou des envois restés dans l'outbox). Sans ce
 * second geste, la liste disait encore « Vous : … » d'un message que ni le fil
 * ni le serveur n'ont.
 *
 * Un envoi encore EN VOL ne s'abandonne pas (`null`) : sa confirmation peut
 * encore arriver.
 */
export function discardSend(params: {
  readonly conversationId: string;
  readonly clientMessageId: string;
  readonly deps: DiscardDeps;
}): DiscardOutcome | null {
  const { conversationId, clientMessageId, deps } = params;
  const entry = entriesOf(deps.outbox.getState(), conversationId).find((e) => e.message.clientMessageId === clientMessageId);
  if (entry === undefined || entry.delivery !== 'failed') return null;

  deps.outbox.getState().discard(conversationId, clientMessageId);
  const remaining = entriesOf(deps.outbox.getState(), conversationId).map((e) => e.message);
  const confirmed = latestSurvivingThreadMessage(deps.queryClient, conversationId, entry.message.id);
  const survivor = newest(confirmed === undefined ? remaining : [confirmed, ...remaining]);
  withdrawLastMessage(deps.queryClient, conversationId, entry.message.id, survivor);
  return { uncertain: mayHaveReachedServer(entry.lastError) };
}
