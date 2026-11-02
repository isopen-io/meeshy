import { describe, expect, test } from 'bun:test';

import { brandedFrameLayers } from './scene-export-branding-render';
import { brandedTimeline, makeBrandingPlan } from './scene-export-branding-plan';

const timelineOf = (hasIntro: boolean, storyMs = 10_000) => brandedTimeline({ plan: makeBrandingPlan({ hasIntro, hasAuthorOutro: hasIntro }), storyMs });

describe('les couches peintes à chaque instant d\'un export de story', () => {
  test("pendant la tenue de l'intro (0 à 1,2 s) : l'intro seule, pleine, la story n'est pas encore peinte", () => {
    expect(brandedFrameLayers(timelineOf(true), 600)).toEqual({ story: false, intro: { alpha: 1 }, outro: null });
  });

  test('pendant le fondu (1,2 à 1,7 s) : la story se révèle sous l\'intro qui s\'efface', () => {
    const layers = brandedFrameLayers(timelineOf(true), 1_450);
    expect(layers.story).toBe(true);
    expect(layers.intro?.alpha).toBeCloseTo(0.5, 5);
    expect(layers.outro).toBeNull();
  });

  test('au milieu de la story : la story seule', () => {
    expect(brandedFrameLayers(timelineOf(true), 5_000)).toEqual({ story: true, intro: null, outro: null });
  });

  test('la carte de fin recouvre la fin de la story sur 1,5 s, puis tient seule', () => {
    const timeline = timelineOf(true);
    const early = brandedFrameLayers(timeline, timeline.outroStartMs + 750);
    expect(early.story).toBe(true);
    expect(early.outro).toEqual({ alpha: 0.5, localMs: 750 });
    const late = brandedFrameLayers(timeline, timeline.outroStartMs + 2_000);
    expect(late.story).toBe(false);
    expect(late.outro).toEqual({ alpha: 1, localMs: 2_000 });
  });

  test("sans intro : la story est peinte dès zéro, sans fondu d'ouverture", () => {
    expect(brandedFrameLayers(timelineOf(false), 0)).toEqual({ story: true, intro: null, outro: null });
  });
});
