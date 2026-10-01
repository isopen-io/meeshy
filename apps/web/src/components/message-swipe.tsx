import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

import { GlyphSvg } from '@/components/glyph';
import { THREAD_STATES_GLYPHS } from '@/components/glyphs-thread-states';
import { dayLabel, time } from '@/lib/grouping';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import {
  messageSwipeOffset,
  messageSwipeOutcome,
  readingDelta,
  replyDirectionOf,
  swipeProgress,
  swipeResistanceOf,
  swipeYieldsTo,
  type MessageSwipeRules,
  type SwipeOutcome,
} from '@/lib/view/swipe';

/**
 * **GLISSER UN MESSAGE : → RÉPONDRE, ← TRANSFÉRER** (#7559) — miroir de
 * `BubbleSwipeContainer` (`MessageListView.swift`), posé par `ThreadModes`
 * sur le nœud qui enveloppe LES DEUX peaux (rangée plate et bulle) : un mode
 * ajouté demain glisse sans rien câbler.
 *
 * La loi est `lib/view/swipe.ts`, la MÊME que le glissé d'un commentaire
 * (`comment-swipe.tsx`) : seuils 22 px / 3:1 (48 px / 4:1 sur audio et
 * vidéo), piste 72 px, élastique 15 %, validation 66 px. Sous le seuil,
 * l'espace libéré montre le JOUR et l'HEURE du message ; au seuil, le glyphe
 * de l'action les remplace et l'appareil vibre une fois.
 *
 * **Ce qui neutralise le geste** : aucune action (mode SÉLECTION, rangée
 * système — l'hôte passe `actions={undefined}`), une SOURIS (elle sélectionne
 * du texte — elle a l'icône ci-dessous), un geste né sur une piste de lecture
 * (`swipeYieldsTo`). L'appui long n'est pas concurrent : il s'annule au-delà
 * de 6 px (`long-press.ts`), bien avant l'engagement.
 *
 * **L'ICÔNE « RÉPONDRE » DU POINTEUR FIN** (#8899) — là où le glissé n'existe
 * pas (souris, clavier), un bouton au bord LIBRE de la rangée apparaît au
 * survol et au focus (`thread-menu.css`, `(hover: hover) and (pointer: fine)`
 * seulement) et appelle la MÊME action. Le menu reste le troisième chemin :
 * aucun geste n'est le seul.
 */

export type MessageSwipeActions = {
  readonly canReply: boolean;
  readonly canForward: boolean;
  readonly onAction: (outcome: SwipeOutcome) => void;
};

type Start = { readonly id: number; readonly x: number; readonly y: number; readonly direction: 'ltr' | 'rtl' };

const vibrate = (ms: number): void => {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(ms);
};

const directionOf = (element: Element): 'ltr' | 'rtl' => {
  const computed = element.ownerDocument.defaultView?.getComputedStyle(element).direction;
  if (computed === 'rtl') return 'rtl';
  return element.closest('[dir="rtl"]') === null ? 'ltr' : 'rtl';
};

const reducedMotion = (): boolean =>
  typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Le clic synthétique qui suit un `pointerup` arrive dans la même tâche ou la suivante. */
const SWALLOW_CLICK_MS = 400;

/** Le ressort iOS (`.spring(response: 0.42, dampingFraction: 0.62)`) approché par une courbe à dépassement. */
const SPRING_BACK = 'transform 420ms cubic-bezier(0.34, 1.56, 0.64, 1)';

export function MessageSwipe({
  actions,
  flat,
  isMine,
  attachments,
  createdAt,
  locale,
  children,
}: {
  /** Absent ⇒ rien ne glisse et aucune icône (sélection, rangée système). */
  readonly actions: MessageSwipeActions | undefined;
  readonly flat: boolean;
  readonly isMine: boolean;
  readonly attachments: readonly { readonly mimeType: string }[] | undefined;
  readonly createdAt: Date | string;
  readonly locale: string;
  readonly children: ReactNode;
}) {
  /** Le décalage dans le SENS DE LECTURE ; `sign` le rend physique. */
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [sign, setSign] = useState<1 | -1>(1);
  const start = useRef<Start | null>(null);
  const engaged = useRef(false);
  const crossed = useRef(false);
  const current = useRef(0);
  const swallowClickUntil = useRef(0);

  const rules: MessageSwipeRules | undefined =
    actions === undefined
      ? undefined
      : {
          resistance: swipeResistanceOf(attachments),
          replyDirection: replyDirectionOf({ flat, isMine }),
          canReply: actions.canReply,
          canForward: actions.canForward,
        };
  const rulesRef = useRef(rules);
  rulesRef.current = rules;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const reset = useCallback(() => {
    start.current = null;
    engaged.current = false;
    crossed.current = false;
    current.current = 0;
    setDragging(false);
    setOffset(0);
  }, []);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (rulesRef.current === undefined || event.pointerType === 'mouse' || !event.isPrimary) return;
    if (swipeYieldsTo(event.target)) return;
    start.current = { id: event.pointerId, x: event.clientX, y: event.clientY, direction: directionOf(event.currentTarget) };
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const origin = start.current;
    const active = rulesRef.current;
    if (origin === null || origin.id !== event.pointerId || active === undefined) return;
    const next = messageSwipeOffset(readingDelta(event.clientX - origin.x, origin.direction), event.clientY - origin.y, active);
    if (next === null) return;
    if (!engaged.current) {
      engaged.current = true;
      setDragging(true);
      setSign(origin.direction === 'rtl' ? -1 : 1);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    current.current = next;
    setOffset(next);
    const armed = messageSwipeOutcome(next, active) !== null;
    if (armed && !crossed.current) vibrate(10);
    crossed.current = armed;
  }, []);

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const origin = start.current;
      if (origin === null || origin.id !== event.pointerId) return;
      if (engaged.current) swallowClickUntil.current = Date.now() + SWALLOW_CLICK_MS;
      const active = rulesRef.current;
      const outcome = engaged.current && active !== undefined ? messageSwipeOutcome(current.current, active) : null;
      reset();
      if (outcome === null) return;
      vibrate(20);
      actionsRef.current?.onAction(outcome);
    },
    [reset],
  );

  const onClickCapture = useCallback((event: { preventDefault: () => void; stopPropagation: () => void }) => {
    if (Date.now() > swallowClickUntil.current) return;
    swallowClickUntil.current = 0;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const outcome = rules === undefined ? null : messageSwipeOutcome(offset, rules);
  const physical = offset * sign;
  const progress = swipeProgress(offset);
  const replyable = actions !== undefined && actions.canReply;
  const language = currentInterfaceLanguage();

  return (
    <div
      data-message-swipe
      {...(dragging ? { 'data-message-swipe-active': '' } : {})}
      className="message-swipe"
      style={{ position: 'relative', touchAction: 'pan-y' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={reset}
      onClickCapture={onClickCapture}
    >
      {Math.abs(offset) > 8 ? (
        <span
          aria-hidden
          data-message-swipe-indicator={outcome ?? 'stamp'}
          className="pointer-events-none absolute inset-y-0 grid place-items-center"
          style={{
            /* Le bord que la rangée LIBÈRE en glissant. */
            ...(physical > 0 ? { left: 0 } : { right: 0 }),
            width: Math.max(64, Math.abs(offset)),
            opacity: Math.min(1, Math.abs(offset) / 24),
            color: outcome === null ? 'var(--color-ios-ink-3)' : 'var(--color-ios-brand)',
          }}
        >
          {outcome === null ? (
            <span className="flex flex-col items-center text-time leading-tight">
              <span>{dayLabel(createdAt, { locale })}</span>
              <span className="font-semibold">{time(createdAt)}</span>
            </span>
          ) : (
            <span style={{ transform: `scale(${0.8 + 0.2 * progress})` }}>
              <GlyphSvg glyph={outcome === 'reply' ? THREAD_STATES_GLYPHS.arrowBendUpLeft : THREAD_STATES_GLYPHS.arrowBendUpRight} size={22} />
            </span>
          )}
        </span>
      ) : null}
      <div
        data-message-swipe-content
        style={{
          transform: offset === 0 ? undefined : `translateX(${physical}px)`,
          transition: dragging || reducedMotion() ? 'none' : SPRING_BACK,
        }}
      >
        {children}
      </div>
      {replyable && !dragging ? (
        <button
          type="button"
          data-message-swipe-reply
          data-edge={flat || !isMine ? 'end' : 'start'}
          className="message-swipe-reply"
          aria-label={translate(language, 'message.menu.reply')}
          title={translate(language, 'message.menu.reply')}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            actions.onAction('reply');
          }}
        >
          <span className="message-swipe-reply-disc" aria-hidden>
            <GlyphSvg glyph={THREAD_STATES_GLYPHS.arrowBendUpLeft} size={16} />
          </span>
        </button>
      ) : null}
    </div>
  );
}
