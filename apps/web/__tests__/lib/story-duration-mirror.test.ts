import { computeStoryDurationMs } from '@/lib/story-transforms';

/**
 * `computeStoryDurationMs` se veut le miroir de
 * `StoryEffects.contentDerivedDuration` côté iOS
 * (`packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:1298-1338`).
 * Il en diverge sur trois points, tous ANTÉRIEURS au chantier de la fenêtre de
 * source. Toute divergence se voit à la lecture : la slide se coupe avant la
 * fin d'un média, ou s'étire au-delà.
 */
describe('computeStoryDurationMs — parité avec contentDerivedDuration (iOS)', () => {
  it('test_foregroundMediaWindow_countsItsStartTime', () => {
    // iOS mesure la FENÊTRE `startTime + duration`. Le web ne comptait que
    // `duration` : une vidéo de 4 s posée à 10 s donnait 6 s de slide au lieu
    // de 14, et se faisait couper à la lecture.
    expect(computeStoryDurationMs({
      mediaObjects: [{ id: 'm1', mediaType: 'video', startTime: 10, duration: 4 }],
    })).toBe(14000);
  });

  it('test_audioWindow_isCounted', () => {
    // Les fenêtres audio n'entraient dans AUCUN terme du calcul web.
    expect(computeStoryDurationMs({
      audioPlayerObjects: [{ id: 'a1', startTime: 2, duration: 20 }],
    })).toBe(22000);
  });

  it('test_longestWindow_raisesTheTextTarget', () => {
    // iOS : `target = max(textDur, 6, longestData)`. Sans le troisième terme,
    // l'arrondi de boucle du fond se calculait sur une cible trop basse.
    // Ici : longestData = 17, période du fond = 5 ⟹ ceil(17/5) × 5 = 20.
    expect(computeStoryDurationMs({
      audioPlayerObjects: [
        { id: 'bg', isBackground: true, duration: 5 },
        { id: 'a1', startTime: 0, duration: 17 },
      ],
    })).toBe(20000);
  });

  it('test_staticSlide_stillDefaultsToSixSeconds', () => {
    expect(computeStoryDurationMs({})).toBe(6000);
    expect(computeStoryDurationMs(undefined)).toBe(6000);
  });

  it('test_pinnedTimelineDuration_stillWinsOverEverything', () => {
    // Priorité 0 inchangée (`StoryModels.swift:1376`).
    expect(computeStoryDurationMs({
      timelineDuration: 3,
      audioPlayerObjects: [{ id: 'a1', duration: 60 }],
    })).toBe(3000);
  });
});
