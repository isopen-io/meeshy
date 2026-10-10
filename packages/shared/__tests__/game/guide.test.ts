/**
 * Mee et Meo, les guides (#9373) : la loi qui choisit le moment, sans un mot
 * en toutes lettres — les clients localisent.
 */

import { describe, it, expect } from 'vitest';
import {
  GUIDE_MOMENT_KEYS,
  ONBOARDING_STEPS,
  chooseGuideMoment,
  guideMoment,
  nextOnboardingStep,
  onboardingStepSeenKey,
  type GuideEvent,
} from '../../utils/game/guide.js';
import { mascotEvent, mascotMoment } from '../../utils/mascot.js';

describe('l\'intégration en sept étapes', () => {
  it('porte sept clés stables, dans l\'ordre de la conception', () => {
    expect(ONBOARDING_STEPS.map((s) => s.key)).toEqual(['welcome', 'first-points', 'levels', 'missions', 'flame', 'mint', 'rank']);
    expect(ONBOARDING_STEPS.map((s) => s.index)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('donne à chaque étape un locuteur, une humeur et une action suivante', () => {
    expect(ONBOARDING_STEPS.map((s) => s.speaker)).toEqual(['mee', 'mee', 'meo', 'mee', 'meo', 'duo', 'meo']);
    for (const step of ONBOARDING_STEPS) {
      expect(step.mood.length).toBeGreaterThan(0);
      expect(step.action.length).toBeGreaterThan(0);
    }
  });

  it('reprend là où le joueur s\'est arrêté', () => {
    expect(nextOnboardingStep([])?.key).toBe('welcome');
    expect(nextOnboardingStep([onboardingStepSeenKey('welcome'), onboardingStepSeenKey('first-points')])?.key).toBe('levels');
    expect(nextOnboardingStep(ONBOARDING_STEPS.map((s) => onboardingStepSeenKey(s.key)))).toBeNull();
  });
});

describe('les moments récurrents', () => {
  const events: readonly GuideEvent[] = [
    { kind: 'first-level', level: 2, pointsToNext: 50 },
    { kind: 'new-tier', tier: 'lueur', nextTierLevel: 20 },
    { kind: 'missions-unlocked' },
    { kind: 'first-mint-possible', price: 1221, levelsLost: 5, gloryGain: 100 },
    { kind: 'first-mint', levelBefore: 14, levelAfter: 9, tailwindUntilLevel: 14 },
    { kind: 'badge-extinguished', missingActions: 37 },
    { kind: 'price-rises', nextPrice: 1294 },
    { kind: 'new-rank', rank: 'voix', division: 2, glory: 2200, gloryMissing: 634 },
    { kind: 'treasury-tier', tier: 'escarcelle', nextTierMissing: 40 },
    { kind: 'flame-at-risk', days: 12 },
    { kind: 'flame-out', lostDays: 12, relightPrice: 3, canRelight: true },
    { kind: 'return-after-absence', daysAway: 9 },
    { kind: 'level-100', canPrestige: true },
  ];

  it('couvre les treize moments de la conception', () => {
    expect([...GUIDE_MOMENT_KEYS].sort()).toEqual(events.map((e) => e.kind).sort());
  });

  it('rend clé, locuteur, humeur, données chiffrées, action suivante et présentation', () => {
    const moment = guideMoment(events[3]!, []);
    expect(moment).toEqual({
      key: 'first-mint-possible',
      speaker: 'meo',
      mood: 'ready',
      data: { price: 1221, levelsLost: 5, gloryGain: 100 },
      action: 'mint-or-climb',
      presentation: 'full',
    });
  });

  it('fait parler les bons guides, Meo quand quelque chose baisse ou s\'éteint', () => {
    const speakers = Object.fromEntries(events.map((e) => [e.kind, guideMoment(e, []).speaker]));
    expect(speakers).toEqual({
      'first-level': 'mee',
      'new-tier': 'duo',
      'missions-unlocked': 'mee',
      'first-mint-possible': 'meo',
      'first-mint': 'duo',
      'badge-extinguished': 'meo',
      'price-rises': 'meo',
      'new-rank': 'duo',
      'treasury-tier': 'mee',
      'flame-at-risk': 'meo',
      'flame-out': 'meo',
      'return-after-absence': 'mee',
      'level-100': 'duo',
    });
  });

  it('est triste quand la Flamme s\'éteint', () => {
    expect(guideMoment({ kind: 'flame-out', lostDays: 3, relightPrice: 3, canRelight: false }, []).mood).toBe('sad');
  });

  it('montre le moment en entier la première fois, en version courte ensuite', () => {
    expect(guideMoment(events[0]!, []).presentation).toBe('full');
    expect(guideMoment(events[0]!, ['first-level']).presentation).toBe('short');
    expect(guideMoment(events[0]!, ['new-tier']).presentation).toBe('full');
  });

  it('accepte l\'ensemble des clés vues sous forme de Set', () => {
    expect(guideMoment(events[1]!, new Set(['new-tier'])).presentation).toBe('short');
  });

  it('ne choisit qu\'une carte par ouverture d\'écran, la plus importante', () => {
    const chosen = chooseGuideMoment([events[0]!, events[7]!, events[9]!], []);
    expect(chosen?.key).toBe('new-rank');
    expect(chooseGuideMoment([], [])).toBeNull();
  });

  it('préfère le moment inédit au moment déjà vu à importance voisine', () => {
    const chosen = chooseGuideMoment([events[9]!, events[8]!], ['flame-at-risk']);
    expect(chosen?.key).toBe('treasury-tier');
  });
});

describe('la loi actuelle de la mascotte reste intacte', () => {
  it('exporte toujours mascotEvent et mascotMoment', () => {
    expect(typeof mascotEvent).toBe('function');
    expect(typeof mascotMoment).toBe('function');
  });
});
