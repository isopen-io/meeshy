import { describe, expect, test } from 'bun:test';

import { CanvasV3Schema } from '@meeshy/shared/types/canvas-v3';

import { parseCanvasDocument } from '@/lib/canvas/document';
import { isWithinWindow } from '@/lib/canvas/pose';
import { sceneDurationSeconds } from '@/lib/canvas/timeline';

import { buildPreviewCanvasDocument, buildStoryCanvasEffects } from './story-document';
import { emptyStudioPage, pageWithText, pageWithVisual, type StudioPage } from './studio-page';
import { IDENTITY_POSE } from './studio-pose';
import {
  STUDIO_ANIMATED_DEFAULT_DURATION,
  STUDIO_TRACK_MIN,
  pageAnimated,
  pageWithTrackTiming,
  studioPageDuration,
  studioTracks,
} from './studio-timeline';

const typed = (text: string): StudioPage => pageWithText(emptyStudioPage('page-1', 'text-1', 'fr'), 'text-1', text);
const withOverlay = (page: StudioPage): StudioPage =>
  pageWithVisual(page, 'overlay', { previewUrl: 'blob:o', mediaType: 'image', upload: { phase: 'uploading', progress: 0 }, caption: '', pose: IDENTITY_POSE });

/** LE MODE ANIMÉ (#8415) — « chaque objet a sa piste » (maquette `Main.dc.html`). */
describe('studioTracks — une piste par objet POSÉ de la scène', () => {
  test('un texte écrit et le calque ; un texte vide n’a pas de piste', () => {
    const page = withOverlay(typed('Bonjour'));
    expect(studioTracks(page).map((track) => track.id)).toEqual(['text-1', 'overlay']);
    expect(studioTracks(withOverlay(emptyStudioPage('page-1', 'text-1', 'fr'))).map((track) => track.id)).toEqual(['overlay']);
  });
});

describe('pageAnimated — ouvrir « Animé » rend la scène ANIMÉE', () => {
  test('une durée par défaut, et chaque piste couvre toute la scène', () => {
    const page = pageAnimated(withOverlay(typed('Bonjour')));
    expect(studioPageDuration(page)).toBe(STUDIO_ANIMATED_DEFAULT_DURATION);
    expect(studioTracks(page).map((track) => track.timing)).toEqual([
      { start: 0, end: STUDIO_ANIMATED_DEFAULT_DURATION },
      { start: 0, end: STUDIO_ANIMATED_DEFAULT_DURATION },
    ]);
  });

  test('une scène déjà animée ne change pas (même objet)', () => {
    const page = pageAnimated(typed('Bonjour'));
    expect(pageAnimated(page)).toBe(page);
  });
});

describe('pageWithTrackTiming — la fenêtre d’une piste, bornée', () => {
  test('bornée à la scène, jamais plus courte que le minimum, fin après début', () => {
    const page = pageAnimated(typed('Bonjour'));
    const a = pageWithTrackTiming(page, 'text-1', { start: -1, end: 9 });
    expect(studioTracks(a)[0]?.timing).toEqual({ start: 0, end: STUDIO_ANIMATED_DEFAULT_DURATION });
    const b = pageWithTrackTiming(page, 'text-1', { start: 2, end: 2.05 });
    expect(studioTracks(b)[0]?.timing).toEqual({ start: 2, end: 2 + STUDIO_TRACK_MIN });
    const c = pageWithTrackTiming(page, 'text-1', { start: 4.95, end: 5 });
    expect(studioTracks(c)[0]?.timing).toEqual({ start: 5 - STUDIO_TRACK_MIN, end: 5 });
  });
});

describe('ce que la frise écrit, le LECTEUR le relit', () => {
  test('`timing` sur l’objet, `timelineDuration` sur la scène — le texte n’apparaît que dans sa fenêtre', () => {
    const page = pageWithTrackTiming(pageAnimated(typed('Bonjour')), 'text-1', { start: 1, end: 3 });
    const document = buildPreviewCanvasDocument({ texts: page.texts, duration: studioPageDuration(page) })!;
    const scene = document.scenes[0]!;
    expect(sceneDurationSeconds(scene)).toBe(5);
    const text = scene.objects.find((object) => object.kind === 'text')!;
    expect(isWithinWindow(text, 0.5)).toBe(false);
    expect(isWithinWindow(text, 2)).toBe(true);
    expect(isWithinWindow(text, 3.5)).toBe(false);
  });

  test('le document animé passe le schéma de la passerelle', () => {
    const page = pageWithTrackTiming(pageAnimated(typed('Bonjour')), 'text-1', { start: 1, end: 3 });
    const effects = buildStoryCanvasEffects({ texts: page.texts, duration: studioPageDuration(page) })!;
    expect(CanvasV3Schema.safeParse(effects).success).toBe(true);
    expect(effects.scenes![0]!.timelineDuration).toBe(5);
    expect(effects.scenes![0]!.objects.find((o) => o.kind === 'text')!.timing).toEqual({ start: 1, end: 3 });
    expect(parseCanvasDocument(effects)!.scenes[0]!.objects.find((o) => o.kind === 'text')!.timing).toEqual({ start: 1, end: 3 });
  });
});
