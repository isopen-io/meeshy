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
  draggedTiming,
  pageAnimated,
  pageIsAnimated,
  pagePlacedWhileAnimated,
  pageStatic,
  timingEnteringAt,
  timingExitingAt,
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
    expect(studioTracks(b)[0]?.timing).toEqual({ start: 2, end: 2.05 });
    const d = pageWithTrackTiming(page, 'text-1', { start: 2, end: 2.01 });
    expect(studioTracks(d)[0]?.timing).toEqual({ start: 2, end: 2.05 });
    const c = pageWithTrackTiming(page, 'text-1', { start: 5.95, end: 6 });
    expect(studioTracks(c)[0]?.timing).toEqual({ start: 6 - STUDIO_TRACK_MIN, end: 6 });
  });
});

describe('ce que la frise écrit, le LECTEUR le relit', () => {
  test('`timing` sur l’objet, `timelineDuration` sur la scène — le texte n’apparaît que dans sa fenêtre', () => {
    const page = pageWithTrackTiming(pageAnimated(typed('Bonjour')), 'text-1', { start: 1, end: 3 });
    const document = buildPreviewCanvasDocument({ texts: page.texts, duration: studioPageDuration(page) })!;
    const scene = document.scenes[0]!;
    expect(sceneDurationSeconds(scene)).toBe(6);
    const text = scene.objects.find((object) => object.kind === 'text')!;
    expect(isWithinWindow(text, 0.5)).toBe(false);
    expect(isWithinWindow(text, 2)).toBe(true);
    expect(isWithinWindow(text, 3.5)).toBe(false);
  });

  test('le document animé passe le schéma de la passerelle', () => {
    const page = pageWithTrackTiming(pageAnimated(typed('Bonjour')), 'text-1', { start: 1, end: 3 });
    const effects = buildStoryCanvasEffects({ texts: page.texts, duration: studioPageDuration(page) })!;
    expect(CanvasV3Schema.safeParse(effects).success).toBe(true);
    expect(effects.scenes![0]!.timelineDuration).toBe(6);
    expect(effects.scenes![0]!.objects.find((o) => o.kind === 'text')!.timing).toEqual({ start: 1, end: 3 });
    expect(parseCanvasDocument(effects)!.scenes[0]!.objects.find((o) => o.kind === 'text')!.timing).toEqual({ start: 1, end: 3 });
  });
});

/** LA MAQUETTE `Main.dc.html` (lot 6), écart minimal aligné sur iOS au lot 7 —
 * durée 6 s, « Entre ici » / « Sort ici » à la tête (écart minimal 0,05 s,
 * `ClipWindowResolver.minimumDuration`), et un objet posé en mode animé entre à
 * la tête (au plus tard à 80 %) et reste jusqu'au bout. */
describe('la frise de la maquette', () => {
  test('6 s par défaut, écart minimal 0,05 s (iOS)', () => {
    expect(STUDIO_ANIMATED_DEFAULT_DURATION).toBe(6);
    expect(STUDIO_TRACK_MIN).toBeCloseTo(0.05, 5);
  });

  test('« Entre ici » : t0 = min(tête, t1 − 0,05 s)', () => {
    expect(timingEnteringAt({ start: 0, end: 4 }, 1.5, 6)).toEqual({ start: 1.5, end: 4 });
    expect(timingEnteringAt({ start: 0, end: 4 }, 5, 6)).toEqual({ start: 3.95, end: 4 });
  });

  test('« Sort ici » : t1 = max(tête, t0 + 0,05 s)', () => {
    expect(timingExitingAt({ start: 2, end: 6 }, 4.5, 6)).toEqual({ start: 2, end: 4.5 });
    expect(timingExitingAt({ start: 2, end: 6 }, 1, 6)).toEqual({ start: 2, end: 2.05 });
  });

  test('un objet posé en mode animé : t0 = min(tête, 80 %), t1 = fin', () => {
    const page = pageAnimated(typed('Bonjour'));
    expect(studioTracks(pagePlacedWhileAnimated(page, 'text-1', 2))[0]?.timing).toEqual({ start: 2, end: 6 });
    expect(studioTracks(pagePlacedWhileAnimated(page, 'text-1', 5.9))[0]?.timing).toEqual({ start: 4.8, end: 6 });
  });
});

/** LA FRISE SE RÈGLE À LA MAIN (lot 7, miroir `ComposerSceneFriseMetrics.dragged`) :
 * glisser la barre la DÉPLACE (durée gardée, bornée à la scène) ; tirer une
 * poignée l'allonge ou la raccourcit, sans jamais croiser l'autre. */
describe('draggedTiming — la fenêtre après un glissement', () => {
  test('déplacer garde la durée et reste dans la scène', () => {
    expect(draggedTiming({ start: 1, end: 3 }, 'move', 1.5, 6)).toEqual({ start: 2.5, end: 4.5 });
    expect(draggedTiming({ start: 1, end: 3 }, 'move', 9, 6)).toEqual({ start: 4, end: 6 });
    expect(draggedTiming({ start: 1, end: 3 }, 'move', -9, 6)).toEqual({ start: 0, end: 2 });
  });

  test('la poignée de début ne franchit ni le bord ni la fin', () => {
    expect(draggedTiming({ start: 1, end: 3 }, 'start', -0.5, 6)).toEqual({ start: 0.5, end: 3 });
    expect(draggedTiming({ start: 1, end: 3 }, 'start', -5, 6)).toEqual({ start: 0, end: 3 });
    expect(draggedTiming({ start: 1, end: 3 }, 'start', 5, 6)).toEqual({ start: 2.95, end: 3 });
  });

  test('la poignée de fin ne franchit ni le bord ni le début', () => {
    expect(draggedTiming({ start: 1, end: 3 }, 'end', 1, 6)).toEqual({ start: 1, end: 4 });
    expect(draggedTiming({ start: 1, end: 3 }, 'end', 9, 6)).toEqual({ start: 1, end: 6 });
    expect(draggedTiming({ start: 1, end: 3 }, 'end', -9, 6)).toEqual({ start: 1, end: 1.05 });
  });

  test('un pas non fini ne bouge rien', () => {
    expect(draggedTiming({ start: 1, end: 3 }, 'move', Number.NaN, 6)).toEqual({ start: 1, end: 3 });
  });
});

describe('pageStatic — éteindre « Animé » rend la scène STATIQUE (#8516)', () => {
  test('la durée et TOUTES les fenêtres s’effacent : le document publié n’a plus rien d’animé', () => {
    const animated = pageWithTrackTiming(pageAnimated(withOverlay(typed('Bonjour'))), 'text-1', { start: 1, end: 3 });
    expect(pageIsAnimated(animated)).toBe(true);
    const still = pageStatic(animated);
    expect(pageIsAnimated(still)).toBe(false);
    expect(still.duration).toBeUndefined();
    expect(still.texts[0]!.timing).toBeUndefined();
    expect(still.overlay?.timing).toBeUndefined();
    const published = JSON.stringify(buildStoryCanvasEffects({ texts: still.texts }));
    expect(published).not.toContain('timing');
    expect(published).not.toContain('timelineDuration');
  });

  test('une scène déjà statique reste le MÊME objet (aucun rendu, aucun pas d’historique)', () => {
    const page = withOverlay(typed('Bonjour'));
    expect(pageStatic(page)).toBe(page);
  });

  test('rallumer après avoir éteint repart de la durée par défaut, chaque piste couvrant la scène', () => {
    const relit = pageAnimated(pageStatic(pageWithTrackTiming(pageAnimated(typed('Bonjour')), 'text-1', { start: 2, end: 4 })));
    expect(relit.duration).toBe(STUDIO_ANIMATED_DEFAULT_DURATION);
    expect(relit.texts[0]!.timing).toEqual({ start: 0, end: STUDIO_ANIMATED_DEFAULT_DURATION });
  });
});
