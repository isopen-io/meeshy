import { describe, expect, test } from 'bun:test';

import { BRANDING_TIMING, brandedTimeline, makeBrandingPlan, shiftedPlan } from './scene-export-branding-plan';
import type { SceneExportPlan } from './scene-export-plan';

describe('le minutage de la marque (miroir de StoryExportBranding.makePlan et de StoryExportBrandingPlan.kt)', () => {
  test("avec intro et carte d'auteur : la story démarre à 1,2 s, le fondu dure 0,5 s, la fin dure 3,5 s et son jingle entre à 1,5 s", () => {
    const plan = makeBrandingPlan({ hasIntro: true, hasAuthorOutro: true });
    expect(plan).toEqual({ hasIntro: true, storyStartMs: 1_200, introFade: { startMs: 1_200, durationMs: 500 }, outroDurationMs: 3_500, outroJingleOffsetMs: 1_500 });
  });

  test("sans intro : la story démarre à zéro et il n'y a aucun fondu d'ouverture", () => {
    const plan = makeBrandingPlan({ hasIntro: false, hasAuthorOutro: false });
    expect(plan).toEqual({ hasIntro: false, storyStartMs: 0, introFade: { startMs: 0, durationMs: 0 }, outroDurationMs: 2_000, outroJingleOffsetMs: 0 });
  });

  test("la carte de fin ne dépend d'aucune identité : elle est toujours due, logo seul de 2 s", () => {
    expect(makeBrandingPlan({ hasIntro: true, hasAuthorOutro: false }).outroDurationMs).toBe(BRANDING_TIMING.outroMs);
  });

  test('la fin chevauche 1,5 s de la story ; la durée totale = début de la fin + sa durée', () => {
    const timeline = brandedTimeline({ plan: makeBrandingPlan({ hasIntro: true, hasAuthorOutro: false }), storyMs: 10_000 });
    expect(timeline.outroStartMs).toBe(1_200 + 10_000 - 1_500);
    expect(timeline.outroFade).toEqual({ startMs: 9_700, durationMs: 1_500 });
    expect(timeline.totalMs).toBe(9_700 + 2_000);
  });

  test("une story plus courte que la tenue plus le chevauchement : la fin ne remonte jamais dans le fondu d'ouverture", () => {
    const timeline = brandedTimeline({ plan: makeBrandingPlan({ hasIntro: true, hasAuthorOutro: false }), storyMs: 1_000 });
    expect(timeline.outroStartMs).toBe(1_700);
    expect(timeline.outroFade.durationMs).toBe(500);
  });

  test('sans intro, une story de 1 s : la fin démarre à zéro, jamais avant', () => {
    const timeline = brandedTimeline({ plan: makeBrandingPlan({ hasIntro: false, hasAuthorOutro: true }), storyMs: 1_000 });
    expect(timeline.outroStartMs).toBe(0);
    expect(timeline.totalMs).toBe(3_500);
  });

  test("le jingle d'ouverture entre à zéro et joue en entier ; celui de fermeture suit le décalage de la 2e phase", () => {
    const timeline = brandedTimeline({ plan: makeBrandingPlan({ hasIntro: true, hasAuthorOutro: true }), storyMs: 10_000 });
    expect(timeline.introJingle).toEqual({ whenMs: 0 });
    expect(timeline.outroJingle.whenMs).toBe(timeline.outroStartMs + 1_500);
  });

  test("le son de la story monte sous la queue du jingle d'ouverture et s'éteint sous la carte d'auteur, muet à l'entrée de son jingle", () => {
    const timeline = brandedTimeline({ plan: makeBrandingPlan({ hasIntro: true, hasAuthorOutro: true }), storyMs: 10_000 });
    expect(BRANDING_TIMING.introJingleMs).toBe(2_200);
    expect(timeline.storyAudioRise).toEqual({ startMs: 1_200, durationMs: 1_000 });
    expect(timeline.storyAudioFall).toEqual({ startMs: timeline.outroStartMs, durationMs: 1_500 });
    expect(timeline.storyAudioFall.startMs + timeline.storyAudioFall.durationMs).toBe(timeline.outroJingle.whenMs);
  });

  test('une story courte : la montée et l\'extinction ne se chevauchent jamais', () => {
    const timeline = brandedTimeline({ plan: makeBrandingPlan({ hasIntro: true, hasAuthorOutro: false }), storyMs: 1_500 });
    const rise = timeline.storyAudioRise!;
    expect(timeline.storyAudioFall.startMs).toBeGreaterThanOrEqual(rise.startMs + rise.durationMs);
    expect(timeline.storyAudioFall.startMs + timeline.storyAudioFall.durationMs).toBeLessThanOrEqual(1_200 + 1_500);
  });

  test("sans intro, aucun jingle d'ouverture", () => {
    expect(brandedTimeline({ plan: makeBrandingPlan({ hasIntro: false, hasAuthorOutro: false }), storyMs: 5_000 }).introJingle).toBeNull();
  });
});

describe("le plan de la scène décalé derrière l'intro", () => {
  const plan: SceneExportPlan = {
    slides: [{ sceneIndex: 0, startMs: 0, durationMs: 4_000 }],
    totalMs: 4_000,
    still: true,
    sounds: [
      { src: 'a.mp3', role: 'background-track', objectId: null, startMs: 500, endMs: 3_000, trimStartMs: 0, trimEndMs: null, loop: false, gain: 1, envelope: [{ atMs: 500, gain: 0 }, { atMs: 900, gain: 1 }] },
    ],
  };

  test('les slides, les sons et leurs courbes avancent du début de la story ; la durée est celle de la fin', () => {
    const shifted = shiftedPlan({ plan, offsetMs: 1_200, totalMs: 7_200 });
    expect(shifted.slides[0]).toEqual({ sceneIndex: 0, startMs: 1_200, durationMs: 4_000 });
    expect(shifted.sounds[0]?.startMs).toBe(1_700);
    expect(shifted.sounds[0]?.endMs).toBe(4_200);
    expect(shifted.sounds[0]?.envelope).toEqual([{ atMs: 1_700, gain: 0 }, { atMs: 2_100, gain: 1 }]);
    expect(shifted.totalMs).toBe(7_200);
  });

  test("avec marque, l'export n'est jamais une image fixe : il porte du temps et du son", () => {
    expect(shiftedPlan({ plan, offsetMs: 0, totalMs: 5_500 }).still).toBe(false);
  });
});
