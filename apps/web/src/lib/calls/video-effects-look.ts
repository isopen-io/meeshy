/**
 * **LA COULEUR D'UN APPEL** — les préréglages et leur filtre de canevas, à part du magasin d'état : le worker
 * des effets (`video-effects-worker.ts`) ne lit que le filtre, il ne doit pas embarquer le magasin (`zustand`).
 * `video-effects.ts` les ré-exporte : l'écran les lit toujours par lui.
 */

/** Tout ce que l'écran sait LIRE : les quatre teintes d'avant les ambiances restent lisibles, sans être proposées. */
export const VIDEO_PRESETS = ['natural', 'warm', 'cool', 'vivid', 'muted', 'golden', 'film', 'softNight', 'bright', 'velvet', 'sky', 'monochrome'] as const;

export type VideoPreset = (typeof VIDEO_PRESETS)[number];

/** **Les huit ambiances de Meeshy**, dans l'ordre d'iOS (`VideoFilterPreset.catalog`) : ce que le mode Effets propose. */
export const VIDEO_PRESET_CATALOG: readonly VideoPreset[] = ['natural', 'golden', 'film', 'softNight', 'bright', 'velvet', 'sky', 'monochrome'];

export const BRIGHTNESS_LIMIT = 0.5;

/* La colorimétrie d'iOS (température, contraste, saturation) rendue en filtres CSS : [sépia, rotation de teinte (°), saturation, contraste, luminosité, niveaux de gris]. */
type Look = readonly [number, number, number, number, number, number];

const PRESET_LOOK: Readonly<Record<VideoPreset, Look>> = {
  natural: [0, 0, 1, 1, 1, 0],
  warm: [0.18, 0, 1.1, 1.05, 1.02, 0],
  cool: [0, -10, 0.95, 1.05, 1, 0],
  vivid: [0, 0, 1.3, 1.15, 1.03, 0],
  muted: [0, 0, 0.7, 0.9, 0.98, 0],
  golden: [0.1, 0, 1.04, 1.04, 1, 0],
  film: [0.04, 0, 0.86, 1.08, 1, 0],
  softNight: [0, -4, 0.9, 0.94, 1.03, 0],
  bright: [0, 0, 0.82, 0.96, 1.05, 0],
  velvet: [0.06, 0, 1.08, 1.12, 0.99, 0],
  sky: [0, -6, 1.12, 1.08, 1, 0],
  monochrome: [0, 0, 1, 1.1, 1, 1],
};

const LOOK_FUNCTIONS = ['sepia', 'hue-rotate', 'saturate', 'contrast', 'brightness', 'grayscale'] as const;
const LOOK_NEUTRAL = [0, 0, 1, 1, 1, 0] as const;

const presetFilter = (preset: VideoPreset): string =>
  PRESET_LOOK[preset]
    .flatMap((value, index) => (value === LOOK_NEUTRAL[index] ? [] : [`${LOOK_FUNCTIONS[index]}(${value}${index === 1 ? 'deg' : ''})`]))
    .join(' ');

export const clampBrightness = (value: number): number => Math.max(-BRIGHTNESS_LIMIT, Math.min(BRIGHTNESS_LIMIT, value));

/** Le filtre de canevas que le traitement pose sur chaque image — `none` quand il n'y a rien à faire. */
export function effectsFilter(effects: { readonly preset: VideoPreset; readonly brightness: number }): string {
  const brightness = clampBrightness(effects.brightness);
  const parts = [presetFilter(effects.preset), brightness === 0 ? '' : `brightness(${Math.round((1 + brightness) * 100) / 100})`].filter((part) => part !== '');
  return parts.length === 0 ? 'none' : parts.join(' ');
}
