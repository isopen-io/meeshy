import { useCallback, useEffect, useRef, useState } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';

import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import type { PlacedMessage } from '@/lib/grouping';
import { usesFlatRow } from '@/lib/reading-mode/decision';

export type ThreadJump = {
  readonly highlightedId: string | null;
  readonly jumpToMessage: (messageId: string) => void;
  /** LE SAUT DIFFÉRÉ (#5695) — les trois sorties du Résumé Vivant l'appellent
   * quand `<ol>` n'est pas encore monté (`usesFlatRow`) ; `null` désarme une
   * demande en cours sans en poser de nouvelle. */
  readonly requestJump: (messageId: string | null) => void;
};

/**
 * LE SAUT DE CITATION ET SA MISE EN ÉVIDENCE (#5566, défaut 10 ; #5695,
 * extrait de `routes/thread.tsx` au lot #7429, découpage sans changer un
 * pixel) — le bouton de citation promettait une navigation par son nom
 * accessible et ne faisait rien. `scrollToIndex` amène le message cité dans
 * la fenêtre virtualisée ; la mise en évidence s'efface d'elle-même, jamais
 * un état qui s'accumule sans fin.
 */
export function useThreadJump(params: {
  readonly placed: readonly PlacedMessage[];
  readonly virtualizer: Virtualizer<HTMLElement, Element>;
  readonly noteProgrammaticScroll: () => void;
  readonly mode: ConversationReadingMode;
}): ThreadJump {
  const { placed, virtualizer, noteProgrammaticScroll, mode } = params;

  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * `useCallback` et non une fonction nue : cette référence est une PROP de
   * chaque `FocalRow`, dont le `memo` (#5648) ne vaut que si elle est
   * stable. `noteProgrammaticScroll` l'est déjà (`reading-mode/scene.ts`),
   * `virtualizer` aussi (instance TanStack), `placed` depuis le `useMemo` de
   * l'hôte — la chaîne tient de bout en bout.
   */
  const jumpToMessage = useCallback(
    (messageId: string) => {
      const index = placed.findIndex((p) => p.message.id === messageId);
      if (index === -1) return;
      // ANNONCE le défilement PROGRAMMÉ avant de le déclencher — ni le
      // révélé ni l'armement de la scène ne doivent réagir à un saut de
      // citation (§1.5 de la spécification #5648, même famille de
      // désarmement que l'ancrage bas, D-15).
      noteProgrammaticScroll();
      virtualizer.scrollToIndex(index, { align: 'center' });
      setHighlightedId(messageId);
      if (highlightTimer.current !== null) clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlightedId(null), 1600);
    },
    [placed, virtualizer, noteProgrammaticScroll],
  );
  useEffect(
    () => () => {
      if (highlightTimer.current !== null) clearTimeout(highlightTimer.current);
    },
    [],
  );

  /**
   * LE SAUT DIFFÉRÉ (#5695) — les TROIS sorties du Résumé Vivant reposent sur
   * `jumpToMessage`, qui n'a de cible que quand `<ol>` est MONTÉ
   * (`usesFlatRow`). Sans ce différé, basculer `summary → script` puis
   * sauter dans le MÊME geste viserait un virtualiseur qui compte encore
   * zéro rangée plate — miroir des trois portes iOS
   * (`ConversationView.swift:1527-1547`, qui posent `scrollToMessageId` +
   * `trigger`, consommés APRÈS le rebasculement de mode).
   */
  const [pendingJump, setPendingJump] = useState<string | null>(null);
  useEffect(() => {
    if (pendingJump === null || !usesFlatRow(mode)) return;
    jumpToMessage(pendingJump);
    setPendingJump(null);
  }, [pendingJump, mode, jumpToMessage]);

  return { highlightedId, jumpToMessage, requestJump: setPendingJump };
}
