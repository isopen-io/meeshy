import { useCallback, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';

import { paginationStateOf, type ListPaginationState } from '@/lib/lens/pagination';

import { apiDeps } from './deps';
import { anchoredMessagesQuery, type AnchoredWindow } from './messages-window';

/**
 * **LA FENÊTRE ANCRÉE D'UN FIL OUVERT** (#7420) — l'état « sauté » d'iOS
 * (`isInJumpedState`, `hasNewerMessages`, `returnToLatest`,
 * `ConversationViewModel+JumpToMessage.swift`), porté par une requête
 * TanStack sous sa propre clé (`messages-window.ts`).
 *
 * - `seek(messageId)` ancre le fil autour de ce message : UNE requête
 *   `?around=`, quelle que soit sa distance au présent.
 * - `settled` dit que la demande pour `target` a ABOUTI (servie ou refusée) :
 *   le saut (`useThreadJump`) abandonne alors un message que la fenêtre ne
 *   porte pas, au lieu d'attendre sans fin.
 * - `engaged` : la pagination du fil appartient à la fenêtre (vers le passé
 *   comme vers le présent). Une fenêtre REFUSÉE sans donnée rend la main au
 *   présent — jamais un fil bloqué sur une erreur qu'il ne montre pas.
 * - `loading` (#9302) : la fenêtre est EN VOL sans rien de servi — un appel
 *   réseau, jamais une fenêtre déjà en cache (Cache-First : rouvrir un favori
 *   déjà sauté ne se signale pas). C'est `isSearchingQuotedMessage` iOS, qui
 *   ne s'allume que sur le chemin lent de `jumpToQuotedMessage`.
 * - `clear()` revient au présent (`returnToLatest`) : le présent n'a jamais
 *   été touché, il se peint sur-le-champ depuis son cache.
 *
 * L'ancre est tenue PAR CONVERSATION : changer de fil la désarme d'elle-même.
 */
export type AnchoredThread = {
  readonly target: string | null;
  readonly window: AnchoredWindow | undefined;
  readonly settled: boolean;
  readonly loading: boolean;
  readonly engaged: boolean;
  readonly olderState: ListPaginationState;
  readonly fetchOlder: () => void;
  readonly newerState: ListPaginationState;
  readonly fetchNewer: () => void;
  readonly seek: (messageId: string) => void;
  readonly clear: () => void;
};

export function useAnchoredThread(conversationId: string): AnchoredThread {
  const [anchor, setAnchor] = useState<{ readonly conversationId: string; readonly messageId: string } | null>(null);
  const target = anchor !== null && anchor.conversationId === conversationId ? anchor.messageId : null;
  const query = useInfiniteQuery({ ...anchoredMessagesQuery(apiDeps, conversationId, target ?? ''), enabled: target !== null });

  const seek = useCallback((messageId: string) => setAnchor({ conversationId, messageId }), [conversationId]);
  const clear = useCallback(() => setAnchor(null), []);
  const { fetchNextPage, fetchPreviousPage } = query;
  const fetchOlder = useCallback(() => void fetchNextPage(), [fetchNextPage]);
  const fetchNewer = useCallback(() => void fetchPreviousPage(), [fetchPreviousPage]);

  const served = target === null ? undefined : query.data;
  return {
    target,
    window: served,
    settled: target !== null && query.status !== 'pending',
    loading: target !== null && served === undefined && query.fetchStatus === 'fetching',
    engaged: target !== null && !(query.status === 'error' && served === undefined),
    olderState: paginationStateOf({
      hasNextPage: query.hasNextPage,
      isFetchingNextPage: query.isFetchingNextPage,
      isFetchNextPageError: query.isFetchNextPageError,
    }),
    fetchOlder,
    newerState: paginationStateOf({
      hasNextPage: query.hasPreviousPage,
      isFetchingNextPage: query.isFetchingPreviousPage,
      isFetchNextPageError: query.isFetchPreviousPageError,
    }),
    fetchNewer,
    seek,
    clear,
  };
}
