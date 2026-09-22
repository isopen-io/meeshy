import type { QueryClient } from '@tanstack/react-query';
import type { StoreApi } from 'zustand/vanilla';

import type { ConversationStoreState } from '@/lib/conversation-store';
import type { Transport } from '../net/transport';
import type { ConversationsDeps } from './conversations';
import { patchConversation, patchConversationDetail } from './conversations';
import { toDate } from './decode';
import { conversationById } from './fixtures';
import { findCachedThreadMessage } from './messages';
import type { ApiResult } from './http';
import { outcomeOf } from './outcome';
import type { Conversation } from './types';

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
 *
 * **Les DEUX caches, confirmés ensemble** (#7351, V3) — `patchConversation`
 * (la liste) ET `patchConversationDetail` (`conversationQueryKey`, le
 * détail que `thread.tsx` relit). Sans le second, un rechargement après
 * lecture réhydratait le détail persisté avec l'ANCIEN `unreadCount` —
 * critère de fin #7351, « ce qui est lu ne redevient pas non lu ».
 *
 * **Le CURSEUR avance avec le compte** (revue-correction #7351) —
 * `caughtUpConversation` ci-dessous. Poser `unreadCount: 0` seul laissait le
 * curseur sur l'ancienne position : un fil rouvert sans refetch rendait non
 * lus les messages lus, et un message arrivé ensuite par le socket
 * (`upsertThreadMessage`, qui n'écrit pas la conversation) ne pouvait être
 * distingué de ceux-là que par le curseur.
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
  const caughtUp = findCachedThreadMessage(queryClient, conversationId, caughtUpToMessageId);
  const advance = (c: Conversation): Conversation =>
    caughtUpConversation(c, {
      messageId: caughtUpToMessageId,
      messageCreatedAt: caughtUp === undefined ? undefined : toDate(caughtUp.createdAt),
      readAt: new Date(),
    });
  patchConversation(queryClient, conversationId, advance);
  patchConversationDetail(queryClient, conversationId, advance);
  store.getState().clearOverride(conversationId, ['unreadCount']);
}

/**
 * `caughtUpConversation` — la conversation telle que le serveur la sert après
 * `POST …/receipts { caughtUpToMessageId }` : compte à 0, curseur posé sur le
 * message rattrapé (`lastReadMessageId`, et sa clé chronologique
 * `lastReadMessageCreatedAt`, rang 1 de `firstUnreadBoundary`). Message
 * absent du cache ⇒ sa date est inconnue : l'ancienne
 * `lastReadMessageCreatedAt` est RETIRÉE (garder une date antérieure rendrait
 * non lus les messages lus) et `lastReadAt`, rang 2, prend l'heure de lecture.
 */
export function caughtUpConversation(
  conversation: Conversation,
  cursor: { readonly messageId: string; readonly messageCreatedAt: Date | undefined; readonly readAt: Date },
): Conversation {
  const { lastReadMessageCreatedAt: _previous, ...rest } = conversation;
  return {
    ...rest,
    unreadCount: 0,
    lastReadMessageId: cursor.messageId,
    lastReadAt: cursor.readAt,
    ...(cursor.messageCreatedAt === undefined ? {} : { lastReadMessageCreatedAt: cursor.messageCreatedAt }),
  };
}

/**
 * LA LISTE NOMINATIVE D'UN MESSAGE (#7226, W7) — `detail=people`, MÊME route
 * que `pushReadReceipt`, jamais dupliquée. Miroir de `ReceiptPersonRow`
 * (`services/gateway/src/routes/conversations/receipts.ts:471-479`) et de
 * l'enveloppe `ReceiptsPayload` (`:480-492`) : `pagination` vit DANS `data`,
 * pas à la racine de l'enveloppe HTTP (contrairement à
 * `fetchAttachmentStatusDetails`, § `attachments.ts` — deux routes, deux
 * conventions de pagination, chacune fidèle à SA passerelle).
 *
 * `filterReadReceiptVisible` (`receipts.ts:637-653`) a DÉJÀ retiré les
 * opt-out `showReadReceipts` côté serveur — ce port ne réécrit AUCUNE garde,
 * il rend `people` tel que la passerelle le sert.
 */
export type ReceiptPersonRow = {
  readonly participantId: string;
  readonly displayName: string;
  readonly avatar: string | null;
  readonly deliveredAt: string | null;
  readonly receivedAt: string | null;
  readonly readAt: string | null;
  readonly readDevice: string | null;
};

export type ReceiptsPeoplePayload = {
  readonly detail: 'people';
  readonly messageIds: readonly string[];
  readonly people: readonly ReceiptPersonRow[];
  readonly pagination: {
    readonly total: number;
    readonly limit: number;
    readonly offset: number;
    readonly hasMore: boolean;
    readonly nextCursor: string | null;
  };
};

export const messageReceiptsPeopleQueryKey = (conversationId: string, messageId: string) =>
  ['message-receipts', conversationId, messageId] as const;

/**
 * DÉTERMINISTE, DÉRIVÉE DE `CONVERSATIONS` (#7226) — sous fixtures, il
 * n'existe aucun corpus « qui a lu/reçu ce message » : ce générateur assigne
 * un statut par PARITTÉ d'index sur `conversation.participants` (0 mod 3 ⇒
 * lu, 1 mod 3 ⇒ reçu seulement, 2 mod 3 ⇒ pas encore) — stable d'un rendu à
 * l'autre, pour que les captures de recette (`scripts/capture.mjs`) et les
 * témoins d'IU restent reproductibles.
 */
function peopleFixtureOf(conversationId: string): readonly ReceiptPersonRow[] {
  const participants = conversationById(conversationId)?.participants ?? [];
  const base = Date.UTC(2026, 8, 21, 10, 0, 0);
  return participants.map((p, index) => {
    const bucket = index % 3;
    const deliveredAt = new Date(base + index * 60_000).toISOString();
    return {
      participantId: p.id,
      displayName: p.displayName,
      avatar: p.avatar ?? null,
      deliveredAt,
      receivedAt: bucket === 2 ? null : new Date(base + index * 60_000 + 5_000).toISOString(),
      readAt: bucket === 0 ? new Date(base + index * 60_000 + 30_000).toISOString() : null,
      readDevice: null,
    };
  });
}

export async function fetchMessageReceiptsPeople(
  params: ConversationsDeps & {
    readonly conversationId: string;
    readonly messageId: string;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<ReceiptsPeoplePayload>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const people = peopleFixtureOf(params.conversationId);
    return {
      ok: true,
      data: {
        detail: 'people',
        messageIds: [params.messageId],
        people,
        pagination: { total: people.length, limit: people.length, offset: 0, hasMore: false, nextCursor: null },
      },
    };
  }
  // `limit` EXPLICITE au maximum de la route (`RECEIPTS_PEOPLE_MAX_LIMIT`,
  // `routes/conversations/receipts-contracts.ts:42`) : le défaut de la
  // passerelle est 20, et la feuille AGRÈGE ce qu'elle reçoit (trois
  // sections nominatives) sans lire `hasMore` — une conversation de plus de
  // vingt membres aurait donc affiché une liste tronquée SANS le dire.
  const query = new URLSearchParams({ detail: 'people', messageIds: params.messageId, limit: '100' });
  return params.transport.request<ReceiptsPeoplePayload>({
    method: 'GET',
    path: `/api/v1/conversations/${params.conversationId}/receipts?${query.toString()}`,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
}
