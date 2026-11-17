import '@/styles/kit-reorder-list.css';
import '@/styles/kit-motion.css';
import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

import { impact } from '@/lib/view/haptics';

import {
  MEESHY_REORDER_MEASURE,
  meeshyReorderListRecipe,
  meeshyReorderListStyle,
  meeshyReorderMove,
  meeshyReorderTargetIndex,
  type MeeshyReorderHandleEdge,
  type MeeshyReorderPhase,
  type MeeshyReorderRank,
} from './meeshy-reorder-list-recipe';

export * from './meeshy-reorder-list-recipe';

export type MeeshyReorderLabels = {
  readonly handle: (title: string) => string;
  readonly moveUp: string;
  readonly moveDown: string;
  readonly announce: (title: string, rank: number, count: number) => string;
};

export type MeeshyReorderRowContext = {
  readonly rank: number;
  readonly count: number;
  readonly phase: MeeshyReorderPhase;
  readonly isPending: boolean;
};

export type MeeshyReorderListProps<T> = {
  readonly label: string;
  readonly items: readonly T[];
  readonly getId: (item: T) => string;
  readonly title: (item: T) => string;
  readonly labels: MeeshyReorderLabels;
  readonly onMove: (from: number, to: number) => void;
  readonly row: (item: T, context: MeeshyReorderRowContext) => ReactNode;
  readonly rank?: MeeshyReorderRank | undefined;
  readonly emphasizesFirst?: boolean | undefined;
  readonly handleEdge?: MeeshyReorderHandleEdge | undefined;
  readonly isEnabled?: boolean | undefined;
  readonly pendingIDs?: ReadonlySet<string> | undefined;
  readonly hint?: string | undefined;
  readonly tint?: string | undefined;
  readonly haptic?: 'standard' | 'none' | undefined;
  readonly className?: string | undefined;
};

type Move = { readonly id: string; readonly from: number; readonly to: number; readonly offset: number | null };

const SPACING = 8;
const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const GRIP = (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <circle cx="6" cy="4" r="1.1" />
    <circle cx="10" cy="4" r="1.1" />
    <circle cx="6" cy="8" r="1.1" />
    <circle cx="10" cy="8" r="1.1" />
    <circle cx="6" cy="12" r="1.1" />
    <circle cx="10" cy="12" r="1.1" />
  </svg>
);

export type MeeshyReorderHandleProps = {
  readonly label: string;
  readonly phase?: MeeshyReorderPhase | undefined;
  readonly isEnabled?: boolean | undefined;
};

/** La poignée seule : 44 × 44, pour une rangée qui la dessine elle-même. */
export const MeeshyReorderHandle = memo(function MeeshyReorderHandle({ label, phase = 'rest', isEnabled = true }: MeeshyReorderHandleProps) {
  return (
    <span className="kit-reorder__handle" role="img" aria-label={label} data-phase={phase} data-disabled={isEnabled ? undefined : ''}>
      {GRIP}
    </span>
  );
});

/**
 * Une liste qu'on range : une poignée de 44 par rangée, le contenu de l'hôte tel quel. Le
 * glisser, « Monter » / « Descendre » (pour la voix) et le clavier (Espace saisit, les flèches
 * déplacent d'un rang, Espace pose, Échap ou le focus qui part ailleurs rend l'ordre de départ) aboutissent au MÊME
 * `onMove(from, to)`, une fois, au dépôt — jamais pendant le vol, jamais si rien ne change.
 */
function MeeshyReorderListInner<T>(props: MeeshyReorderListProps<T>) {
  const { label, items, getId, title, labels, onMove, row, rank = 'hidden', emphasizesFirst = false, handleEdge = 'trailing', isEnabled = true, pendingIDs, hint, tint, haptic = 'standard', className } = props;
  const [move, setMove] = useState<Move | null>(null);
  const [dropped, setDropped] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const list = useRef<HTMLUListElement | null>(null);
  const drag = useRef<{ readonly startY: number; readonly heights: readonly number[] } | null>(null);
  const droppedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabled = isEnabled && items.length >= 2;
  const reduce = prefersReducedMotion();
  useEffect(() => () => {
    if (droppedTimer.current !== null) clearTimeout(droppedTimer.current);
  }, []);

  const ids = items.map(getId);
  const shown = move === null ? items : meeshyReorderMove(items, move.from, move.to);
  const buzz = (): void => {
    if (haptic === 'standard') impact('medium');
  };

  const commit = useCallback(
    (from: number, to: number): void => {
      if (from === to) return;
      const id = ids[from] ?? '';
      onMove(from, to);
      buzz();
      setAnnouncement(labels.announce(title(items[from] as T), to + 1, items.length));
      setDropped(id);
      if (droppedTimer.current !== null) clearTimeout(droppedTimer.current);
      droppedTimer.current = setTimeout(() => setDropped(null), MEESHY_REORDER_MEASURE.dropHaloMs);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, onMove, labels, haptic],
  );

  const grab = (index: number): void => {
    impact('light');
    setMove({ id: ids[index] ?? '', from: index, to: index, offset: null });
  };
  const step = (delta: number): void => setMove((current) => (current === null ? current : { ...current, to: Math.min(Math.max(current.to + delta, 0), items.length - 1) }));
  const release = (): void => {
    if (move !== null) commit(move.from, move.to);
    setMove(null);
  };

  const keyDown = (event: KeyboardEvent<HTMLElement>, index: number): void => {
    if (!enabled) return;
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (move === null) grab(index);
      else release();
      return;
    }
    if (move === null) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      step(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setMove(null);
    }
  };

  const pointerDown = (event: PointerEvent<HTMLElement>, index: number): void => {
    if (!enabled || event.button > 0) return;
    const rows = Array.from(list.current?.querySelectorAll<HTMLElement>('[data-kit-reorder-row]') ?? []);
    drag.current = { startY: event.clientY, heights: rows.map((node) => node.getBoundingClientRect().height) };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // un pointeur déjà relâché : le geste commence quand même
    }
    grab(index);
    setMove((current) => (current === null ? current : { ...current, offset: 0 }));
  };
  const pointerMove = (event: PointerEvent<HTMLElement>): void => {
    const started = drag.current;
    if (started === null || move === null) return;
    const offset = event.clientY - started.startY;
    const to = meeshyReorderTargetIndex({ from: move.from, offset, heights: started.heights, spacing: SPACING });
    setMove({ ...move, to, offset });
  };
  const pointerEnd = (): void => {
    if (drag.current === null) return;
    drag.current = null;
    release();
  };

  const actionMove = (from: number, to: number): void => commit(from, to);

  return (
    <div className={className === undefined ? 'kit-reorder' : `kit-reorder ${className}`} data-kit-reorder="" style={meeshyReorderListStyle(meeshyReorderListRecipe({ handleEdge, isEnabled: enabled }), tint)}>
      {hint === undefined ? null : (
        <span className="kit-reorder__hint" aria-hidden="true">
          {hint}
        </span>
      )}
      <ul ref={list} className="kit-reorder__list" role="list" aria-label={label}>
        {shown.map((item, displayIndex) => {
          const id = getId(item);
          const originalIndex = ids.indexOf(id);
          const isMoving = move !== null && move.id === id;
          const phase: MeeshyReorderPhase = isMoving ? (move.offset !== null || move.to !== move.from ? 'flying' : 'grabbed') : dropped === id ? 'dropped' : 'rest';
          const recipe = meeshyReorderListRecipe({ phase, rank, isFirst: displayIndex === 0, emphasizesFirst, isEnabled: enabled, isPending: pendingIDs?.has(id) === true, handleEdge, reduceMotion: reduce });
          const name = title(item);
          const dragShift = isMoving && move.offset !== null && drag.current !== null ? move.offset - (displayShift(drag.current.heights, move.from, move.to)) : 0;
          return (
            <li
              key={id}
              role="listitem"
              className="kit-reorder__row"
              data-kit-reorder-row={id}
              data-phase={phase}
              data-first={recipe.emphasized ? '' : undefined}
              data-pending={recipe.isPending ? '' : undefined}
              data-edge={handleEdge}
              style={{ transform: isMoving ? `translateY(${dragShift}px) scale(${recipe.scale}) rotate(${recipe.tilt}deg)` : undefined, zIndex: isMoving ? 2 : undefined }}
            >
              {recipe.showsRank ? (
                <span className="kit-reorder__rank" aria-hidden="true" data-kit-reorder-rank="">
                  {displayIndex + 1}
                </span>
              ) : null}
              <div className="kit-reorder__content">{row(item, { rank: displayIndex + 1, count: items.length, phase, isPending: recipe.isPending })}</div>
              <button
                type="button"
                className="kit-reorder__handle"
                data-kit-reorder-handle=""
                data-phase={phase}
                aria-label={labels.handle(name)}
                aria-pressed={isMoving}
                disabled={!enabled}
                onKeyDown={(event) => keyDown(event, originalIndex)}
                onKeyUp={(event) => {
                  if (event.key === ' ') event.preventDefault();
                }}
                onClick={(event) => event.preventDefault()}
                onBlur={(event) => {
                  if (isMoving && drag.current === null && event.relatedTarget !== null) setMove(null);
                }}
                onPointerDown={(event) => pointerDown(event, originalIndex)}
                onPointerMove={pointerMove}
                onPointerUp={pointerEnd}
                onPointerCancel={() => {
                  drag.current = null;
                  setMove(null);
                }}
              >
                {GRIP}
              </button>
              {enabled ? (
                <span className="kit-reorder__actions">
                  {displayIndex > 0 ? (
                    <button type="button" className="kit-reorder__action" data-kit-reorder-up="" onClick={() => actionMove(originalIndex, originalIndex - 1)}>
                      {labels.moveUp}
                    </button>
                  ) : null}
                  {displayIndex < shown.length - 1 ? (
                    <button type="button" className="kit-reorder__action" data-kit-reorder-down="" onClick={() => actionMove(originalIndex, originalIndex + 1)}>
                      {labels.moveDown}
                    </button>
                  ) : null}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}

/** Le décalage d'emplacement de la rangée saisie quand l'ordre d'aperçu l'a déjà déplacée. */
const displayShift = (heights: readonly number[], from: number, to: number): number => {
  const sum = (indexes: readonly number[]): number => indexes.reduce((total, index) => total + (heights[index] ?? 0) + SPACING, 0);
  const between = Array.from({ length: Math.abs(to - from) }, (_, i) => (to > from ? from + 1 + i : to + i));
  return to > from ? sum(between) : -sum(between);
};

export const MeeshyReorderList = memo(MeeshyReorderListInner) as typeof MeeshyReorderListInner;
