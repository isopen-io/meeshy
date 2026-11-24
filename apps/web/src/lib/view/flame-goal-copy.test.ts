import { beforeAll, describe, expect, test } from 'bun:test';

import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

import { flameGoalLine, flameGoalNextAction, flameGoalRefusal, flameGoalView, readFlameGoal } from './flame-goal-copy';
import { gameErrorMessage } from './game-copy';

beforeAll(async () => {
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadGameCatalog(language)));
});

const NAMED = (text: string): boolean => text.trim().length > 0 && !text.startsWith('game.') && !text.includes('{') && !text.includes('undefined');

describe('l’objectif de Flamme servi se lit (#20521)', () => {
  test('le choix du premier jour et l’objectif retenu se lisent', () => {
    expect(readFlameGoal({ offer: [7, 14, 30], current: null })).toEqual({ offer: [7, 14, 30], current: null });
    expect(readFlameGoal({ offer: [], current: { target: 14, remaining: 5, reached: false, next: null } })).toEqual({
      offer: [],
      current: { target: 14, remaining: 5, reached: false, next: null },
    });
  });

  test('absent ou illisible, la carte d’avant', () => {
    expect(readFlameGoal(undefined)).toBeNull();
    expect(readFlameGoal({ offer: '7' })).toBeNull();
    expect(readFlameGoal({ offer: [7, -1], current: null })).toBeNull();
    expect(readFlameGoal({ offer: [], current: { target: 7, remaining: 1 } })).toBeNull();
    expect(readFlameGoal({ offer: [], current: { target: 7, remaining: 0, reached: 'oui', next: 14 } })).toBeNull();
  });
});

describe('ce que la carte montre de l’objectif (#20521)', () => {
  test('au premier jour : les choix', () => {
    expect(flameGoalView({ offer: [7, 14, 30], current: null }, false)).toEqual({ kind: 'choose', offer: [7, 14, 30] });
  });

  test('en cours : ce qu’il reste', () => {
    expect(flameGoalView({ offer: [], current: { target: 14, remaining: 5, reached: false, next: null } }, false)).toEqual({ kind: 'running', target: 14, remaining: 5 });
  });

  test('atteint : le signe des aïeux et la marche suivante, jusqu’à ce qu’on le ferme', () => {
    const reached = { offer: [14], current: { target: 7, remaining: 0, reached: true, next: 14 } };
    expect(flameGoalView(reached, false)).toEqual({ kind: 'reached', target: 7, next: 14 });
    expect(flameGoalView(reached, true)).toBeNull();
  });

  test('rien à dire : rien ne se montre, pas même un échec', () => {
    expect(flameGoalView(null, false)).toBeNull();
    expect(flameGoalView({ offer: [], current: null }, false)).toBeNull();
  });
});

describe('l’objectif se dit (#20521)', () => {
  test('en cours, la carte dit l’objectif et ce qu’il reste, au pluriel juste', () => {
    expect(flameGoalLine({ kind: 'running', target: 14, remaining: 1 }, 'fr')).toBe('Objectif : 14 jours de Flamme. Encore 1 jour.');
    expect(flameGoalLine({ kind: 'running', target: 7, remaining: 5 }, 'fr')).toBe('Objectif : 7 jours de Flamme. Encore 5 jours.');
  });

  test('atteint, les aïeux le saluent', () => {
    expect(flameGoalLine({ kind: 'reached', target: 7, next: 14 }, 'fr')).toBe('Tes aïeux saluent ta Flamme : 7 jours tenus !');
  });

  test('la marche suivante se propose par ses jours', () => {
    expect(flameGoalNextAction(14, 'fr')).toBe('Viser 14 jours');
  });

  test('dans chaque langue, chaque phrase est écrite et chaque refus a la sienne', () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      expect(NAMED(flameGoalLine({ kind: 'running', target: 14, remaining: 5 }, language))).toBe(true);
      expect(NAMED(flameGoalLine({ kind: 'reached', target: 7, next: 14 }, language))).toBe(true);
      expect(NAMED(flameGoalLine({ kind: 'choose', offer: [7, 14, 30] }, language))).toBe(true);
      expect(NAMED(flameGoalNextAction(14, language))).toBe(true);
      const general = gameErrorMessage('FLAME_GOAL_NOT_ALLOWED', language);
      const phrases = (['not-offered', 'no-flame'] as const).map((reason) => flameGoalRefusal(reason, language));
      expect(new Set([general, ...phrases]).size).toBe(3);
      for (const phrase of phrases) expect(NAMED(phrase)).toBe(true);
      expect(flameGoalRefusal(undefined, language)).toBe(general);
    }
  });
});
