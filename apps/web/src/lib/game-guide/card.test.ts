import { describe, expect, test } from 'bun:test';

import {
  GUIDE_MOMENT_KEYS,
  ONBOARDING_STEPS,
  guideMoment,
  type GuideEvent,
  type GuideMood,
  type GuideSpeaker,
} from '@meeshy/shared/utils/game/guide';

import { GAME_BIRD_KEYS } from '@/lib/game/birds';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockFixture } from '@/lib/api/game-fixture';

import { cardOfMoment, cardOfStep, guideBirds, isPhotoMoment } from './card';

/**
 * LA CARTE DU GUIDE (#9379) — le modèle que la carte affiche : qui parle, avec
 * quelle humeur, quoi dire, en entier ou en court, et vers où mène son bouton.
 */

const MOODS: readonly GuideMood[] = ['cheer', 'minting', 'ready', 'guide', 'streak', 'counting', 'calm', 'sad', 'proud'];
const SPEAKERS: readonly GuideSpeaker[] = ['mee', 'meo', 'duo'];

describe('les oiseaux de chaque humeur', () => {
  for (const speaker of SPEAKERS) {
    for (const mood of MOODS) {
      test(`${speaker} / ${mood} : des figures qui existent dans le catalogue des stickers`, () => {
        const birds = guideBirds(speaker, mood);
        const keys = [birds.mee, birds.meo].filter((key) => key !== undefined);
        expect(keys.length).toBe(speaker === 'duo' ? 2 : 1);
        for (const key of keys) expect(GAME_BIRD_KEYS).toContain(key);
      });
    }
  }

  test('Mee parle depuis Mee, Meo depuis Meo, et jamais l’un à la place de l’autre', () => {
    expect(guideBirds('mee', 'guide').mee).toBe('meeGuide');
    expect(guideBirds('mee', 'guide').meo).toBeUndefined();
    expect(guideBirds('meo', 'sad').meo).toBe('meoTeary');
    expect(guideBirds('meo', 'sad').mee).toBeUndefined();
  });

  test('Meo triste pleure, Meo fier porte la couronne', () => {
    expect(guideBirds('meo', 'sad').meo).toBe('meoTeary');
    expect(guideBirds('meo', 'proud').meo).toBe('meoCrown');
    expect(guideBirds('duo', 'proud')).toEqual({ mee: 'meeCrown', meo: 'meoCrown' });
  });
});

describe('une carte pour un moment', () => {
  const event: GuideEvent = { kind: 'first-mint', levelBefore: 14, levelAfter: 9, tailwindUntilLevel: 14 };

  test('la première fois : complète, avec le locuteur et le bouton de la loi', () => {
    const card = cardOfMoment(guideMoment(event, []));
    expect(card.key).toBe('first-mint');
    expect(card.speaker).toBe('duo');
    expect(card.presentation).toBe('full');
    expect(card.action).toBe('regain-levels');
    expect(card.copy.means).toContain('de 14 à 9');
    expect(card.step).toBeUndefined();
  });

  test('les fois suivantes : courte', () => {
    expect(cardOfMoment(guideMoment(event, ['first-mint'])).presentation).toBe('short');
  });

  test('les moments qui se photographient le disent', () => {
    expect(isPhotoMoment('new-rank')).toBe(true);
    expect(isPhotoMoment('new-tier')).toBe(true);
    expect(isPhotoMoment('first-mint')).toBe(true);
    expect(isPhotoMoment('treasury-tier')).toBe(true);
    expect(isPhotoMoment('level-100')).toBe(true);
    expect(isPhotoMoment('flame-at-risk')).toBe(false);
    expect(isPhotoMoment('price-rises')).toBe(false);
  });

  test('chaque moment du catalogue se transforme en carte sans trou', () => {
    const samples: Record<string, GuideEvent> = {
      'first-level': { kind: 'first-level', level: 2, pointsToNext: 50 },
      'new-tier': { kind: 'new-tier', tier: 'lueur', nextTierLevel: 20 },
      'missions-unlocked': { kind: 'missions-unlocked' },
      'first-mint-possible': { kind: 'first-mint-possible', price: 1221, levelsLost: 5, gloryGain: 100 },
      'first-mint': event,
      'badge-extinguished': { kind: 'badge-extinguished', missingActions: 37 },
      'price-rises': { kind: 'price-rises', nextPrice: 1294 },
      'new-rank': { kind: 'new-rank', rank: 'voix', division: 2, glory: 1700, gloryMissing: 300 },
      'treasury-tier': { kind: 'treasury-tier', tier: 'escarcelle', nextTierMissing: 40 },
      'flame-at-risk': { kind: 'flame-at-risk', days: 6 },
      'flame-out': { kind: 'flame-out', lostDays: 0, relightPrice: 3, canRelight: true },
      'return-after-absence': { kind: 'return-after-absence', daysAway: 9 },
      'level-100': { kind: 'level-100', canPrestige: true },
    };
    for (const key of GUIDE_MOMENT_KEYS) {
      const sample = samples[key];
      if (sample === undefined) throw new Error(`échantillon manquant : ${key}`);
      const card = cardOfMoment(guideMoment(sample, []));
      expect(card.copy.what.length).toBeGreaterThan(3);
    }
  });
});

describe('une carte pour une étape de l’intégration', () => {
  test('la clé vue est celle de la loi, l’étape se numérote sur sept', () => {
    const step = ONBOARDING_STEPS[2];
    if (step === undefined) throw new Error('étape attendue');
    const card = cardOfStep(step);
    expect(card.key).toBe('onboarding.levels');
    expect(card.step).toEqual({ index: 3, total: 7 });
    expect(card.presentation).toBe('full');
    expect(card.speaker).toBe('meo');
  });
});

describe('une étape qui attend son geste', () => {
  const stepOf = (key: string) => {
    const step = ONBOARDING_STEPS.find((candidate) => candidate.key === key);
    if (step === undefined) throw new Error(`étape attendue : ${key}`);
    return step;
  };
  const view = (patch: Parameters<typeof gameBlockFixture>[0]) => ({
    ...resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE),
    game: gameBlockFixture(patch),
  });

  test('la carte le dit, et son bouton mène là où le geste se fait', () => {
    const waiting = cardOfStep(stepOf('missions'), view({ score: 800, missions: [] }));
    expect(waiting.awaiting).toBe(true);
    expect(waiting.action).toBe('see-missions');
    expect(waiting.copy.action).toBe('Voir les missions');
    expect(waiting.copy.next).toContain('mission la plus facile');
    expect(waiting.stepKey).toBe('missions');
  });

  test('le geste déjà fait : une carte ordinaire, avec le bouton de la loi', () => {
    const done = cardOfStep(
      stepOf('missions'),
      view({
        score: 800,
        missions: [
          { id: 'm', difficulty: 'easy', templateKey: 'send-texts', signal: 'axis:content.text_message', prism: false, target: 5, progress: 5, reward: 36, glory: 0, completedAt: '2026-10-05T08:00:00.000Z' },
        ],
      }),
    );
    expect(done.awaiting).toBe(false);
    expect(done.action).toBe('see-flame');
  });

  test('sans lecture du jeu, ou pour une étape sans geste : une carte ordinaire', () => {
    expect(cardOfStep(stepOf('levels')).awaiting).toBe(false);
    expect(cardOfStep(stepOf('missions')).awaiting).toBe(false);
    expect(cardOfStep(stepOf('levels'), view({})).awaiting).toBe(false);
  });
});
