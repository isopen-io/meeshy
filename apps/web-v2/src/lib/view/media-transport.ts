/**
 * LA LOI DE LA BARRE DE LECTURE DE LA VISIONNEUSE (#6359) — miroir PUR de
 * `formatMediaDuration` (`MediaTypes.swift:596`), des paliers de
 * `VideoTransportControls.speeds` et du pas de `MediaStageSeek.step` (SDK).
 * Aucun élément média ici : la mécanique vit dans `use-media-playback.ts`, la
 * surface dans `media-transport.tsx`.
 */

/** `formatMediaDuration` — `m:ss`, les minutes sans plafond (une heure s'écrit « 60:00 »). Une valeur inconnue rend « 0:00 », jamais « NaN:NaN ». */
export function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * La durée de la PIÈCE JOINTE (millisecondes), lisible avant la première image
 * décodée. `null` sans durée : un « 0:00 » faux est pire qu'aucun chiffre,
 * parce qu'on le croit (`currentDurationLabel`, `+Transport.swift`).
 */
export function attachmentDurationLabel(durationMs: number | undefined): string | null {
  if (durationMs === undefined || !(durationMs > 0)) return null;
  return formatMediaTime(durationMs / 1000);
}

/** `VideoTransportControls.speeds` — les paliers offerts par le menu. */
export const PLAYBACK_SPEEDS = [1, 1.25, 1.5, 1.75, 2] as const;

export type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

/** « 1,25× » en français, « 1.25× » en anglais : le séparateur décimal est celui de la langue d'interface. */
export function speedLabel(rate: number, language: string): string {
  return `${new Intl.NumberFormat(language).format(rate)}×`;
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
}): number | null {
  const { key, position, duration } = params;
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const clamp = (seconds: number): number => Math.min(duration, Math.max(0, seconds));
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return clamp(position + SEEK_STEP_SECONDS);
    case 'ArrowLeft':
    case 'ArrowDown':
      return clamp(position - SEEK_STEP_SECONDS);
    case 'Home':
      return 0;
    case 'End':
      return duration;
    default:
      return null;
  }
}
