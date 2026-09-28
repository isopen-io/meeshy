import type { StudioPage } from './studio-page';
import type { StudioTiming } from './studio-text';

/**
 * **LE MODE ANIMÉ** (#8415, maquette `Main.dc.html` : « chaque objet a sa
 * piste ») — miroir de la frise iOS (`MeeshyComposerHost+Animated.swift`).
 * « Animé » change la NATURE de la scène, pas son format : elle prend une
 * DURÉE (`timelineDuration`) et chaque objet posé une FENÊTRE d'apparition
 * (`ObjectV3.timing`), exactement ce que le lecteur relit
 * (`lib/canvas/timeline.ts`, `visibilityWindow`).
 */
export const STUDIO_ANIMATED_DEFAULT_DURATION = 6;

/** L'écart minimal d'une fenêtre, en SECONDES — celui d'iOS
 * (`ClipWindowResolver.minimumDuration`, lot 7) : deux poignées ne se
 * croisent jamais, et ne se collent pas à moins de 0,05 s. */
export const STUDIO_TRACK_MIN = 0.05;

/** Un objet posé en mode animé n'entre pas plus tard qu'à 80 % de la scène. */
const LATEST_ENTRY_FRACTION = 0.8;

const minimumOf = (duration: number): number => Math.min(STUDIO_TRACK_MIN, Math.max(0, duration));

export type StudioTrack = { readonly id: string; readonly kind: 'text' | 'overlay'; readonly timing: StudioTiming };

export const studioPageDuration = (page: StudioPage): number => page.duration ?? STUDIO_ANIMATED_DEFAULT_DURATION;

const round = (value: number): number => Math.round(value * 100) / 100;

/** Une piste par objet POSÉ — un texte écrit, le calque. Sans fenêtre, un
 * objet couvre toute la scène. */
export function studioTracks(page: StudioPage): readonly StudioTrack[] {
  const whole: StudioTiming = { start: 0, end: studioPageDuration(page) };
  return [
    ...page.texts.filter((layer) => layer.text.trim() !== '').map((layer) => ({ id: layer.id, kind: 'text' as const, timing: layer.timing ?? whole })),
    ...(page.overlay !== null ? [{ id: 'overlay', kind: 'overlay' as const, timing: page.overlay.timing ?? whole }] : []),
  ];
}

/** Une fenêtre bornée à la scène, jamais plus courte que `STUDIO_TRACK_MIN`. */
export function clampTiming(timing: StudioTiming, duration: number): StudioTiming {
  const minimum = minimumOf(duration);
  const start = Math.min(Math.max(0, timing.start), duration - minimum);
  const end = Math.max(Math.min(duration, timing.end), start + minimum);
  return { start: round(start), end: round(end) };
}

/** « ENTRE ICI » (maquette) — l'objet entre à la tête, jamais après sa sortie. */
export function timingEnteringAt(timing: StudioTiming, head: number, duration: number): StudioTiming {
  return clampTiming({ start: Math.min(head, timing.end - minimumOf(duration)), end: timing.end }, duration);
}

/** « SORT ICI » (maquette) — l'objet sort à la tête, jamais avant son entrée. */
export function timingExitingAt(timing: StudioTiming, head: number, duration: number): StudioTiming {
  return clampTiming({ start: timing.start, end: Math.max(head, timing.start + minimumOf(duration)) }, duration);
}

/** UN OBJET POSÉ en mode animé (maquette) — il entre à la tête, au plus tard à
 * 80 % de la scène, et reste jusqu'au bout. */
export function pagePlacedWhileAnimated(page: StudioPage, id: string, head: number): StudioPage {
  const duration = studioPageDuration(page);
  return pageWithTrackTiming(page, id, { start: Math.min(head, LATEST_ENTRY_FRACTION * duration), end: duration });
}

/** OUVRIR « Animé » — la scène prend sa durée, chaque piste sa fenêtre
 * (toute la scène). Une scène déjà animée reste le MÊME objet. */
export function pageAnimated(page: StudioPage): StudioPage {
  const duration = studioPageDuration(page);
  const whole: StudioTiming = { start: 0, end: duration };
  const needs =
    page.duration === undefined ||
    page.texts.some((layer) => layer.text.trim() !== '' && layer.timing === undefined) ||
    (page.overlay !== null && page.overlay.timing === undefined);
  if (!needs) return page;
  return {
    ...page,
    duration,
    texts: page.texts.map((layer) => (layer.text.trim() !== '' && layer.timing === undefined ? { ...layer, timing: whole } : layer)),
    overlay: page.overlay === null || page.overlay.timing !== undefined ? page.overlay : { ...page.overlay, timing: whole },
  };
}

export function pageWithTrackTiming(page: StudioPage, id: string, timing: StudioTiming): StudioPage {
  const clamped = clampTiming(timing, studioPageDuration(page));
  const duration = studioPageDuration(page);
  if (id === 'overlay') return page.overlay === null ? page : { ...page, duration, overlay: { ...page.overlay, timing: clamped } };
  if (!page.texts.some((layer) => layer.id === id)) return page;
  return { ...page, duration, texts: page.texts.map((layer) => (layer.id === id ? { ...layer, timing: clamped } : layer)) };
}

/** Ce que le doigt tient sur une piste : la barre entière, ou une poignée. */
export type StudioTrackGrip = 'move' | 'start' | 'end';

/**
 * **LA FENÊTRE APRÈS UN GLISSEMENT de `delta` secondes** (lot 7, miroir
 * `ComposerSceneFriseMetrics.dragged`) — déplacer garde la durée et reste dans
 * la scène ; une poignée ne franchit jamais l'autre (écart `STUDIO_TRACK_MIN`)
 * ni les bords.
 */
export function draggedTiming(timing: StudioTiming, grip: StudioTrackGrip, delta: number, duration: number): StudioTiming {
  const total = Math.max(0, duration);
  const step = Number.isFinite(delta) ? delta : 0;
  const minimum = minimumOf(total);
  if (grip === 'move') {
    const length = timing.end - timing.start;
    const start = Math.max(0, Math.min(timing.start + step, total - length));
    return { start: round(start), end: round(start + length) };
  }
  if (grip === 'start') return { start: round(Math.max(0, Math.min(timing.start + step, timing.end - minimum))), end: timing.end };
  return { start: timing.start, end: round(Math.min(total, Math.max(timing.end + step, timing.start + minimum))) };
}
