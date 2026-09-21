import { useEffect, useRef, type RefObject } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';

import { BOTTOM_ANCHOR_FRAMES, pinToBottom } from './pin-to-bottom';
import { threadOpenScrollDecision, type PlacedLike } from './unread-separator';
import type { UnreadBoundarySnapshot } from './unread-boundary';

/**
 * **L'OUVERTURE DU FIL** (#5774, #6972, étendu #7202/D-L2) — REMPLACE
 * l'effet auparavant inline dans `routes/thread.tsx` (« UN FIL S'OUVRE EN
 * BAS »), déplacé ici pour deux raisons : le budget de taille du fichier
 * hôte (CLAUDE.md § Code Style) ET la demande explicite du cadrage de W3 de
 * ne pas agrandir `thread.tsx` pour loger la loi du séparateur.
 *
 * **CE QUI NE CHANGE PAS** : l'ancrage en bas reste sur l'IDENTITÉ de la
 * queue (`lastMessageId`, jamais `placed.length` — voir #6972, le
 * doc-comment original conservé ci-dessous pour la raison exacte), et
 * `pinToBottom` reste la MÊME loi que le bouton « revenir en bas »
 * (`pin-to-bottom.ts`).
 *
 * **CE QUI CHANGE (#7202, D-L2)** : la toute PREMIÈRE fois qu'un fil
 * s'ouvre pour une conversation donnée, s'il existe un premier non-lu
 * (`unreadBoundary`) ET que sa rangée est dans la fenêtre chargée
 * (`placed`), le fil s'ouvre SUR le séparateur au lieu du bas — la décision
 * elle-même est une loi PURE, testée séparément
 * (`threadOpenScrollDecision`, `unread-separator.ts`). Les arrivées
 * SUIVANTES (nouveaux messages pendant la session) gardent le comportement
 * historique : ancrage en bas, jamais un second saut vers le séparateur
 * (D-L2 ne gouverne que l'OUVERTURE).
 *
 * ## UN SEUL `scrollToIndex` NE SUFFIT PAS POUR LE BAS, ET C'EST MESURÉ
 *
 * Il vise le bas d'une hauteur ESTIMÉE, puis les cellules réellement
 * montées se mesurent et la hauteur totale change sous lui. On se RÉ-ANCRE
 * donc sur plusieurs images le temps que les mesures convergent — et on
 * abandonne à la PREMIÈRE intention de l'utilisateur (mêmes écouteurs que
 * `pin-to-bottom.ts`). Le saut vers le séparateur, lui, suit le même
 * patron que `jumpToMessage` (citation, `routes/thread.tsx`) : une seule
 * image suffit pour un index déjà dans la fenêtre virtualisée.
 */
export function useThreadOpenScroll(input: {
  readonly scroller: RefObject<HTMLElement | null>;
  readonly conversationId: string;
  readonly placed: readonly PlacedLike[];
  readonly unreadBoundary: UnreadBoundarySnapshot;
  readonly virtualizer: Pick<Virtualizer<HTMLElement, Element>, 'scrollToIndex'>;
  readonly onProgrammaticScroll: () => void;
}): void {
  const { scroller, conversationId, placed, unreadBoundary, virtualizer, onProgrammaticScroll } = input;
  const lastMessageId = placed[placed.length - 1]?.message.id;
  const openedFor = useRef<string | null>(null);

  useEffect(() => {
    const el = scroller.current;
    if (el === null || lastMessageId === undefined) return;

    const isInitialOpen = openedFor.current !== conversationId;
    openedFor.current = conversationId;

    const decision = threadOpenScrollDecision({ isInitialOpen, unreadBoundary, placed });
    if (decision.kind === 'jump-to-separator') {
      onProgrammaticScroll();
      virtualizer.scrollToIndex(decision.index, { align: 'start' });
      return;
    }

    // ANNONCE au premier pin : l'ancrage en bas ne doit ni révéler ni armer
    // la scène du fil (§5.8 de la spécification #5648) — l'unique intention
    // qui le RELÂCHE (`release`, mêmes écouteurs) rouvre la scène par le même
    // événement, sans course possible entre les deux effets.
    const release = pinToBottom(el, { frames: BOTTOM_ANCHOR_FRAMES, onFirstFrame: onProgrammaticScroll });
    for (const event of ['wheel', 'touchstart', 'keydown'] as const) {
      el.addEventListener(event, release, { passive: true });
    }
    return () => {
      release();
      for (const event of ['wheel', 'touchstart', 'keydown'] as const) {
        el.removeEventListener(event, release);
      }
    };
    // Volontairement sur la seule QUEUE du fil (#6972) : se ré-ancrer à
    // chaque rendu empêcherait l'utilisateur de remonter son historique.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessageId]);
}
