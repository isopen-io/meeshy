import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import {
  ROW_SWIPE_CELL,
  rowSwipeEngages,
  rowSwipeOffset,
  rowSwipePaint,
  rowSwipeSettle,
  rowSwipeWidths,
  type RowSwipeEdge,
  type RowSwipeSides,
  type RowSwipeWidths,
} from '@/lib/view/conversation-row-swipe';
import type { RowActionId, RowMenuItem } from '@/lib/view/row-actions';
import { routeKey, useOptionalRoute } from '@/lib/router';
import { claimOpenRowSwipe, dismissOpenRowSwipe, releaseOpenRowSwipe } from '@/lib/view/row-swipe-open';
import { readingDelta, swipeYieldsTo } from '@/lib/view/swipe';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';
import { impact } from '@/lib/view/haptics';

import { RowActionGlyph } from './row-actions';

import '@/styles/conversation-row-swipe.css';

/**
 * **LA LIGNE DE CONVERSATION QU'ON BALAIE** (#10580) — miroir de `SwipeableRow`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Primitives/SwipeableRow.swift`) : la
 * ligne suit le doigt, découvre les actions de son bord, s'ouvre au-delà de
 * 35 % de la zone (ou d'un coup sec) et revient en place sinon. La loi est
 * pure (`lib/view/conversation-row-swipe.ts`) ; ce fichier la branche au DOM.
 *
 * **AUCUN RENDU PENDANT LE GESTE** — le décalage s'écrit sur le `<li>` en
 * propriétés personnalisées (`styles/conversation-row-swipe.css`). React ne
 * connaît que le BORD montré et la PHASE, qui ne changent qu'à l'engagement,
 * au changement de bord et au relâcher.
 *
 * **LE DÉFILEMENT GARDE LA MAIN** — `touch-action: pan-y` sur la ligne, et un
 * geste n'engage que s'il est franchement horizontal.
 *
 * **LE TOUCHER SEUL** — la souris, le clavier et le lecteur d'écran gardent le
 * bouton « ⋮ » et le clic droit (`row-actions.tsx`), qui portent les MÊMES
 * actions.
 *
 * **UNE SEULE LIGNE OUVERTE** — `lib/view/row-swipe-open.ts`.
 */
export const ROW_SWIPE_SETTLE_MS = 400;

const SWALLOW_CLICK_MS = 400;
const VELOCITY_WINDOW_MS = 100;

type RowSwipePhase = 'dragging' | 'open' | 'closing';

export type RowSwipeShown = { readonly edge: RowSwipeEdge; readonly phase: RowSwipePhase };

type Sample = { readonly dx: number; readonly at: number };

type Gesture = {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly direction: 'ltr' | 'rtl';
  readonly base: number;
  readonly widths: RowSwipeWidths;
  readonly engaged: boolean;
  readonly samples: readonly Sample[];
};

const directionOf = (element: Element): 'ltr' | 'rtl' => {
  const view = element.ownerDocument.defaultView;
  if (view?.getComputedStyle(element).direction === 'rtl') return 'rtl';
  return element.closest('[dir="rtl"]') === null ? 'ltr' : 'rtl';
};

const reducedMotion = (): boolean =>
  typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;

const velocityOf = (samples: readonly Sample[]): number => {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (first === undefined || last === undefined || last.at <= first.at) return 0;
  return ((last.dx - first.dx) / (last.at - first.at)) * 1000;
};

const inActions = (target: EventTarget | null): boolean =>
  typeof Element !== 'undefined' && target instanceof Element && target.closest('[data-row-swipe-actions]') !== null;

type Swallowable = { readonly target: EventTarget | null; preventDefault: () => void; stopPropagation: () => void };

export function useConversationRowSwipe(sidesOf: () => RowSwipeSides) {
  const [shown, setShown] = useState<RowSwipeShown | null>(null);
  const [held, setHeld] = useState(false);
  const rowRef = useRef<HTMLLIElement | null>(null);
  const sidesRef = useRef(sidesOf);
  const gesture = useRef<Gesture | null>(null);
  const offset = useRef(0);
  const sign = useRef<1 | -1>(1);
  const active = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swallowClickUntil = useRef(0);

  useEffect(() => {
    sidesRef.current = sidesOf;
  });

  const paint = useCallback((next: number) => {
    offset.current = next;
    const element = rowRef.current;
    if (element === null) return;
    const { swipe, reveal, hide } = rowSwipePaint({ offset: next, sign: sign.current });
    element.style.setProperty('--row-swipe', swipe);
    element.style.setProperty('--row-reveal', reveal);
    if (hide !== null) element.style.setProperty('--row-hide', hide);
  }, []);

  const cancelSettle = useCallback(() => {
    if (settleTimer.current !== null) clearTimeout(settleTimer.current);
    settleTimer.current = null;
  }, []);

  const rest = useCallback(() => {
    cancelSettle();
    active.current = false;
    offset.current = 0;
    rowRef.current?.style.removeProperty('--row-swipe');
    rowRef.current?.style.removeProperty('--row-reveal');
    rowRef.current?.style.removeProperty('--row-hide');
    setShown(null);
  }, [cancelSettle]);

  const settle = useCallback(
    (target: number) => {
      cancelSettle();
      paint(target);
      if (target !== 0) {
        setShown({ edge: target > 0 ? 'leading' : 'trailing', phase: 'open' });
        setHeld(true);
        return;
      }
      setHeld(false);
      if (rowRef.current !== null) releaseOpenRowSwipe(rowRef.current);
      if (reducedMotion()) return rest();
      setShown((current) => (current === null ? null : { edge: current.edge, phase: 'closing' }));
      settleTimer.current = setTimeout(rest, ROW_SWIPE_SETTLE_MS);
    },
    [cancelSettle, paint, rest],
  );

  const close = useCallback(() => {
    if (!active.current) return;
    gesture.current = null;
    settle(0);
  }, [settle]);

  useEffect(
    () => () => {
      cancelSettle();
      if (rowRef.current !== null) releaseOpenRowSwipe(rowRef.current);
    },
    [cancelSettle],
  );

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLLIElement>) => {
    if (event.pointerType === 'mouse' || !event.isPrimary || swipeYieldsTo(event.target)) return;
    gesture.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      direction: directionOf(event.currentTarget),
      base: offset.current,
      widths: rowSwipeWidths(sidesRef.current()),
      engaged: false,
      samples: [],
    };
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLLIElement>) => {
      const current = gesture.current;
      if (current === null || current.id !== event.pointerId) return;
      const dx = readingDelta(event.clientX - current.x, current.direction);
      if (!current.engaged && !rowSwipeEngages(dx, event.clientY - current.y)) return;
      if (!current.engaged) {
        cancelSettle();
        active.current = true;
        sign.current = current.direction === 'rtl' ? -1 : 1;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        claimOpenRowSwipe({ element: event.currentTarget, close });
      }
      const sample = { dx, at: event.timeStamp };
      gesture.current = {
        ...current,
        engaged: true,
        samples: [...current.samples.filter((older) => sample.at - older.at <= VELOCITY_WINDOW_MS), sample],
      };
      const next = rowSwipeOffset({ base: current.base, dx, widths: current.widths });
      paint(next);
      setShown((previous) => {
        const edge: RowSwipeEdge = next > 0 ? 'leading' : next < 0 ? 'trailing' : (previous?.edge ?? (dx > 0 ? 'leading' : 'trailing'));
        return previous !== null && previous.edge === edge && previous.phase === 'dragging' ? previous : { edge, phase: 'dragging' };
      });
    },
    [cancelSettle, close, paint],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLLIElement>) => {
      const current = gesture.current;
      if (current === null || current.id !== event.pointerId) return;
      gesture.current = null;
      if (!current.engaged) return;
      swallowClickUntil.current = Date.now() + SWALLOW_CLICK_MS;
      const dx = readingDelta(event.clientX - current.x, current.direction);
      const target = rowSwipeSettle({ base: current.base, dx, velocity: velocityOf(current.samples), widths: current.widths });
      if (target !== current.base) impact('light');
      settle(target);
    },
    [settle],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLLIElement>) => {
      const current = gesture.current;
      if (current === null || current.id !== event.pointerId) return;
      gesture.current = null;
      if (current.engaged) settle(current.base);
    },
    [settle],
  );

  /**
   * Le clic qui suit un balayage est AVALÉ, et toucher le contenu d'une ligne
   * ouverte la referme sans ouvrir la conversation (`SwipeableRow` masque les
   * touchers du contenu tant que `openOffset != 0`). Un bouton d'action, lui,
   * reçoit toujours le sien.
   */
  const onClickCapture = useCallback(
    (event: Swallowable) => {
      if (inActions(event.target)) return;
      const afterSwipe = Date.now() <= swallowClickUntil.current;
      swallowClickUntil.current = 0;
      if (!afterSwipe && offset.current === 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (!afterSwipe) close();
    },
    [close],
  );

  return {
    shown,
    held,
    close,
    rowProps: { ref: rowRef, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClickCapture },
  };
}

/**
 * LE RETOUR MATÉRIEL ET ÉCHAP REFERMENT LA LIGNE, PAS LA LISTE — un composant
 * à part, monté seulement ligne ouverte : `useBackDismiss` pose son entrée
 * d'historique au montage (même raison que `RowMenuBackDismiss`).
 */
function RowSwipeBackDismiss({ onClose }: { readonly onClose: () => void }) {
  useBackDismiss(onClose, { escape: true });
  return null;
}

export function ConversationRowSwipeActions({
  shown,
  held,
  sides,
  label,
  onAction,
  onClose,
}: {
  readonly shown: RowSwipeShown;
  /** Vrai tant que la ligne est POSÉE ouverte — un nouveau balayage ne rend pas l'entrée d'historique. */
  readonly held: boolean;
  readonly sides: RowSwipeSides;
  /** Le nom du groupe d'actions, celui du menu de la ligne. */
  readonly label: string;
  readonly onAction: (id: RowActionId) => void;
  readonly onClose: () => void;
}) {
  const items: readonly RowMenuItem[] = sides[shown.edge];
  return (
    <>
      {held ? <RowSwipeBackDismiss onClose={onClose} /> : null}
      {items.length === 0 ? null : (
        <div role="group" aria-label={label} data-row-swipe-actions={shown.edge} className="row-swipe-actions">
          <div className="row-swipe-track" style={{ ['--row-swipe-zone' as string]: `${items.length * ROW_SWIPE_CELL}px` }}>
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                data-row-swipe-action={item.id}
                className="row-swipe-action text-check font-semibold"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onAction(item.id);
                  onClose();
                }}
              >
                <RowActionGlyph glyph={item.glyph} size={18} />
                <span className="max-w-full truncate">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * UNE LIGNE OUVERTE NE SURVIT PAS À LA VUE QUI LA MONTRAIT — l'hôte de la
 * liste remet ce qui fait sa vue (filtre, recherche) ; l'adresse s'y ajoute
 * quand il est monté sous le routeur. Avant la première image de la suivante.
 */
export function useDismissRowSwipeOnViewChange(view: string): void {
  const route = useOptionalRoute();
  const address = route === null ? '' : routeKey(route);
  useLayoutEffect(() => dismissOpenRowSwipe, [address, view]);
}
