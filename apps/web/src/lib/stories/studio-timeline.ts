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
export const STUDIO_ANIMATED_DEFAULT_DURATION = 5;

/** Une fenêtre plus courte ne se voit ni ne se saisit. */
export const STUDIO_TRACK_MIN = 0.2;

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
  const start = Math.min(Math.max(0, timing.start), duration - STUDIO_TRACK_MIN);
  const end = Math.max(Math.min(duration, timing.end), start + STUDIO_TRACK_MIN);
  return { start: round(end - start < STUDIO_TRACK_MIN ? end - STUDIO_TRACK_MIN : start), end: round(end) };
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
