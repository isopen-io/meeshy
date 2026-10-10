import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

import { GlyphSvg } from '@/components/glyph';
import { NOTIFICATIONS_GLYPHS } from '@/components/glyphs-notifications';
import {
  notificationSwipeCommits,
  notificationSwipeOffset,
  notificationSwipeProgress,
  readingDelta,
} from '@/lib/view/notification-swipe';

/**
 * **LA RANGÉE DE LA CLOCHE QU'ON GLISSE POUR LA VIDER** (#8960) — miroir du
 * glissement vers la gauche de la cloche iOS (#8958) : la rangée suit le doigt
 * vers la FIN de la ligne, une corbeille grandit dans l'espace libéré, et
 * relâcher au-delà du seuil (66 px) supprime la notification. En deçà, le
 * geste s'annule et la rangée revient au repos.
 *
 * **LE DÉFILEMENT GARDE LA MAIN** — `touch-action: pan-y`, et la loi pure
 * (`lib/view/notification-swipe.ts`) n'engage le glissé que s'il est trois
 * fois plus horizontal que vertical, au-delà de 22 px.
 *
 * **LE TOUCHER SEUL** — la souris et le clavier ont le menu de la rangée
 * (`notification-row-menu.tsx`), qui appelle le MÊME rappel.
 *
 * Un glissé qui a engagé la rangée AVALE le clic qui le suit : lâcher le doigt
 * sur la rangée ne doit pas l'ouvrir.
 */

type Start = { readonly id: number; readonly x: number; readonly y: number; readonly direction: 'ltr' | 'rtl' };

const vibrate = (ms: number): void => {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(ms);
};

const directionOf = (element: Element): 'ltr' | 'rtl' => {
  const view = element.ownerDocument.defaultView;
  if (view?.getComputedStyle(element).direction === 'rtl') return 'rtl';
  return element.closest('[dir="rtl"]') === null ? 'ltr' : 'rtl';
};

const reducedMotion = (): boolean =>
  typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;

const SWALLOW_CLICK_MS = 400;

const SPRING_BACK = 'transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1)';

export function NotificationSwipe({
  onDelete,
  background,
  children,
}: {
  readonly onDelete: () => void;
  /** Le fond OPAQUE de la rangée pendant le glissé — il couvre la corbeille ; au repos, la rangée garde le sien. */
  readonly background: string;
  readonly children: ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [sign, setSign] = useState<1 | -1>(1);
  const start = useRef<Start | null>(null);
  const engaged = useRef(false);
  const crossed = useRef(false);
  const current = useRef(0);
  const swallowClickUntil = useRef(0);

  const reset = useCallback(() => {
    start.current = null;
    engaged.current = false;
    crossed.current = false;
    current.current = 0;
    setDragging(false);
    setOffset(0);
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' || !event.isPrimary) return;
    start.current = { id: event.pointerId, x: event.clientX, y: event.clientY, direction: directionOf(event.currentTarget) };
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = start.current;
    if (origin === null || origin.id !== event.pointerId) return;
    const next = notificationSwipeOffset(readingDelta(event.clientX - origin.x, origin.direction), event.clientY - origin.y);
    if (next === null) return;
    if (!engaged.current) {
      engaged.current = true;
      setDragging(true);
      setSign(origin.direction === 'rtl' ? -1 : 1);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    current.current = next;
    setOffset(next);
    const armed = notificationSwipeCommits(next);
    if (armed && !crossed.current) vibrate(10);
    crossed.current = armed;
  }, []);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const origin = start.current;
      if (origin === null || origin.id !== event.pointerId) return;
      if (engaged.current) swallowClickUntil.current = Date.now() + SWALLOW_CLICK_MS;
      const deletes = engaged.current && notificationSwipeCommits(current.current);
      reset();
      if (!deletes) return;
      vibrate(20);
      onDelete();
    },
    [onDelete, reset],
  );

  const onClickCapture = useCallback((event: { preventDefault: () => void; stopPropagation: () => void }) => {
    if (Date.now() > swallowClickUntil.current) return;
    swallowClickUntil.current = 0;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const width = Math.abs(offset);
  const armed = notificationSwipeCommits(offset);
  return (
    <div
      data-notification-swipe
      {...(dragging ? { 'data-notification-swipe-active': '' } : {})}
      className="relative"
      /* Le rognage ne vit que PENDANT le glissé : au repos, le menu de la
         rangée doit pouvoir déborder. */
      style={{ touchAction: 'pan-y', ...(offset === 0 ? {} : { overflowX: 'clip' as const }) }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={reset}
      onClickCapture={onClickCapture}
    >
      {width > 0 ? (
        <span
          aria-hidden
          data-notification-swipe-indicator={armed ? 'armed' : 'tracking'}
          className="pointer-events-none absolute inset-y-0 grid place-items-center"
          style={{
            insetInlineEnd: 0,
            width,
            color: 'var(--color-on-state)',
            backgroundColor: 'var(--color-error)',
            opacity: armed ? 1 : 0.55 * notificationSwipeProgress(offset) + 0.35,
          }}
        >
          <span style={{ transform: `scale(${0.6 + 0.4 * notificationSwipeProgress(offset)})` }}>
            <GlyphSvg glyph={NOTIFICATIONS_GLYPHS.trash} size={18} />
          </span>
        </span>
      ) : null}
      <div
        data-notification-swipe-content
        style={{
          /* Le décalage est dans le SENS DE LECTURE : en RTL, la rangée part
             vers la droite, sous le doigt. */
          transform: offset === 0 ? undefined : `translateX(${offset * sign}px)`,
          ...(offset === 0 ? {} : { background }),
          transition: dragging || reducedMotion() ? 'none' : SPRING_BACK,
        }}
      >
        {children}
      </div>
    </div>
  );
}
