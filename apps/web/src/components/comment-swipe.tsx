import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

import { GlyphSvg } from '@/components/glyph';
import { FEED_GLYPHS } from '@/components/glyphs-feed';
import {
  commentSwipeCommits,
  commentSwipeOffset,
  commentSwipeProgress,
  readingDelta,
} from '@/lib/view/comment-swipe';

/**
 * **LA RANGÉE QU'ON GLISSE POUR RÉPONDRE** (#8583) — miroir de
 * `commentSwipeToReply(onReply:)` (`CommentSwipeToReply.swift`) : la rangée
 * suit le doigt vers la DROITE, une flèche « répondre » grandit dans l'espace
 * libéré, et relâcher au-delà du seuil (66 px) ouvre le composeur sur ce
 * commentaire. En deçà, le geste s'annule et la rangée revient au repos.
 *
 * **LE DÉFILEMENT GARDE LA MAIN** — `touch-action: pan-y` laisse le navigateur
 * défiler verticalement, et la loi pure (`lib/view/comment-swipe.ts`) n'engage
 * le glissé que s'il est trois fois plus horizontal que vertical, au-delà de
 * 22 px — la même règle que la bulle iOS. Un défilement que le navigateur
 * prend en charge annule le geste (`pointercancel`).
 *
 * **LE TOUCHER SEUL** — une souris qui glisse SÉLECTIONNE du texte, elle ne
 * répond pas. Le clavier et la souris ont le bouton « Répondre » de la rangée
 * (`comment-row.tsx`), qui appelle le MÊME rappel : deux portes, un geste.
 *
 * Un glissé qui a engagé la rangée AVALE le clic qui le suit : lâcher le
 * doigt sur le cœur ou sur le nom ne doit pas aimer ni ouvrir un profil.
 */

type Start = { readonly id: number; readonly x: number; readonly y: number; readonly direction: 'ltr' | 'rtl' };

const vibrate = (ms: number): void => {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(ms);
};

const directionOf = (element: Element): 'ltr' | 'rtl' => {
  const view = element.ownerDocument.defaultView;
  const computed = view?.getComputedStyle(element).direction;
  if (computed === 'rtl') return 'rtl';
  return element.closest('[dir="rtl"]') === null ? 'ltr' : 'rtl';
};

const reducedMotion = (): boolean =>
  typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Le clic synthétique qui suit un `pointerup` arrive dans la même tâche ou la suivante. */
const SWALLOW_CLICK_MS = 400;

/** Le ressort iOS (`.spring(response: 0.42, dampingFraction: 0.62)`) approché par une courbe à dépassement. */
const SPRING_BACK = 'transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1)';

export function CommentSwipe({
  onReply,
  children,
}: {
  /** Absent ⇒ la rangée ne glisse pas (en vol, visiteur anonyme, en édition). */
  readonly onReply: (() => void) | undefined;
  readonly children: ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [sign, setSign] = useState<1 | -1>(1);
  const start = useRef<Start | null>(null);
  const engaged = useRef(false);
  const crossed = useRef(false);
  const current = useRef(0);
  /* L'INSTANT jusqu'auquel un clic est avalé — jamais un drapeau qui
     attendrait « le prochain clic » : un glissé au doigt n'en produit
     souvent AUCUN, et le drapeau resté levé mangerait le tap suivant. */
  const swallowClickUntil = useRef(0);

  const reset = useCallback(() => {
    start.current = null;
    engaged.current = false;
    crossed.current = false;
    current.current = 0;
    setDragging(false);
    setOffset(0);
  }, []);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (onReply === undefined || event.pointerType === 'mouse' || !event.isPrimary) return;
      start.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        direction: directionOf(event.currentTarget),
      };
    },
    [onReply],
  );

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = start.current;
    if (origin === null || origin.id !== event.pointerId) return;
    const dx = readingDelta(event.clientX - origin.x, origin.direction);
    const next = commentSwipeOffset(dx, event.clientY - origin.y);
    if (next === null) return;
    if (!engaged.current) {
      engaged.current = true;
      setDragging(true);
      setSign(origin.direction === 'rtl' ? -1 : 1);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    current.current = next;
    setOffset(next);
    const armed = commentSwipeCommits(next);
    if (armed && !crossed.current) vibrate(10);
    crossed.current = armed;
  }, []);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const origin = start.current;
      if (origin === null || origin.id !== event.pointerId) return;
      if (engaged.current) swallowClickUntil.current = Date.now() + SWALLOW_CLICK_MS;
      const replies = engaged.current && commentSwipeCommits(current.current);
      reset();
      if (!replies) return;
      vibrate(20);
      onReply?.();
    },
    [onReply, reset],
  );

  const onClickCapture = useCallback((event: { preventDefault: () => void; stopPropagation: () => void }) => {
    if (Date.now() > swallowClickUntil.current) return;
    swallowClickUntil.current = 0;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  if (onReply === undefined) return <>{children}</>;

  const progress = commentSwipeProgress(offset);
  const armed = commentSwipeCommits(offset);
  return (
    <div
      data-comment-swipe
      {...(dragging ? { 'data-comment-swipe-active': '' } : {})}
      className="relative"
      style={{ touchAction: 'pan-y' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={reset}
      onClickCapture={onClickCapture}
    >
      {offset > 0 ? (
        <span
          aria-hidden
          data-comment-swipe-indicator={armed ? 'armed' : 'tracking'}
          className="pointer-events-none absolute inset-y-0 grid place-items-center overflow-hidden"
          style={{
            insetInlineStart: 0,
            width: offset,
            color: 'var(--color-ios-brand)',
            opacity: armed ? 1 : 0.55 * progress + 0.2,
          }}
        >
          <span style={{ transform: `scale(${0.6 + 0.4 * progress})`, transition: 'opacity 150ms ease-in-out' }}>
            <GlyphSvg glyph={FEED_GLYPHS.arrowBendUpLeft} size={18} />
          </span>
        </span>
      ) : null}
      <div
        data-comment-swipe-content
        style={{
          /* Le décalage est dans le SENS DE LECTURE : en RTL, la rangée part
             vers la gauche, sous le doigt. */
          transform: offset === 0 ? undefined : `translateX(${offset * sign}px)`,
          transition: dragging || reducedMotion() ? 'none' : SPRING_BACK,
        }}
      >
        {children}
      </div>
    </div>
  );
}
