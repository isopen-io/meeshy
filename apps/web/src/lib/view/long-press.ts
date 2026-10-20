import { useCallback, useMemo, useRef } from 'react';
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';

import { impact } from './haptics';

/**
 * LE GESTE D'OUVERTURE DU MENU DU MESSAGE (#5814) — miroir
 * `MessageListView.swift:348` (`LongPressGesture(minimumDuration: 0.35,
 * maximumDistance: 6)`), durée ET tolérance reprises telles quelles depuis
 * #11207 (D-209) : les 500 ms du critère de #5814 faisaient attendre le web
 * une demi-seconde là où iOS ouvre en 0,35 s. UN seul seuil pour tous les
 * consommateurs (menu du message, avatar, sélecteur d'emoji, visionneuse,
 * disque du Flux, fiche de contact).
 *
 * `pressReducer` est une machine PURE, testable sans DOM ni minuteur réel —
 * le hook plus bas ne fait qu'y BRANCHER un `setTimeout`, jamais l'inverse.
 */

export const LONG_PRESS_MS = 350;
export const LONG_PRESS_MAX_DISTANCE_PX = 6;

export type PressState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'pressing'; readonly x: number; readonly y: number; readonly at: number }
  | { readonly phase: 'open' }
  | { readonly phase: 'cancelled' };

export type PressEvent =
  | { readonly type: 'down'; readonly x: number; readonly y: number; readonly at: number }
  | { readonly type: 'move'; readonly x: number; readonly y: number }
  | { readonly type: 'tick'; readonly elapsedMs: number }
  | { readonly type: 'up' }
  | { readonly type: 'cancel' };

/**
 * `tick` porte le temps ÉCOULÉ depuis `down` (jamais une horloge absolue —
 * l'appelant du DOM, lui, compare des `Date.now()`, mais la loi pure ne
 * connaît que la durée). En dessous de `LONG_PRESS_MS`, la pression reste
 * `pressing` — c'est `tick(LONG_PRESS_MS)` seul qui bascule sur `open`.
 */
export function pressReducer(state: PressState, event: PressEvent): PressState {
  switch (event.type) {
    case 'down':
      return { phase: 'pressing', x: event.x, y: event.y, at: event.at };
    case 'move': {
      if (state.phase !== 'pressing') return state;
      const dx = event.x - state.x;
      const dy = event.y - state.y;
      return Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MAX_DISTANCE_PX ? { phase: 'cancelled' } : state;
    }
    case 'tick':
      if (state.phase !== 'pressing') return state;
      return event.elapsedMs >= LONG_PRESS_MS ? { phase: 'open' } : state;
    case 'up':
      return state.phase === 'pressing' ? { phase: 'idle' } : state;
    case 'cancel':
      return { phase: 'cancelled' };
    default:
      return state;
  }
}

export type LongPressAnchor = { readonly element: HTMLElement; readonly rect: DOMRect };

/**
 * **UN GESTE D'OUVERTURE N'OUVRE QU'UN MENU** (#7828) — le plus PROCHE.
 *
 * L'avatar d'un auteur porte son propre menu, et il vit DANS la rangée qui
 * porte celui du message : sans arbitrage, l'appui long qui remonte ouvrait
 * les deux, ou pire, seulement celui du message. Le premier hôte qui voit
 * l'événement (le plus profond, la propagation montant) le RÉCLAME ; les
 * hôtes qui le voient ensuite l'ignorent.
 *
 * Une réclamation plutôt qu'un `stopPropagation` : l'appui doit continuer de
 * monter jusqu'au `document`, où `useRovingMenu` referme un menu ouvert sur
 * tout appui qui tombe hors de lui. Arrêter l'événement aurait laissé un menu
 * ouvert survivre à un appui sur un avatar.
 *
 * Seuls les trois gestes qui OUVRENT se réclament (appui, clic droit, touche
 * menu) : un relâcher sur l'avatar après un appui commencé sur le texte doit
 * encore annuler le minuteur de la rangée.
 */
const CLAIMED = new WeakSet<Event>();

function claims(event: { readonly nativeEvent: Event }): boolean {
  if (CLAIMED.has(event.nativeEvent)) return false;
  CLAIMED.add(event.nativeEvent);
  return true;
}

/**
 * LES DEUX DÉCLENCHEURS CLAVIER DE L'APPUI LONG — la touche `ContextMenu` et
 * `Maj+F10`. Écrits UNE fois : le menu d'un message et le disque du Flux
 * (#6456) répondent au même geste, et deux écritures du même prédicat finissent
 * par ne plus reconnaître la même touche.
 */
export function isContextMenuKey(event: { readonly key: string; readonly shiftKey: boolean }): boolean {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);
}

/**
 * LA PRESSION SE VOIT PENDANT L'ATTENTE (#11207). `data-pressing` est posé sur
 * l'élément tenu dès `pointerdown` ; `styles/press-feedback.css` le presse à
 * 0,97 (coupé sous `prefers-reduced-motion`). Il est retiré AVANT la mesure de
 * l'ancre : l'aperçu du menu clone la rangée à sa taille réelle, jamais
 * pressée.
 */
export const PRESSING_ATTRIBUTE = 'data-pressing';

const HELD_CONTEXTMENU_GRACE_MS = 300;

/**
 * Avale le `contextmenu` du doigt qui vient d'ouvrir, jusqu'à ce qu'il se
 * lève. Écouté sur la FENÊTRE : le menu ouvert couvre la rangée, et le
 * relâcher tombe sur son voile, jamais sur l'élément qui a ouvert.
 */
const swallowHeldContextMenu = (until: { current: number }): void => {
  until.current = Number.POSITIVE_INFINITY;
  const settle = (event: Event): void => {
    window.removeEventListener('pointerup', settle, true);
    window.removeEventListener('pointercancel', settle, true);
    until.current = event.type === 'pointercancel' ? Date.now() + HELD_CONTEXTMENU_GRACE_MS : 0;
  };
  window.addEventListener('pointerup', settle, true);
  window.addEventListener('pointercancel', settle, true);
};

/**
 * LE HOOK — vit UNE FOIS dans l'hôte (`thread.tsx`), jamais une instance par
 * rangée virtualisée (§ 5 étape 5 de la spécification) : chaque gestionnaire
 * lit `event.currentTarget`, jamais une référence figée à un élément — la
 * délégation qui rend le hook réutilisable sur cinquante rangées montées.
 *
 * `keydown` répond à `ContextMenu` (la touche dédiée) et `Shift+F10` — les
 * DEUX déclencheurs clavier du menu contextuel, comme `contextmenu` en
 * répond au clic droit.
 *
 * L'OUVERTURE SE SENT, UNE FOIS : `impact('medium')` (`haptics.ts`), le retour
 * d'iOS à l'ouverture d'un menu contextuel. Un appui tenu au doigt sur Android
 * émet AUSSI `contextmenu` pendant la tenue (vers 500 ms, avant ou juste
 * après un `pointercancel` selon le moteur) : tant que le doigt qui a ouvert
 * est posé — et `HELD_CONTEXTMENU_GRACE_MS` après son `pointercancel` —, il
 * est avalé au lieu d'ouvrir, et de vibrer, une seconde fois. Le RELÂCHER
 * lève l'avalement aussitôt : un clic droit qui suit un appui long ouvre.
 */
export function useLongPress(options: {
  readonly onOpen: (anchor: LongPressAnchor) => void;
}) {
  const stateRef = useRef<PressState>({ phase: 'idle' });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressedRef = useRef<HTMLElement | null>(null);
  const swallowContextMenuUntil = useRef(0);
  /**
   * LES SIX GESTIONNAIRES SONT STABLES (revue #5814) — ils sont étalés sur
   * CHAQUE rangée montée, et l'écran du fil se re-rend à chaque tick d'horloge
   * et à chaque frame de scène. Recréés à chaque rendu, ils faisaient
   * réattacher six propriétés d'événement sur cinquante rangées pour rien.
   * `onOpen` passe par une référence : le hook n'a alors AUCUNE dépendance
   * qui change, et l'appelant garde le droit d'écrire une fermeture en ligne.
   */
  const onOpenRef = useRef(options.onOpen);
  onOpenRef.current = options.onOpen;

  const release = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pressedRef.current?.removeAttribute(PRESSING_ATTRIBUTE);
    pressedRef.current = null;
  }, []);

  const open = useCallback(
    (target: HTMLElement) => {
      release();
      stateRef.current = { phase: 'open' };
      impact('medium');
      onOpenRef.current({ element: target, rect: target.getBoundingClientRect() });
    },
    [release],
  );

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !claims(event)) return;
    const target = event.currentTarget;
    release();
    stateRef.current = { phase: 'pressing', x: event.clientX, y: event.clientY, at: Date.now() };
    target.setAttribute(PRESSING_ATTRIBUTE, '');
    pressedRef.current = target;
    timerRef.current = setTimeout(() => {
      if (stateRef.current.phase !== 'pressing') return;
      swallowHeldContextMenu(swallowContextMenuUntil);
      open(target);
    }, LONG_PRESS_MS);
  }, [release, open]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (stateRef.current.phase !== 'pressing') return;
    const dx = event.clientX - stateRef.current.x;
    const dy = event.clientY - stateRef.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MAX_DISTANCE_PX) {
      stateRef.current = { phase: 'cancelled' };
      release();
    }
  }, [release]);

  const onPointerUp = useCallback(() => {
    if (stateRef.current.phase === 'pressing') stateRef.current = { phase: 'idle' };
    release();
  }, [release]);

  const onContextMenu = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (!claims(event)) return;
    event.preventDefault();
    if (Date.now() < swallowContextMenuUntil.current) return;
    open(event.currentTarget);
  }, [open]);

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (!isContextMenuKey(event) || !claims(event)) return;
    event.preventDefault();
    open(event.currentTarget);
  }, [open]);

  return useMemo(
    () => ({
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onContextMenu,
      onKeyDown,
    }),
    [onPointerDown, onPointerMove, onPointerUp, onContextMenu, onKeyDown],
  );
}
