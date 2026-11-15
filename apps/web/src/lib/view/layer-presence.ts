import { useEffect, useRef, useState, type CSSProperties } from 'react';

import '@/styles/layer-motion.css';

import { DIALOG_FADE_MS } from './dialog-exit';
import { prefersReducedMotion } from './reduced-motion';

/**
 * **UNE COUCHE MONTÉE SOUS CONDITION ENTRE ET SORT EN MOUVEMENT** (#18327) — un menu ancré, un bandeau,
 * un toast, une liste flottante. `{open ? <X/> : null}` les retirait dans le même rendu : la couche
 * paraissait en mouvement et partait d'un coup. Ici, la valeur qui la montait reste TENUE le temps du
 * fondu de sortie (`leaving`), puis s'en va ; rouverte pendant ce temps, la couche reprend sans remonter.
 *
 * Le mouvement lui-même est dans `styles/layer-motion.css`, posé par `layerMotion(leaving)` : un fondu
 * avec un léger déplacement (`--layer-shift`, `--layer-scale`), à l'entrée comme à la sortie. Sous
 * « Réduire les animations », le retrait est immédiat et la feuille ne joue rien.
 */

/** Le fondu de K13 (200 ms), celui des fenêtres centrées : une couche ancrée n'a pas de fiche à elle. */
export const LAYER_MOTION_MS = DIALOG_FADE_MS;

export type LayerPresence<T> = { readonly value: T | null; readonly leaving: boolean };

export function useLayerPresence<T>(value: T | null, exitMs: number = LAYER_MOTION_MS): LayerPresence<T> {
  const held = useRef<T | null>(value);
  const [, release] = useState(0);
  if (value !== null || exitMs <= 0 || prefersReducedMotion()) held.current = value;
  const leaving = value === null && held.current !== null;

  useEffect(() => {
    if (!leaving) return undefined;
    const timer = setTimeout(() => {
      held.current = null;
      release((count) => count + 1);
    }, exitMs);
    return () => clearTimeout(timer);
  }, [leaving, exitMs]);

  return { value: held.current, leaving };
}

/** Les attributs d'une couche animée : la prise de la feuille, sa durée, et l'inertie de sa sortie. */
export function layerMotion(leaving: boolean, style?: CSSProperties) {
  return {
    'data-layer-motion': '',
    'data-leaving': leaving ? '' : undefined,
    inert: leaving || undefined,
    style: { '--layer-ms': `${LAYER_MOTION_MS}ms`, ...style } as CSSProperties,
  };
}
