import { describe, expect, test } from 'bun:test';

import { SUPPORTED_INTERFACE_LANGUAGES } from '../inline-interface-language-bootstrap.js';
import { loadGameCatalog } from '../i18n-game-catalog';
import { leagueName, remainingLabel, visibilityLabel, weekLabel, zoneLabel } from './game-copy-v2';

/**
 * CE QUE LA VAGUE 2 DIT (#9481) — les noms des huit ligues, des zones, des
 * trois niveaux de visibilité, et le compte à rebours CALME de la fermeture :
 * jours et heures, puis heures, puis minutes — jamais des secondes qui défilent,
 * qui pousseraient à jouer (conformité B-5 : aucune pression).
 */
const close = { dayKey: '2026-11-08', minuteOfDay: 20 * 60 };
const at = (iso: string): Date => new Date(iso);

describe('le compte à rebours de la fermeture', () => {
  test('à plus d’un jour : jours et heures', () => {
    expect(remainingLabel(close, at('2026-11-05T14:00:00'), 'fr')).toBe('3 j 6 h');
  });

  test('sous un jour : heures', () => {
    expect(remainingLabel(close, at('2026-11-08T11:30:00'), 'fr')).toBe('8 h');
  });

  test('sous une heure : minutes', () => {
    expect(remainingLabel(close, at('2026-11-08T19:15:00'), 'fr')).toBe('45 min');
  });

  test('une fois passée : une minute, jamais un nombre négatif', () => {
    expect(remainingLabel(close, at('2026-11-09T09:00:00'), 'fr')).toBe('1 min');
  });

  test('dans la langue demandée', async () => {
    await loadGameCatalog('de');
    expect(remainingLabel(close, at('2026-11-05T14:00:00'), 'de')).toBe('3 T 6 Std.');
  });
});

describe('les noms', () => {
  test('les huit ligues, dans les sept langues, jamais la clé', async () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      await loadGameCatalog(language);
      for (const key of ['quartz', 'ambre', 'jade', 'saphir', 'rubis', 'amethyste', 'diamant', 'prisme'] as const) {
        expect(leagueName(key, language)).not.toContain('game.league');
      }
    }
    expect(leagueName('saphir', 'en')).toBe('Sapphire');
    expect(leagueName('amethyste', 'fr')).toBe('Améthyste');
  });

  test('les zones et la visibilité', async () => {
    await loadGameCatalog('en');
    expect(zoneLabel('promotion', 'fr')).toBe('Montée');
    expect(zoneLabel('relegation', 'en')).toBe('Relegation');
    expect(visibilityLabel('me', 'fr')).toBe('Moi seul');
    expect(visibilityLabel('friends', 'en')).toBe('My friends');
  });

  test('la semaine se dit par son lundi, dans la langue', async () => {
    await loadGameCatalog('en');
    expect(weekLabel('2026-11-02', 'fr')).toBe('Semaine du 2 novembre');
    expect(weekLabel('2026-11-02', 'en')).toBe('Week of November 2');
  });
});
