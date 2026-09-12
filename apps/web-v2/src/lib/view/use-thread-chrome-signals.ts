import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type FocusEvent, type RefObject } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';

import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import { served } from '@/lib/api/prism';
import type { Message } from '@/lib/api/types';
import type { PlacedMessage } from '@/lib/grouping';
import { createScrollerGestureSubscriber, useThreadChrome } from '@/lib/view/use-thread-chrome';
import { isNearBottom, stickyDayOf, type VirtualRowSpan } from '@/lib/view/thread-chrome';
import { initialUnreadBelowState, reduceUnreadBelow } from '@/lib/view/unread-below';
import { SCROLL_TO_BOTTOM_FRAMES, pinToBottom } from '@/lib/view/pin-to-bottom';

/**
 * LE CHROME DU FIL, EN UN SEUL SIGNAL (#5774, travail 3/3) — extrait de
 * `routes/thread.tsx` (budget de taille, CLAUDE.md § Code Style : « 1000
 * est le seuil au-delà duquel un découpage se justifie sans se discuter » ;
 * ce fichier avait déjà payé cette dette une fois, `thread-header.tsx`
 * §revue #5814, puis `thread-modes.tsx` §#5878 — le motif est le même).
 * AUCUNE règle nouvelle ici : compose trois primitives déjà testées
 * séparément (`useThreadChrome`, `isNearBottom`/`stickyDayOf`
 * `lib/view/thread-chrome.ts`, `reduceUnreadBelow` `lib/view/unread-below.ts`)
 * dans l'unique ordre où l'écran les consomme.
 *
 * `host` est l'HÔTE COMMUN de l'en-tête, du fil et du composeur — c'est LUI
 * que l'écran doit poser en `ref` sur son conteneur racine, à côté de
 * `chromeStyleVars()`/`backdropStyleVars()`.
 */

export type ThreadChromeSignals = {
  readonly host: RefObject<HTMLDivElement | null>;
  readonly onComposerFocus: () => void;
  readonly onComposerBlur: (event: FocusEvent<HTMLElement>) => void;
  readonly dayPillLabel: string | null;
  /**
   * « LE LECTEUR REGARDE-T-IL LE BAS ? » — le MÊME verdict que celui qui
   * gouverne le bouton « revenir en bas », exposé parce qu'un SECOND
   * consommateur en a besoin : l'indicateur de frappe (#5793), une cellule qui
   * apparaît APRÈS le dernier message et pousse donc le bas du défileur. Sans
   * lui, l'écran recalculerait « suis-je en bas ? » avec sa propre marge —
   * deux lois de proximité pour un seul écran, et la divergence ne se verrait
   * que sur celle qu'on ne teste pas.
   */
  readonly nearBottom: boolean;
  readonly scrollButtonVisible: boolean;
  readonly scrollButtonUnreadCount: number;
  readonly scrollButtonSenderName: string | null;
  readonly scrollButtonPreviewText: string | null;
  readonly onScrollToBottom: () => void;
};

export function useThreadChromeSignals(input: {
  readonly scroller: RefObject<HTMLElement | null>;
  readonly mode: ConversationReadingMode;
  readonly placed: readonly PlacedMessage[];
  readonly virtualizer: Virtualizer<HTMLElement, Element>;
  readonly messages: readonly Message[];
  readonly viewerId: string;
  readonly group: boolean;
  readonly readerLanguages: readonly string[];
  readonly noteProgrammaticScroll: () => void;
}): ThreadChromeSignals {
  const { scroller, mode, placed, virtualizer, messages, viewerId, group, readerLanguages, noteProgrammaticScroll } = input;
  const ready = placed.length > 0;

  const host = useRef<HTMLDivElement | null>(null);
  const [composerEngaged, setComposerEngaged] = useState(false);
  // `subscribeGesture` — identité STABLE (`scroller`, un objet ref, ne change
  // jamais) : l'abonnement ne se refait pas à chaque rendu.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const subscribeGesture = useMemo(() => createScrollerGestureSubscriber(scroller), []);
  useThreadChrome(host, {
    mode,
    // Aucun état de recherche n'existe côté web (`thread-header.tsx`, le
    // bouton « Rechercher » n'a pas encore d'`onClick`) — issue compagnon,
    // pas ce lot (§1.5 de la spécification).
    searchOpen: false,
    composerEngaged,
    subscribeGesture,
    ready,
  });
  const onComposerFocus = useCallback(() => setComposerEngaged(true), []);
  const onComposerBlur = useCallback((event: FocusEvent<HTMLElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setComposerEngaged(false);
  }, []);

  /**
   * « PRÈS DU BAS » — miroir `isCurrentlyNearBottom`
   * (`MessageListViewController.swift:2886-2887`) : recalculé sur CHAQUE
   * `scroll`, l'état React ne bouge QUE sur un changement de verdict.
   */
  const [nearBottom, setNearBottom] = useState(true);
  useEffect(() => {
    const el = scroller.current;
    if (el === null) return;
    const check = () => {
      const next = isNearBottom({
        totalSize: virtualizer.getTotalSize(),
        scrollOffset: el.scrollTop,
        viewportHeight: el.clientHeight,
      });
      setNearBottom((previous) => (previous === next ? previous : next));
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    return () => el.removeEventListener('scroll', check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed.length]);

  /**
   * LE COMPTE DE NON-LUS SOUS LA FENÊTRE — miroir `pendingUnreadCount`
   * (`lib/view/unread-below.ts`). Lit le CACHE (`messages`), jamais le
   * transport.
   */
  const [unreadBelow, dispatchUnreadBelow] = useReducer(reduceUnreadBelow, initialUnreadBelowState());
  useEffect(() => {
    dispatchUnreadBelow({
      type: 'messages',
      messages: messages.map((m) => ({ id: m.id, senderId: m.senderId })),
      viewerId,
      nearBottom,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);
  useEffect(() => {
    if (nearBottom) dispatchUnreadBelow({ type: 'near-bottom' });
  }, [nearBottom]);

  /**
   * « DEMANDER LE BAS, C'EST DÉCLARER LE REGARDER » — miroir
   * `ConversationView+ScrollIndicators.swift:52-59`. L'ancrage passe par la
   * loi PARTAGÉE (`pinToBottom`), la MÊME que l'ouverture du fil : le bas du
   * DÉFILEUR (`scrollHeight − clientHeight`, clampé par le navigateur), pas
   * la fin du dernier item — `main` porte encore un `padding-bottom` qu'un
   * `scrollToIndex(align: 'end')` laissait sous la fenêtre.
   */
  const onScrollToBottom = useCallback(() => {
    const element = scroller.current;
    if (element === null) return;
    pinToBottom(element, { frames: SCROLL_TO_BOTTOM_FRAMES, onFirstFrame: noteProgrammaticScroll });
    dispatchUnreadBelow({ type: 'reset' });
  }, [scroller, noteProgrammaticScroll]);

  /**
   * LA PILULE DE JOUR COLLANTE — recalculée à chaque rendu déclenché par le
   * virtualiseur (changement de plage visible au défilement), même cadence
   * que `scene.elected`. `scroller.current?.scrollTop ?? 0` : `null` au
   * tout premier rendu, un fil qui s'ouvre au sommet de son premier message
   * ne doit rien coller.
   */
  const virtualItems: readonly VirtualRowSpan[] = virtualizer.getVirtualItems();
  const dayPillLabel = stickyDayOf({
    placed,
    items: virtualItems,
    scrollOffset: scroller.current?.scrollTop ?? 0,
  });

  /**
   * L'APERÇU DU BOUTON « REVENIR EN BAS » — le PRISME, jamais `content` brut
   * (même règle que `replyToServed` de `routes/thread.tsx`).
   */
  const lastUnreadMessage = messages.find((m) => m.id === unreadBelow.lastUnreadId);
  const lastUnreadServed =
    lastUnreadMessage === undefined
      ? undefined
      : served({
          preferredLanguages: readerLanguages,
          originalLanguage: lastUnreadMessage.originalLanguage,
          translations: lastUnreadMessage.translations,
          original: lastUnreadMessage.content,
        });

  return {
    host,
    onComposerFocus,
    onComposerBlur,
    dayPillLabel,
    nearBottom,
    /**
     * CORRECTION revue #5774, défaut majeur 6 — le Résumé Vivant (`mode ===
     * 'summary'`) n'a AUCUNE liste qui défile (`chromeHiding`, même garde) :
     * `nearBottom` y reste figé à sa dernière valeur connue (l'effet qui le
     * recalcule lit `scroller.current`, un `<main>` sans rangée montée en
     * Résumé), donc le bouton restait monté, INERTE, et volait le bord droit
     * du CTA « Reprendre le fil » (mesuré : `elementFromPoint` au-dessus du
     * CTA rendait le bouton, pas le CTA — chevauchement PHYSIQUE, pas
     * seulement visuel). Même porte que la loi du chrome : UNE SOURCE.
     */
    scrollButtonVisible: mode !== 'summary' && !nearBottom,
    scrollButtonUnreadCount: unreadBelow.count,
    scrollButtonSenderName: group ? (lastUnreadMessage?.sender?.displayName ?? null) : null,
    scrollButtonPreviewText: lastUnreadServed?.text ?? null,
    onScrollToBottom,
  };
}
