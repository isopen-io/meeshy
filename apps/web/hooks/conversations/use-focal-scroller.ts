'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  focalFocusLine,
  focalGeometry,
  pickFocusedRowId,
} from '@/lib/conversations/focal-geometry';

/**
 * Ancre de GÉOMÉTRIE — jamais transformée. C'est elle que mesure aussi le
 * virtualiseur (`measureElement`). Une `transform: scale()` ne change PAS la
 * hauteur de mise en page, donc son rectangle reste stable même quand l'enfant
 * est réduit : sans cette séparation, le rectangle mesuré rétrécirait, la
 * courbe recalculerait une autre échelle, et la liste tremblerait d'une frame
 * à l'autre.
 */
export const FOCAL_ROW_ATTRIBUTE = 'data-focal-row';

/** Cible de la transformation, à l'intérieur de l'ancre. */
export const FOCAL_SCALE_ATTRIBUTE = 'data-focal-scale';

export const FOCAL_FOCUSED_ATTRIBUTE = 'data-focal-focused';

function scaleTargetOf(row: HTMLElement): HTMLElement {
  return row.querySelector<HTMLElement>(`[${FOCAL_SCALE_ATTRIBUTE}]`) ?? row;
}

/**
 * La perspective du mode Focal, appliquée aux rangées visibles.
 *
 * Deux propriétés seulement — `transform` et `opacity` — donc composées sur le
 * GPU : zéro relayout, zéro reflow, fluide même sur un fil de 100 messages. Le
 * pass est lancé dans un `requestAnimationFrame` coalescé, jamais directement
 * dans le gestionnaire de `scroll`.
 *
 * `prefers-reduced-motion: reduce` neutralise l'effet : la liste redevient
 * strictement plate et uniforme, identique à la densité Script.
 *
 * Source : `docs/design/2026-08-15-focal-spec-integration.html` § 3.
 */
export function useFocalScroller({
  containerRef,
  enabled,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  enabled: boolean;
}) {
  const frameRef = useRef<number | null>(null);

  const clear = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const rows = container.querySelectorAll<HTMLElement>(`[${FOCAL_ROW_ATTRIBUTE}]`);
    rows.forEach((row) => {
      const target = scaleTargetOf(row);
      target.style.transform = '';
      target.style.opacity = '';
      row.removeAttribute(FOCAL_FOCUSED_ATTRIBUTE);
    });
  }, [containerRef]);

  const apply = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const focusY = focalFocusLine(containerRect.height);
    const rows = Array.from(
      container.querySelectorAll<HTMLElement>(`[${FOCAL_ROW_ATTRIBUTE}]`)
    );

    const measured = rows.map((row) => {
      const rect = row.getBoundingClientRect();
      return {
        row,
        id: row.getAttribute(FOCAL_ROW_ATTRIBUTE) ?? '',
        midY: rect.top - containerRect.top + rect.height / 2,
      };
    });

    // Ne considérer que les rangées réellement dans le viewport pour élire le
    // message net : sinon une rangée hors écran, très loin au-dessus, peut se
    // retrouver « la plus proche » quand le conteneur est presque vide.
    const visible = measured.filter(
      ({ midY }) => midY >= -containerRect.height && midY <= containerRect.height * 2
    );
    const focusedId = pickFocusedRowId(visible, focusY);

    for (const { row, id, midY } of measured) {
      const { scale, opacity } = focalGeometry({ rowMidY: midY, focusY });
      const target = scaleTargetOf(row);
      target.style.transform = scale === 1 ? '' : `scale(${scale.toFixed(4)})`;
      target.style.opacity = opacity === 1 ? '' : opacity.toFixed(4);

      if (id && id === focusedId) {
        row.setAttribute(FOCAL_FOCUSED_ATTRIBUTE, 'true');
      } else {
        row.removeAttribute(FOCAL_FOCUSED_ATTRIBUTE);
      }
    }
  }, [containerRef]);

  const schedule = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      apply();
    });
  }, [apply]);

  useEffect(() => {
    const container = containerRef.current;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!enabled || !container || prefersReducedMotion) {
      clear();
      return;
    }

    schedule();
    container.addEventListener('scroll', schedule, { passive: true });

    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
    observer?.observe(container);

    return () => {
      container.removeEventListener('scroll', schedule);
      observer?.disconnect();
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      clear();
    };
  }, [enabled, containerRef, schedule, clear]);

  return { refresh: schedule };
}
