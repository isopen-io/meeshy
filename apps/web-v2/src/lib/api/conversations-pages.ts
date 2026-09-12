import type { InfiniteData } from '@tanstack/react-query';

import { decodeConversation } from './decode';
import type { Conversation } from './types';

/**
 * LA FORME D'UNE PAGE DE LA LENTILLE (#6195) — miroir EXACT de ce que sert
 * `GET /api/v1/conversations?limit=30[&before=<id>]`
 * (`services/gateway/src/routes/conversations/core-list.ts:916-937`) : DEUX
 * blocs de pagination SIBLINGS de `data`, jamais imbriqués dedans.
 * `pageOfConversations` (`fixtures-pagination.ts`) mime la MÊME forme.
 */
export type ConversationsPagination = {
  readonly limit: number;
  readonly offset: number;
  readonly total: number;
  readonly hasMore: boolean;
};

export type ConversationsCursorPagination = {
  readonly limit: number;
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
};

export type ConversationsPage = {
  readonly conversations: readonly Conversation[];
  readonly pagination: ConversationsPagination;
  readonly cursorPagination: ConversationsCursorPagination;
};

/** Le curseur EST l'id de la dernière conversation d'une page — `before`,
 * transmis tel quel au prochain appel (`ConversationService.swift:140-143`). */
export type ConversationsPageParam = string | undefined;

export type ConversationsInfiniteData = InfiniteData<ConversationsPage, ConversationsPageParam>;

/**
 * `flattenConversationPages` — l'aplatissement que `conversationsQuery().select`
 * sert à la Lentille. DÉDOUBLONNE par id, la PREMIÈRE occurrence gagne (une
 * conversation remontée en tête entre deux défilements ne doit pas apparaître
 * deux fois), et DÉCODE chaque rangée par la MÊME fonction que l'ancienne
 * forme (`decodeConversation`, `decode.ts:249`) — une seule loi de décodage,
 * qu'elle voie un tableau ou des pages.
 *
 * FONCTION DE MODULE — jamais une lambda écrite en ligne dans la fabrique
 * (motif `decodeMessagesPage`, `messages.ts:56-67`) : `select` doit rester la
 * MÊME référence entre deux fabriques pour que `QueryObserver` la mémorise.
 */
export function flattenConversationPages(data: ConversationsInfiniteData): readonly Conversation[] {
  const seen = new Set<string>();
  const result: Conversation[] = [];
  for (const page of data.pages) {
    for (const conversation of page.conversations) {
      if (seen.has(conversation.id)) continue;
      seen.add(conversation.id);
      result.push(decodeConversation(conversation));
    }
  }
  return result;
}

/**
 * `nextConversationsCursor` — `getNextPageParam` de `useInfiniteQuery`, miroir
 * de la garde « zéro progrès » d'iOS (`ConversationListViewModel.swift:1858-
 * 1895`) : SIX vecteurs, chacun un refus de rendre un curseur qui bouclerait
 * sans fin — `hasMore` faux, `nextCursor` absent, curseur STAGNANT (identique
 * au paramètre qui vient de servir cette page), page VIDE, et — le cas qui a
 * motivé la garde iOS — AUCUN id neuf dans la page qui vient d'arriver (le
 * serveur a resservi une page déjà vue, `before` inconnu ⇒ page 1 resservie,
 * `core-list.ts:245`).
 */
export function nextConversationsCursor(
  lastPage: ConversationsPage,
  allPages: readonly ConversationsPage[],
  lastPageParam: ConversationsPageParam,
): ConversationsPageParam {
  if (lastPage.cursorPagination.hasMore !== true) return undefined;
  const { nextCursor } = lastPage.cursorPagination;
  if (nextCursor === null) return undefined;
  if (nextCursor === lastPageParam) return undefined;
  if (lastPage.conversations.length === 0) return undefined;

  const priorIds = new Set<string>();
  for (const page of allPages) {
    if (page === lastPage) continue;
    for (const conversation of page.conversations) priorIds.add(conversation.id);
  }
  const hasNewRow = lastPage.conversations.some((c) => !priorIds.has(c.id));
  return hasNewRow ? nextCursor : undefined;
}
