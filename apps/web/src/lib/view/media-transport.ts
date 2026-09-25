/**
 * LA LOI DE LA BARRE DE LECTURE DE LA VISIONNEUSE (#6359) — miroir PUR de
 * `formatMediaDuration` (`MediaTypes.swift:596`), des paliers de
 * `VideoTransportControls.speeds` et du pas de `MediaStageSeek.step` (SDK).
 * Aucun élément média ici : la mécanique vit dans `use-media-playback.ts`, la
 * surface dans `media-transport.tsx`.
 */

import { formatMediaTime, SEEK_STEP_SECONDS } from './seek-track';

/** La LOI DE LA PISTE qu'on parcourt vit dans `seek-track.ts` depuis #7879 —
 * partagée avec la barre des scènes (`scene-scrub-bar.tsx`) sans lui faire
 * tirer ce module ; ré-exportée ici, aucun appelant ne change. */
export { formatMediaTime, keyboardSeekTarget, seekFraction, SEEK_STEP_SECONDS } from './seek-track';

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

/**
 * `MediaStageSeek.lateralFraction` (SDK) — la part de la largeur de la scène
 * que prend CHAQUE tiers latéral.
 */
export const LATERAL_SEEK_FRACTION = 1 / 3;

/** `MediaStageSeek.Zone` — où le doigt s'est posé, en tiers. */
export type LateralSeekZone = 'backward' | 'center' | 'forward';

/**
 * `MediaStageSeek.lateralWidth(for:)` — la largeur d'UN tiers latéral, pour
 * l'hôte qui doit poser ses zones à l'écran avec la MÊME arithmétique que
 * celle qui les décide (`lateralSeekZone`) — sinon la surface armée et la
 * surface qui répond divergent, et le geste devient inerte sur une frange
 * sans qu'aucun témoin ne rougisse.
 */
export function lateralSeekWidth(width: number): number {
  return width > 0 ? width * LATERAL_SEEK_FRACTION : 0;
}

/**
 * `MediaStageSeek.zone` — miroir. **Les bornes appartiennent aux zones
 * latérales** : un doigt posé exactement sur la frontière a visé le bord, pas
 * le milieu.
 */
export function lateralSeekZone(x: number, width: number): LateralSeekZone {
  if (!(width > 0)) return 'center';
  const lateral = lateralSeekWidth(width);
  if (x < lateral) return 'backward';
  if (x >= width - lateral) return 'forward';
  return 'center';
}

/** `MediaStageSeek.Jump` — le saut, dit par ses deux bouts. `seconds` est le saut RÉELLEMENT parcouru, jamais les dix demandés. */
export type LateralSeekJump = {
  readonly zone: 'backward' | 'forward';
  readonly from: number;
  readonly to: number;
  readonly seconds: number;
};

/**
 * `MediaStageSeek.resolve` (SDK, #6163) — miroir PUR : double tap sur le
 * tiers gauche = −10 s, tiers droit = +10 s. `null` couvre deux situations
 * distinctes que l'hôte traite pareil — ne rien faire — sans les confondre en
 * amont : le tiers CENTRAL (aucun double tap n'y est armé, le tap simple y
 * garde son effet immédiat) et un média SANS DURÉE (rien à parcourir — c'est
 * ce qui empêche toute collision avec le double tap de zoom d'une image, qui
 * n'a pas de durée). Un saut BORNÉ à une butée reste un saut, pas un `null` :
 * `seconds` y vaut zéro, mais le geste s'est appliqué.
 */
export function lateralSeek(params: {
  readonly x: number;
  readonly width: number;
  readonly position: number;
  readonly duration: number;
  readonly step?: number;
}): LateralSeekJump | null {
  const { x, width, position, duration, step = SEEK_STEP_SECONDS } = params;
  if (!(duration > 0) || !Number.isFinite(duration)) return null;

  const zone = lateralSeekZone(x, width);
  if (zone === 'center') return null;

  const clamp = (seconds: number): number => Math.min(duration, Math.max(0, seconds));
  const from = clamp(Number.isFinite(position) ? position : 0);
  const to = clamp(zone === 'backward' ? from - step : from + step);
  return { zone, from, to, seconds: to - from };
}
