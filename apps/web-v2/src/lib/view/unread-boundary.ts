import { useRef } from 'react';

import { firstUnreadBoundary, type FirstUnreadBoundaryResult } from '@meeshy/shared/utils/first-unread';

import { toDate } from '@/lib/api/decode';
import type { Conversation, Message } from '@/lib/api/types';

export type UnreadBoundarySnapshot = FirstUnreadBoundaryResult | null;

export type FrozenUnreadBoundary = {
  readonly conversationId: string;
  readonly boundary: UnreadBoundarySnapshot;
};

/**
 * **LE GEL DE LA FRONTIÈRE DE NON-LUS** (#7202, W3, D-L2/D-L3) — loi PURE,
 * isolée de React : elle décide QUAND (re)calculer, jamais COMMENT tenir la
 * référence (ça, c'est `useUnreadBoundary` ci-dessous).
 *
 * **Pourquoi geler.** Le séparateur ne doit pas bouger pendant la session
 * même quand W1 (#7201, `markCaughtUp`) avance la lecture pendant qu'on
 * défile : `markCaughtUp` ne patch QUE `unreadCount` dans le cache
 * (`lib/api/receipts.ts`), jamais `lastReadMessageId` — donc un recalcul
 * naïf resterait déjà stable en pratique — mais un futur refetch de la
 * conversation qui écrirait ces trois champs ferait bouger le séparateur
 * SOUS le lecteur sans ce gel. On fige donc UNE fois, à la première donnée
 * prête, et plus jamais pour la même conversation.
 *
 * **`ready`, pas `messages.length > 0`.** `useThreadData` compose DEUX
 * requêtes (`conversation`, `messages`) qui peuvent résoudre à des instants
 * différents ; `conversation` peut arriver avant `messages`, auquel cas
 * geler sur `messages.length === 0` figerait `boundary: null` à tort (zéro
 * CANDIDAT plutôt que zéro message CHARGÉ). `ready` doit donc venir de
 * `threadData.status === 'success'` (les deux résolus), jamais d'une
 * approximation locale.
 */
export function nextFrozenUnreadBoundary(params: {
  readonly previous: FrozenUnreadBoundary | undefined;
  readonly conversationId: string;
  readonly ready: boolean;
  readonly compute: () => UnreadBoundarySnapshot;
}): FrozenUnreadBoundary | undefined {
  const { previous, conversationId, ready, compute } = params;
  if (previous !== undefined && previous.conversationId === conversationId) return previous;
  if (!ready) return previous;
  return { conversationId, boundary: compute() };
}

export type UseUnreadBoundaryInput = {
  readonly conversationId: string;
  readonly ready: boolean;
  readonly conversation: Conversation | undefined;
  readonly confirmedMessages: readonly Message[];
  readonly viewerId: string;
};

/**
 * `useUnreadBoundary` — GLUE React autour de `nextFrozenUnreadBoundary` : un
 * seul `ref`, recalculé SYNCHRONE pendant le rendu (jamais dans un effet —
 * l'effet de défilement initial de `use-thread-open-scroll.ts` lit la
 * valeur gelée DANS LE MÊME rendu que celui où elle vient de se figer, sans
 * quoi le premier defile utiliserait une valeur `null` non encore posée).
 *
 * `conversation.currentUserJoinedAt` est typé `Date | string`
 * (`packages/shared/types/conversation.ts:374`, deux origines possibles) —
 * `toDate()` (idempotent) l'uniformise avant l'appel à `firstUnreadBoundary`,
 * qui n'accepte que `Date`.
 */
export function useUnreadBoundary(input: UseUnreadBoundaryInput): UnreadBoundarySnapshot {
  const { conversationId, ready, conversation, confirmedMessages, viewerId } = input;
  const frozen = useRef<FrozenUnreadBoundary | undefined>(undefined);

  frozen.current = nextFrozenUnreadBoundary({
    previous: frozen.current,
    conversationId,
    ready,
    compute: () => {
      if (conversation === undefined) return null;
      return firstUnreadBoundary({
        messages: confirmedMessages,
        lastReadMessageId: conversation.lastReadMessageId ?? null,
        lastReadAt: conversation.lastReadAt ?? null,
        lastReadMessageCreatedAt: conversation.lastReadMessageCreatedAt ?? null,
        joinedAt: conversation.currentUserJoinedAt === undefined ? null : toDate(conversation.currentUserJoinedAt),
        viewerId,
      });
    },
  });

  return frozen.current?.conversationId === conversationId ? frozen.current.boundary : null;
}
