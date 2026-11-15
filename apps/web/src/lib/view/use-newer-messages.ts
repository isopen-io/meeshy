import type { RefObject } from 'react';

import { LOAD_MORE_LEAD_ROWS, type ListPaginationState } from '@/lib/lens/pagination';

import { useLoadMoreSentinel } from './use-load-more-sentinel';
import { THREAD_ROW_ESTIMATE } from './use-older-messages';

/**
 * **LE PRÉSENT, À L'APPROCHE DU BAS D'UNE FENÊTRE ANCRÉE** (#7420) — miroir du
 * chargement des messages plus récents d'iOS tant que `hasNewerMessages`
 * (`ConversationViewModel+JumpToMessage.swift`). Symétrique de
 * `useOlderMessages`, en plus simple : une page posée SOUS ce qu'on lit ne
 * déplace rien à l'écran, il n'y a donc aucun repère à reposer.
 *
 * Armée au seul état `idle` (une fenêtre DÉTACHÉE qui peut encore
 * descendre) et sur un fil qui porte au moins une rangée — même garde que la
 * tête. Le présent atteint, l'état passe à `exhausted` et rien ne part plus.
 */
const NEWER_ROOT_MARGIN = `0px 0px ${THREAD_ROW_ESTIMATE * LOAD_MORE_LEAD_ROWS}px 0px`;

export function useNewerMessages(params: {
  readonly scroller: RefObject<HTMLElement | null>;
  readonly state: ListPaginationState;
  readonly rowCount: number;
  readonly fetchNewer: () => void;
}): { readonly state: ListPaginationState; readonly sentinelRef: (node: Element | null) => void } {
  const { observe } = useLoadMoreSentinel({
    root: params.scroller,
    rootMargin: NEWER_ROOT_MARGIN,
    enabled: params.state === 'idle' && params.rowCount > 0,
    onReach: params.fetchNewer,
  });
  return { state: params.state, sentinelRef: observe };
}
