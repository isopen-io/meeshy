import type { StudioTiming } from './studio-text';
import { STUDIO_TRACK_MIN_FRACTION } from './studio-timeline';

/**
 * **GLISSER UNE PISTE DE LA FRISE, TIRER SES ANCRES** (#8482, retour porteur
 * du 2026-09-28, miroir iOS `ComposerSceneFriseMetrics.dragged`, #8473) —
 * trois prises, une loi PURE :
 *  - la BARRE déplace la fenêtre dans le temps, sa durée gardée ;
 *  - l'ancre de DÉBUT règle l'entrée, jamais au-delà de `fin − 5 %` ;
 *  - l'ancre de FIN règle la sortie, jamais avant `début + 5 %` ni après la
 *    scène.
 * Chaque pas du geste se mesure depuis la fenêtre du DÉBUT du geste
 * (`origin`), jamais depuis la fenêtre déjà déplacée : un aller-retour rend la
 * fenêtre de départ.
 */

export type TrackGrip = 'bar' | 'start' | 'end';

const round = (value: number): number => Math.round(value * 100) / 100;
const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/** Un déplacement en pixels, rapporté à la largeur de la piste, en secondes. */
export function secondsForDelta({ dx, width, duration }: { readonly dx: number; readonly width: number; readonly duration: number }): number {
  if (width <= 0 || !Number.isFinite(dx)) return 0;
  return (dx / width) * duration;
}

export function draggedTiming({
  origin,
  grip,
  delta,
  duration,
}: {
  readonly origin: StudioTiming;
  readonly grip: TrackGrip;
  readonly delta: number;
  readonly duration: number;
}): StudioTiming {
  const minimum = STUDIO_TRACK_MIN_FRACTION * duration;
  if (grip === 'start') return { start: round(clamp(origin.start + delta, 0, origin.end - minimum)), end: origin.end };
  if (grip === 'end') return { start: origin.start, end: round(clamp(origin.end + delta, origin.start + minimum, duration)) };
  const length = origin.end - origin.start;
  const start = round(clamp(origin.start + delta, 0, Math.max(0, duration - length)));
  return { start, end: round(start + length) };
}

const KEY_DIRECTION: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1 };

/** Le pas d'une flèche sur une prise focalisée : 0,1 s, 1 s avec Maj. */
export function trackKeyStep(key: string, shift: boolean): number | null {
  const direction = KEY_DIRECTION[key];
  if (direction === undefined) return null;
  return direction * (shift ? 1 : 0.1);
}
