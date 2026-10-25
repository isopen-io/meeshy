import { useCallback, useEffect, useRef } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';

import type { PlacedMessage } from '@/lib/grouping';

import { focusTargetAfterRemovals } from './removal-focus';
import { useRowExit, type RowExitState } from './row-exit-motion';
import { useRowSettle } from './row-settle-flip';
import { threadRowKeyOf } from './use-arrival-motion';

/**
 * LA SORTIE ET LE RETOUR D'UNE RANGÉE, CÂBLÉS DANS LE FIL (#12634) — ce que
 * `ThreadModes` consomme : l'état publié par `row-exit-motion.ts`, le
 * glissement mesuré des voisines (`row-settle-flip.ts`) et le relais du focus.
 *
 * LE FOCUS QUITTE LA RANGÉE QUI SORT. Elle devient `inert` dès le geste —
 * cachée aux lecteurs d'écran ET hors d'atteinte du clavier : une rangée
 * `aria-hidden` restée focalisable rouvrait son menu sur Entrée et relançait
 * la même suppression. Le focus qu'elle portait (rendu par le dialogue qui
 * se ferme) passe à sa voisine, jamais au `<body>`.
 */
export function useThreadRowExit(params: {
  readonly placed: readonly PlacedMessage[];
  readonly virtualizer: Virtualizer<HTMLElement, Element>;
}): { readonly exit: RowExitState; readonly listRef: { current: HTMLOListElement | null }; readonly settling: boolean } {
  const exit = useRowExit();
  const listRef = useRef<HTMLOListElement | null>(null);
  const settling = exit.leaving.size > 0 || exit.returning.size > 0;
  const rows = params.virtualizer.getVirtualItems().flatMap((row) => {
    const place = params.placed[row.index];
    return place === undefined ? [] : [{ key: threadRowKeyOf(place.message), start: row.start }];
  });
  const { virtualizer } = params;
  const scroller = useCallback((): HTMLElement | null => (virtualizer.scrollElement instanceof HTMLElement ? virtualizer.scrollElement : null), [virtualizer]);
  useRowSettle({ list: listRef, scroller, settling, rows, total: virtualizer.getTotalSize() });

  useEffect(() => {
    if (exit.leaving.size === 0 || typeof document === 'undefined') return;
    const active = document.activeElement;
    const leavingRow = active instanceof HTMLElement ? active.closest<HTMLElement>('[data-leaving]') : null;
    if (active !== null && active !== document.body && leavingRow === null) return;
    focusTargetAfterRemovals(exit.leaving)?.focus({ preventScroll: true });
  }, [exit.leaving]);

  return { exit, listRef, settling };
}
