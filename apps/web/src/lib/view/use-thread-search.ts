import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ConversationsDeps } from '@/lib/api/conversations';
import { searchConversationMessages, type MessageSearchPage } from '@/lib/api/messages-search';
import type { Message } from '@/lib/api/types';

import {
  searchHitOf,
  searchNeedle,
  THREAD_SEARCH_DEBOUNCE_MS,
  type ThreadSearchHit,
  type ThreadSearchPhase,
} from './thread-search';

export type ThreadSearch = {
  readonly open: boolean;
  readonly query: string;
  /** La requête a-t-elle passé le seuil (`searchNeedle`) ? */
  readonly ready: boolean;
  readonly phase: ThreadSearchPhase;
  readonly hits: readonly ThreadSearchHit[];
  /** Le compte de la requête COURANTE — 0 tant qu'elle n'a pas répondu, même
   * si `hits` peint encore la précédente. */
  readonly count: number;
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
  readonly openSearch: () => void;
  readonly close: () => void;
  readonly setQuery: (query: string) => void;
  readonly loadMore: () => void;
  readonly retry: () => void;
};

type Answer = {
  readonly needle: string;
  readonly messages: readonly Message[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
};

type Search = (params: {
  readonly query: string;
  readonly cursor: string | null;
  readonly signal: AbortSignal;
}) => Promise<MessageSearchPage | null>;

/**
 * LA RECHERCHE DANS LA CONVERSATION — son ÉTAT, miroir de
 * `ConversationSearchHandler` + `debounceSearch` iOS. La loupe de l'en-tête
 * était un bouton SANS gestionnaire depuis septembre : ce hook est ce qui lui
 * manquait, et rien d'autre — le panneau (`thread-search-panel.tsx`) peint,
 * le fil saute (`useThreadJump`, par la prop `onJumpToMessage` de l'en-tête).
 *
 * **L'anti-rebond et l'annulation vont ensemble.** Chaque frappe réarme une
 * minuterie de `THREAD_SEARCH_DEBOUNCE_MS` ET annule la requête en vol
 * (`AbortController`) : sans l'annulation, la réponse de « bon » pourrait
 * arriver APRÈS celle de « bonjour » et repeindre des résultats que la
 * requête affichée ne demande plus. La réponse porte sa `needle` et n'est
 * peinte que si elle est celle de la requête COURANTE — double garde, parce
 * qu'un transport peut ignorer le signal.
 *
 * **Fermer remet tout à zéro** (comme `dismissSearch` iOS) : rouvrir la loupe
 * donne un champ vide, jamais les résultats d'une recherche oubliée.
 *
 * `search` est injectable pour les témoins ; par défaut, la route de la
 * passerelle (`searchConversationMessages`).
 */
export function useThreadSearch(params: {
  readonly conversationId: string;
  readonly deps: ConversationsDeps;
  readonly search?: Search;
  readonly debounceMs?: number;
}): ThreadSearch {
  const { conversationId, deps } = params;
  const debounceMs = params.debounceMs ?? THREAD_SEARCH_DEBOUNCE_MS;
  const [open, setOpen] = useState(false);
  const [query, setQueryState] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [failedNeedle, setFailedNeedle] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const moreController = useRef<AbortController | null>(null);

  const search = useMemo<Search>(
    () =>
      params.search ??
      (async ({ query: q, cursor, signal }) => {
        const result = await searchConversationMessages({ ...deps, conversationId, query: q, cursor, signal });
        return result.ok ? result.data : null;
      }),
    [params.search, deps, conversationId],
  );

  const needle = open ? searchNeedle(query) : null;

  useEffect(() => {
    if (needle === null) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      search({ query: needle, cursor: null, signal: controller.signal }).then(
        (page) => {
          if (controller.signal.aborted) return;
          if (page === null) {
            setFailedNeedle(needle);
            return;
          }
          setFailedNeedle(null);
          setAnswer({ needle, messages: page.results, hasMore: page.hasMore, nextCursor: page.nextCursor });
        },
        () => {
          if (!controller.signal.aborted) setFailedNeedle(needle);
        },
      );
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [needle, search, debounceMs, attempt]);

  /* Une page SUIVANTE en vol appartient à l'ancienne requête : changer de
     requête (ou fermer) l'annule. */
  useEffect(
    () => () => {
      moreController.current?.abort();
      moreController.current = null;
      setLoadingMore(false);
    },
    [needle],
  );

  const current = answer !== null && answer.needle === needle ? answer : null;
  const failed = needle !== null && failedNeedle === needle && current === null;
  const phase: ThreadSearchPhase = needle === null ? 'idle' : current !== null ? 'done' : failed ? 'failed' : 'loading';
  /* PENDANT la frappe, les résultats de la requête PRÉCÉDENTE restent peints
     (la ligne d'état dit « Recherche… ») : vider la liste à chaque lettre la
     ferait clignoter sous le doigt. Fermée ou sous le seuil, plus rien. */
  const shown = current ?? (phase === 'loading' ? answer : null);
  const hits = useMemo(
    () => (shown === null ? [] : shown.messages.map((message) => searchHitOf(message, shown.needle))),
    [shown],
  );

  const loadMore = useCallback(() => {
    if (current === null || !current.hasMore || current.nextCursor === null || moreController.current !== null) return;
    const controller = new AbortController();
    moreController.current = controller;
    setLoadingMore(true);
    const settle = () => {
      if (moreController.current === controller) moreController.current = null;
      if (!controller.signal.aborted) setLoadingMore(false);
    };
    search({ query: current.needle, cursor: current.nextCursor, signal: controller.signal }).then(
      (page) => {
        settle();
        if (controller.signal.aborted || page === null) return;
        setAnswer((previous) =>
          previous === null || previous.needle !== current.needle
            ? previous
            : {
                needle: previous.needle,
                messages: [...previous.messages, ...page.results.filter((m) => !previous.messages.some((p) => p.id === m.id))],
                hasMore: page.hasMore,
                nextCursor: page.nextCursor,
              },
        );
      },
      settle,
    );
  }, [current, search]);

  const close = useCallback(() => {
    setOpen(false);
    setQueryState('');
    setAnswer(null);
    setFailedNeedle(null);
  }, []);

  return {
    open,
    query,
    ready: needle !== null,
    phase,
    hits,
    count: current?.messages.length ?? 0,
    hasMore: current?.hasMore === true,
    loadingMore,
    openSearch: useCallback(() => setOpen(true), []),
    close,
    setQuery: setQueryState,
    loadMore,
    retry: useCallback(() => {
      setFailedNeedle(null);
      setAttempt((n) => n + 1);
    }, []),
  };
}
