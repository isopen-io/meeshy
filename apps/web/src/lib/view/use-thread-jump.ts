import { useCallback, useEffect, useRef, useState } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';

import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import type { PlacedMessage } from '@/lib/grouping';
import type { ListPaginationState } from '@/lib/lens/pagination';
import { usesFlatRow } from '@/lib/reading-mode/decision';

/** La DURÉE de la mise en évidence d'un saut — nommée parce que deux
 * lecteurs en dépendent : ce hook, qui l'efface, et
 * `scripts/lib/check-summary.mjs`, qui la mesure au navigateur PAR CONDITION
 * (jamais au chronomètre, #6115). */
export const HIGHLIGHT_MS = 1600;

/**
 * LE PLAFOND D'UNE RECHERCHE (#8320) — un saut vers un message hors de la
 * fenêtre chargée charge les pages plus anciennes UNE à la fois ; jamais plus
 * que ce nombre pour un seul saut, pour qu'une citation d'un message très
 * ancien ne vide pas la batterie à charger tout le fil.
 */
export const MAX_SEEK_PAGES = 20;

/** Le port de pagination du fil — `useThreadData().olderState` / `fetchOlder`. */
export type OlderPages = {
  readonly state: ListPaginationState;
  readonly fetchOlder: () => void;
};

type Seek = { readonly id: string; readonly pages: number; readonly seenRows: number };

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
 *
 * UN IDENTIFIANT ABSENT de `placed` (#8320) : avec `older`, le saut charge
 * les pages plus anciennes UNE à la fois — la suivante seulement quand la
 * précédente est ARRIVÉE — jusqu'à trouver le message (puis saute et
 * surligne), épuiser le fil, échouer, ou atteindre `MAX_SEEK_PAGES`. Sans
 * `older`, il reste sans effet. #7420 remplacera la marche par la fenêtre
 * `?around=` (`messages-list.ts`, `allowsAround`) — ICI, jamais dans l'hôte.
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
  readonly older?: OlderPages;
}): ThreadJump {
  const { placed, virtualizer, noteProgrammaticScroll, mode } = params;
  /* En REF, pas en dépendance : `jumpToMessage` est une prop du `memo` de
     chaque rangée, et l'état de pagination change à chaque page. */
  const olderRef = useRef(params.older);
  olderRef.current = params.older;
  const [seek, setSeek] = useState<Seek | null>(null);

  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * `useCallback` et non une fonction nue : cette référence est une PROP de
   * chaque `FocalRow`, dont le `memo` (#5648) ne vaut que si elle est
   * stable. `noteProgrammaticScroll` l'est déjà (`reading-mode/scene.ts`),
   * `virtualizer` aussi (instance TanStack), `placed` depuis le `useMemo` de
   * l'hôte — la chaîne tient de bout en bout.
   */
  const land = useCallback(
    (index: number, messageId: string) => {
      // ANNONCE le défilement PROGRAMMÉ avant de le déclencher — ni le
      // révélé ni l'armement de la scène ne doivent réagir à un saut de
      // citation (§1.5 de la spécification #5648, même famille de
      // désarmement que l'ancrage bas, D-15).
      noteProgrammaticScroll();
      virtualizer.scrollToIndex(index, { align: 'center' });
      setHighlightedId(messageId);
      if (highlightTimer.current !== null) clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlightedId(null), HIGHLIGHT_MS);
    },
    [virtualizer, noteProgrammaticScroll],
  );

  const jumpToMessage = useCallback(
    (messageId: string) => {
      const index = placed.findIndex((p) => p.message.id === messageId);
      if (index !== -1) {
        setSeek(null);
        land(index, messageId);
        return;
      }
      const older = olderRef.current;
      if (older === undefined || older.state !== 'idle') return;
      setSeek({ id: messageId, pages: 1, seenRows: placed.length });
      older.fetchOlder();
    },
    [placed, land],
  );

  const olderState = params.older?.state;
  useEffect(() => {
    if (seek === null) return;
    const index = placed.findIndex((p) => p.message.id === seek.id);
    if (index !== -1) {
      setSeek(null);
      land(index, seek.id);
      return;
    }
    if (olderState === 'exhausted' || olderState === 'error' || olderState === undefined) {
      setSeek(null);
      return;
    }
    if (olderState !== 'idle' || placed.length <= seek.seenRows) return;
    if (seek.pages >= MAX_SEEK_PAGES) {
      setSeek(null);
      return;
    }
    setSeek({ id: seek.id, pages: seek.pages + 1, seenRows: placed.length });
    olderRef.current?.fetchOlder();
  }, [seek, placed, olderState, land]);
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
