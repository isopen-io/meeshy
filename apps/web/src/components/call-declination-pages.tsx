import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

import { declinationOffset, declinationTarget, latchAxis, type Axis } from '@/lib/calls/call-declination-swipe';

/**
 * **LES DÉCLINAISONS D'UN CADRE, DANS SA VIGNETTE** (#12685, #17821 C1.6) — sur le cadre choisi, un
 * glissement vertical passe d'une déclinaison à l'autre (sa version de base, sa version « Relief »…),
 * comme `CallFrameDeclinationPager` d'iOS. Les pages sont empilées dans la face de la vignette et ne
 * bougent que par `transform` (puis `opacity` sous « Réduire les animations ») : pendant le geste,
 * la page suit le doigt par une écriture directe, une par image (`requestAnimationFrame`), sans une
 * seule mise en page ni un rendu React. Des points sur le bord disent combien de déclinaisons, et
 * laquelle est posée.
 *
 * L'horizontal reste au carrousel : la vignette ne réclame au navigateur que le vertical
 * (`touch-action: pan-x`), l'axe se lit au premier mouvement (8 px) et se garde jusqu'au lever du
 * doigt ; un défilement que le navigateur reprend (`pointercancel`) ne fige rien. Le geste qui a
 * balayé n'est pas un toucher : son clic ne choisit et ne photographie rien.
 */

export type CarouselDeclinations = {
  /** Un aperçu par déclinaison, la base d'abord. */
  readonly pages: readonly ReactNode[];
  readonly index: number;
  readonly onSelect: (index: number) => void;
  /** Les deux actions nommées du lecteur d'écran. */
  readonly next: string;
  readonly previous: string;
};

type Drag = {
  readonly pointer: number;
  readonly x: number;
  readonly y: number;
  axis: Axis | null;
  /** Les dernières positions verticales : l'élan se lit sur ~100 ms, jamais sur deux événements voisins. */
  trail: { y: number; at: number }[];
};

const TRAIL_MS = 100;

/** Sous ce laps, deux points ne font pas une vitesse. */
const MIN_SPAN_MS = 20;

/** px/ms, signée (négative vers le haut) ; zéro tant que le geste est trop court pour en juger. */
const velocityOf = (trail: readonly { readonly y: number; readonly at: number }[]): number => {
  const first = trail[0];
  const last = trail.at(-1);
  if (first === undefined || last === undefined || last.at - first.at < MIN_SPAN_MS) return 0;
  return (last.y - first.y) / (last.at - first.at);
};

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const shift = (px: number): string => `translate3d(0px, ${px}px, 0px)`;

type PagesProps = { readonly declinations: CarouselDeclinations; readonly height: number };

export function DeclinationPages({ declinations, height }: PagesProps) {
  const { pages, index, onSelect } = declinations;
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const swiped = useRef(false);
  const frame = useRef(0);
  const latest = useRef({ index, count: pages.length, height, onSelect });
  latest.current = { index, count: pages.length, height, onSelect };

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const place = (px: number, animate: boolean): void => {
    const element = track.current;
    if (element === null) return;
    element.style.transition = animate ? '' : 'none';
    element.style.transform = shift(px);
  };

  const follow = (translation: number): void => {
    if (reducedMotion()) return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const { index: at, count, height: box } = latest.current;
      place(-at * box + declinationOffset({ translation, height: box, index: at, count }), false);
    });
  };

  const rest = (): void => {
    cancelAnimationFrame(frame.current);
    const { index: at, height: box } = latest.current;
    place(-at * box, true);
  };

  const down = (event: ReactPointerEvent<HTMLDivElement>): void => {
    swiped.current = false;
    if (!event.isPrimary) return;
    drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, axis: null, trail: [{ y: event.clientY, at: event.timeStamp }] };
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const current = drag.current;
    if (current === null || current.pointer !== event.pointerId || current.axis === 'horizontal') return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    current.axis ??= latchAxis({ dx, dy });
    if (current.axis !== 'vertical') return;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId) === false) event.currentTarget.setPointerCapture?.(event.pointerId);
    current.trail = [...current.trail, { y: event.clientY, at: event.timeStamp }].filter((point) => event.timeStamp - point.at <= TRAIL_MS);
    follow(dy);
  };

  const up = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const current = drag.current;
    if (current === null || current.pointer !== event.pointerId) return;
    drag.current = null;
    if (current.axis !== 'vertical') return;
    swiped.current = true;
    const { index: at, count, height: box, onSelect: select } = latest.current;
    const target = declinationTarget({ translation: event.clientY - current.y, velocity: velocityOf(current.trail), height: box, index: at, count });
    cancelAnimationFrame(frame.current);
    place(-target * box, true);
    if (target !== at) select(target);
  };

  const cancel = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (drag.current?.pointer !== event.pointerId) return;
    drag.current = null;
    rest();
  };

  const swallow = (event: { stopPropagation: () => void; preventDefault: () => void }): void => {
    if (!swiped.current) return;
    swiped.current = false;
    event.stopPropagation();
    event.preventDefault();
  };

  return (
    <div
      className="absolute inset-0 touch-pan-x overflow-hidden"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancel}
      onClickCapture={swallow}
      data-call-declination-pages=""
    >
      <div ref={track} className="flex size-full flex-col will-change-transform transition-transform duration-200 motion-reduce:transition-none" style={{ transform: shift(-index * height) }}>
        {pages.map((page, position) => (
          <div
            // eslint-disable-next-line react/no-array-index-key
            key={position}
            className="grid size-full shrink-0 place-items-center motion-reduce:opacity-0 motion-reduce:transition-opacity motion-reduce:duration-150 motion-reduce:data-[current]:opacity-100"
            style={{ height }}
            {...(position === index ? { 'data-current': '' } : {})}
          >
            {page}
          </div>
        ))}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 end-0.5 flex flex-col items-center justify-center gap-1 [filter:drop-shadow(0_1px_1px_var(--color-scrim))]" data-call-declination-dots="">
        {pages.map((_, position) => (
          // eslint-disable-next-line react/no-array-index-key
          <span key={position} className="size-1 rounded-full bg-on-media opacity-50 data-[current]:opacity-100" {...(position === index ? { 'data-current': '' } : {})} data-call-declination-dot="" />
        ))}
      </div>
    </div>
  );
}

type ActionsProps = { readonly declinations: CarouselDeclinations; readonly name: string };

/**
 * Ce que le lecteur d'écran trouve à côté du carrousel : « Déclinaison suivante / précédente »,
 * hors du groupe de boutons radio (un bouton ne se pose pas dans un autre), et le nouveau nom
 * annoncé à chaque changement. Rien ne se voit ni ne prend le Tab : au clavier, ↑ et ↓ suffisent.
 */
export function DeclinationActions({ declinations, name }: ActionsProps) {
  const { index, pages, onSelect, next, previous } = declinations;
  return (
    <>
      <button type="button" tabIndex={-1} className="sr-only" disabled={index <= 0} onClick={() => onSelect(index - 1)} data-call-declination-step="previous">
        {previous}
      </button>
      <button type="button" tabIndex={-1} className="sr-only" disabled={index >= pages.length - 1} onClick={() => onSelect(index + 1)} data-call-declination-step="next">
        {next}
      </button>
      <span role="status" aria-live="polite" className="sr-only" data-call-declination-status="">
        {name}
      </span>
    </>
  );
}
