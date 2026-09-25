/**
 * LA LOI DE LA PISTE QU'ON PARCOURT — extraite de `media-transport.ts` (#7879)
 * pour être partagée par la barre de la visionneuse (`media-transport.tsx`)
 * et celle des scènes (`scene-scrub-bar.tsx`, réel à scène et story) : même
 * geste, même clavier, même temps affiché. `media-transport.ts` la
 * ré-exporte ; aucun de ses appelants ne change.
 */

/** `formatMediaDuration` — `m:ss`, les minutes sans plafond (une heure s'écrit « 60:00 »). Une valeur inconnue rend « 0:00 », jamais « NaN:NaN ». */
export function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** La fraction [0, 1] de la piste visée par une abscisse. Une piste sans largeur vise le début. */
export function seekFraction(params: { readonly clientX: number; readonly left: number; readonly width: number }): number {
  const { clientX, left, width } = params;
  if (!(width > 0)) return 0;
  return Math.min(1, Math.max(0, (clientX - left) / width));
}

/** `MediaStageSeek.step` — le même pas pour le clavier que pour le double tap latéral d'iOS. */
export const SEEK_STEP_SECONDS = 10;

/**
 * La position visée par une touche sur le curseur de lecture, bornée à
 * `[0, duration]`, ou `null` quand la touche ne concerne pas le curseur ou que
 * la durée est inconnue.
 */
export function keyboardSeekTarget(params: {
  readonly key: string;
  readonly position: number;
  readonly duration: number;
  /** Le pas des flèches — `SEEK_STEP_SECONDS` par défaut ; une scène passe
   * le sien (`sceneSeekStep`, #7879). */
  readonly step?: number;
}): number | null {
  const { key, position, duration, step = SEEK_STEP_SECONDS } = params;
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const clamp = (seconds: number): number => Math.min(duration, Math.max(0, seconds));
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return clamp(position + step);
    case 'ArrowLeft':
    case 'ArrowDown':
      return clamp(position - step);
    case 'Home':
      return 0;
    case 'End':
      return duration;
    default:
      return null;
  }
}
