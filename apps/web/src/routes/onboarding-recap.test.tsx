import { beforeAll, describe, expect, test } from 'bun:test';

import { loadOnboardingCatalog } from '@/lib/i18n-onboarding-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { recapTiles, type RecapNumbers } from './onboarding-recap';

/**
 * LA TUILE DE SÉRIE DU RÉCAPITULATIF (#7729) — elle dit une DURÉE : l'unité
 * « jour » s'y lit, accordée au nombre, et la flamme n'y apparaît qu'une fois
 * (le glyphe de la tuile la porte déjà ; un emoji dans le texte la doublait).
 */

const numbers = (streakDays: number): RecapNumbers => ({ points: 14, level: 1, streakDays, badges: 1 });

const streakText = (lang: InterfaceLanguage, days: number): string => {
  const tile = recapTiles({ lang, online: true, points: 14 }, numbers(days), 0).find((candidate) => candidate.id === 'streak');
  if (tile === undefined) throw new Error('tuile de série absente');
  return tile.text;
};

beforeAll(async () => {
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadOnboardingCatalog(language)));
});

describe('la tuile de série dit des jours, accordés au nombre', () => {
  test('français : « Série : 1 jour », « Série : 3 jours »', () => {
    expect(streakText('fr', 1)).toBe('Série : 1 jour');
    expect(streakText('fr', 3)).toBe('Série : 3 jours');
  });

  test('anglais : singulier et pluriel', () => {
    expect(streakText('en', 1)).toBe('Streak: 1 day');
    expect(streakText('en', 4)).toBe('Streak: 4 days');
  });

  test('chaque langue nomme l’unité, et la change entre 1 et 5 jours', () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      const one = streakText(language, 1);
      const five = streakText(language, 5);
      expect({ language, differs: one.replace('1', '') !== five.replace('5', '') }).toEqual({ language, differs: true });
    }
  });

  test('aucune flamme dans le texte : le glyphe de la tuile la porte déjà', () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      expect({ language, flame: streakText(language, 2).includes('🔥') }).toEqual({ language, flame: false });
    }
  });
});
