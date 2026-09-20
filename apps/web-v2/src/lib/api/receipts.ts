import type { QueryClient } from '@tanstack/react-query';
import type { StoreApi } from 'zustand/vanilla';

import type { ConversationStoreState } from '@/lib/conversation-store';
import type { Transport } from '../net/transport';
import type { ConversationsDeps } from './conversations';
import { patchConversation } from './conversations';
import { outcomeOf } from './outcome';

/**
 * LA FRONTIÈRE DE LECTURE, ÉCRITE SANS GESTE (#7201, W1) — miroir de
 * `pushRead` (`preferences.ts:94-101`), SANS le remplacer : `pushRead` sert
 * le geste MANUEL de la Lentille (« marquer tout lu », aucune frontière) ;
 * `pushReadReceipt` porte `caughtUpToMessageId`, la borne que l'ouverture
 * d'un fil, son défilement et son retour au premier plan avancent seuls.
 *
 * Même route, même schéma — `POST /api/v1/conversations/:conversationId/receipts`
 * (`services/gateway/src/routes/conversations/receipts.ts:961`), corps validé
 * par `ReceiptWriteBodySchema` (`receipts-contracts.ts:72-76`) qui accepte
 * `caughtUpToMessageId` (`receipts.ts:699`, schéma JSON du plugin). La garde
 * d'appartenance (`applyReceipt`, `receipts.ts:346-356`) vérifie que le
 * message appartient à CETTE conversation et n'est pas sous le plancher
 * d'historique — rattraper jusqu'à SON PROPRE dernier message est légitime
 * (aucune exclusion « expéditeur » pour ce champ, `receipts.ts:344-345`).
 */
export function pushReadReceipt(
  transport: Transport,
  conversationId: string,
  caughtUpToMessageId: string,
): Promise<unknown> {
  return transport({
    method: 'POST',
    path: `/api/v1/conversations/${conversationId}/receipts`,
    body: { type: 'read', caughtUpToMessageId },
  });
}

export type MarkCaughtUpDeps = ConversationsDeps & {
  readonly store: StoreApi<ConversationStoreState>;
  readonly queryClient: QueryClient;
};

/**
 * `markCaughtUp` — LA MÊME discipline optimiste que `performRowAction`
 * (`conversation-actions.ts`, action `'read'`) : l'override retombe la
 * pastille de la Lentille AVANT que le réseau ne confirme (« la pastille
 * redescend sans geste », critère de fin #7201), un refus PERMANENT (4xx) le
 * défait, une panne (réseau, 5xx) le LAISSE (transitoire — pas de rejeu
 * automatique côté web, comme `performRowAction`), un succès pose la valeur
 * CONFIRMÉE dans le cache et retire l'override.
 *
 * `source !== 'gateway'` (fixtures) : l'override optimiste reste posé, aucun
 * appel réseau ne part — même repli que `performRowAction`.
 */
export async function markCaughtUp(params: {
  readonly conversationId: string;
  readonly caughtUpToMessageId: string;
  readonly deps: MarkCaughtUpDeps;
}): Promise<void> {
  const { conversationId, caughtUpToMessageId, deps } = params;
  const { store, queryClient, source, transport } = deps;

  store.getState().markRead(conversationId);

  if (source !== 'gateway') return;

  let result: unknown;
  try {
    result = await pushReadReceipt(transport, conversationId, caughtUpToMessageId);
  } catch {
    return;
  }

  const outcome = outcomeOf(result);
  if (outcome === 'transient') return;
  if (outcome === 'permanent') {
    store.getState().clearOverride(conversationId, ['unreadCount']);
    return;
  }
  patchConversation(queryClient, conversationId, (c) => ({ ...c, unreadCount: 0 }));
  store.getState().clearOverride(conversationId, ['unreadCount']);
}
