import { useCallback, useEffect, useRef, useState } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';

import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import type { PlacedMessage } from '@/lib/grouping';
import { usesFlatRow } from '@/lib/reading-mode/decision';

/** La DURÉE de la mise en évidence d'un saut — nommée parce que deux
 * lecteurs en dépendent : ce hook, qui l'efface, et
 * `scripts/lib/check-summary.mjs`, qui la mesure au navigateur PAR CONDITION
 * (jamais au chronomètre, #6115). */
export const HIGHLIGHT_MS = 1600;

/**
 * Le port de la fenêtre ancrée du fil — `useThreadData().around` (#7420) :
 * `seek` la demande autour d'un message, `target`/`settled` disent sur quel
 * message elle est posée et si sa demande a abouti.
 */
export type AroundWindow = {
  readonly target: string | null;
  readonly settled: boolean;
  readonly seek: (messageId: string) => void;
};

export type ThreadJump = {
  readonly highlightedId: string | null;
  /** La TUILE que la citation nommait (#9911) — mise en évidence avec sa rangée, effacée avec elle. */
  readonly highlightedPieceId: string | null;
  readonly jumpToMessage: (messageId: string, pieceId?: string) => void;
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
 *
 * UN IDENTIFIANT ABSENT de `placed` (#8320, #7420) : avec `around`, le saut
 * demande la fenêtre autour du message (`?around=`, UNE requête quelle que
 * soit sa distance au présent) et saute dès que la rangée arrive ; une
 * fenêtre servie sans elle (supprimée, sous le plancher d'historique) clôt la
 * recherche. Sans `around`, il reste sans effet. #8320 chargeait les pages
 * plus anciennes UNE à UNE : N allers-retours pour un message N pages plus
 * haut, plafonnés à vingt — un favori plus ancien que mille messages restait
 * hors d'atteinte.
 *
 * `virtualizer` n'est demandé que pour `scrollToIndex` (`Pick`) : c'est la
 * SEULE capacité du virtualiseur qu'un saut emploie, et un bouchon de test
 * s'en remplit sans `as`.
 */
export function useThreadJump(params: {
  readonly placed: readonly PlacedMessage[];
  readonly virtualizer: Pick<Virtualizer<HTMLElement, Element>, 'scrollToIndex'>;
  readonly noteProgrammaticScroll: () => void;
  readonly mode: ConversationReadingMode;
  readonly around?: AroundWindow;
}): ThreadJump {
  const { placed, virtualizer, noteProgrammaticScroll, mode } = params;
  /* En REF, pas en dépendance : `jumpToMessage` est une prop du `memo` de
     chaque rangée, et l'état de la fenêtre change à chaque demande. */
  const aroundRef = useRef(params.around);
  aroundRef.current = params.around;
  const [seek, setSeek] = useState<string | null>(null);

  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [highlightedPieceId, setHighlightedPieceId] = useState<string | null>(null);
  /* La pièce d'un saut qui attend sa fenêtre (`around`) — elle se pose à l'atterrissage. */
  const seekPiece = useRef<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * `useCallback` et non une fonction nue : cette référence est une PROP de
   * chaque `FocalRow`, dont le `memo` (#5648) ne vaut que si elle est
   * stable. `noteProgrammaticScroll` l'est déjà (`reading-mode/scene.ts`),
   * `virtualizer` aussi (instance TanStack), `placed` depuis le `useMemo` de
   * l'hôte — la chaîne tient de bout en bout.
   */
  const land = useCallback(
    (index: number, messageId: string, pieceId: string | null) => {
      // ANNONCE le défilement PROGRAMMÉ avant de le déclencher — ni le
      // révélé ni l'armement de la scène ne doivent réagir à un saut de
      // citation (§1.5 de la spécification #5648, même famille de
      // désarmement que l'ancrage bas, D-15).
      noteProgrammaticScroll();
      virtualizer.scrollToIndex(index, { align: 'center' });
      setHighlightedId(messageId);
      setHighlightedPieceId(pieceId);
      if (highlightTimer.current !== null) clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => {
        setHighlightedId(null);
        setHighlightedPieceId(null);
      }, HIGHLIGHT_MS);
    },
    [virtualizer, noteProgrammaticScroll],
  );

  const jumpToMessage = useCallback(
    (messageId: string, pieceId?: string) => {
      const index = placed.findIndex((p) => p.message.id === messageId);
      if (index !== -1) {
        setSeek(null);
        land(index, messageId, pieceId ?? null);
        return;
      }
      const around = aroundRef.current;
      if (around === undefined) return;
      seekPiece.current = pieceId ?? null;
      setSeek(messageId);
      around.seek(messageId);
    },
    [placed, land],
  );

  const aroundTarget = params.around?.target ?? null;
  const aroundSettled = params.around?.settled ?? false;
  useEffect(() => {
    if (seek === null) return;
    const index = placed.findIndex((p) => p.message.id === seek);
    if (index !== -1) {
      setSeek(null);
      land(index, seek, seekPiece.current);
      return;
    }
    if (aroundTarget === seek && aroundSettled) setSeek(null);
  }, [seek, placed, aroundTarget, aroundSettled, land]);
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

  return { highlightedId, highlightedPieceId, jumpToMessage, requestJump: setPendingJump };
}
