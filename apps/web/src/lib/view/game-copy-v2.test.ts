import { describe, expect, test } from 'bun:test';

import { SUPPORTED_INTERFACE_LANGUAGES } from '../inline-interface-language-bootstrap.js';
import { loadGameCatalog } from '../i18n-game-catalog';
import { levelRingLabelWithPrestige, awardedDate, dayLabel, awardedMonthLabel, isoWeekNumber, languageName, leagueName, remainingLabel, seasonThemeName, timerLabel, trophyView, visibilityLabel, weekLabel, zoneLabel } from './game-copy-v2';

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

describe('le décompte d’une carte de mission (#9539)', () => {
  const MIN = 60_000;

  test('des heures ET des minutes : une plage de deux heures ne dit jamais « 1 h » pendant cinquante-neuf minutes', () => {
    expect(timerLabel(119 * MIN, 'fr')).toBe('1 h 59 min');
    expect(timerLabel(90 * MIN, 'fr')).toBe('1 h 30 min');
    expect(timerLabel(61 * MIN, 'fr')).toBe('1 h 1 min');
  });

  test('une heure ronde, moins d’une heure, plus d’un jour : la lecture calme d’avant', () => {
    expect(timerLabel(120 * MIN, 'fr')).toBe('2 h');
    expect(timerLabel(59 * MIN, 'fr')).toBe('59 min');
    expect(timerLabel(26 * 60 * MIN, 'fr')).toBe('1 j 2 h');
  });

  test('jamais de secondes, jamais moins d’une minute, jamais négatif', () => {
    expect(timerLabel(59_000, 'fr')).toBe('1 min');
    expect(timerLabel(0, 'fr')).toBe('1 min');
    expect(timerLabel(-5 * MIN, 'fr')).toBe('1 min');
    expect(timerLabel(89 * MIN + 1, 'fr')).toBe('1 h 30 min');
  });

  test('en arabe, chaque nombre reste isolé dans le sens de lecture', async () => {
    await loadGameCatalog('ar');
    expect(timerLabel(90 * MIN, 'ar')).toMatch(/^\u2066[^\u2069]+\u2069 س \u2066[^\u2069]+\u2069 د$/);
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

describe('les langues', () => {
  test('le nom d’une langue se dit dans la langue de l’interface', () => {
    expect(languageName('sw', 'fr')).toBe('Swahili');
    expect(languageName('ja', 'en')).toBe('Japanese');
    expect(languageName('ar', 'es')).toBe('Árabe');
  });

  test('un code que le moteur ne sait pas nommer reste le code, en capitales', () => {
    expect(languageName('zz-invalid-code!!', 'fr')).toBe('ZZ-INVALID-CODE!!');
  });

  test('le thème d’une saison : une langue se nomme, un thème inconnu se tait', () => {
    expect(seasonThemeName('language:sw', 'fr')).toBe('Swahili');
    expect(seasonThemeName('region:antilles', 'fr')).toBeNull();
  });
});

describe('les trophées', () => {
  test('la semaine ISO d’un lundi', () => {
    expect(isoWeekNumber('2026-10-26')).toBe(44);
    expect(isoWeekNumber('2026-01-05')).toBe(2);
    expect(isoWeekNumber('2024-12-30')).toBe(1);
  });

  test('une coupe de ligue : la matière de la coupe, le titre, la plaque', () => {
    const view = trophyView('trophy.league-cup.2026-10-26.jade.silver', 'fr');
    expect(view).toEqual({ kind: 'league', material: 'silver', title: 'Coupe d’argent — ligue Jade, semaine du 26 octobre', plate: 'JADE · S44' });
  });

  test('une coupe de ligue vue par un visiteur porte le MOIS : titre et plaque sans semaine', () => {
    const view = trophyView('trophy.league-cup.2026-10.jade.silver', 'fr');
    expect(view).toEqual({ kind: 'league', material: 'silver', title: 'Coupe d’argent — ligue Jade, octobre 2026', plate: 'JADE · OCT. 2026' });
    expect(trophyView('trophy.league-cup.2026-10.jade.silver', 'en')?.title).toBe('Silver cup — Jade league, October 2026');
  });

  test('la coupe de saison, de Prestige, de Flamme', () => {
    expect(trophyView('trophy.season-cup.1', 'fr')).toMatchObject({ kind: 'season', title: 'Coupe de la saison 1', plate: 'SAISON 1' });
    expect(trophyView('trophy.prestige.2', 'fr')).toMatchObject({ kind: 'prestige', title: 'Trophée de Prestige 2', plate: 'PRESTIGE 2' });
    expect(trophyView('trophy.flame.100', 'fr')).toMatchObject({ kind: 'flame', title: 'Trophée de Flamme, 100 jours', plate: '100 JOURS' });
  });

  test('une clé inconnue ne se nomme pas', () => {
    expect(trophyView('trophy.cometa.9', 'fr')).toBeNull();
    expect(trophyView('n’importe quoi', 'fr')).toBeNull();
  });

  test('un propriétaire voit la date, un visiteur le mois seulement', () => {
    expect(awardedDate('2026-10-25T18:00:00.000Z', 'fr')).toMatch(/octobre 2026/);
    expect(awardedMonthLabel('2026-10', 'fr')).toBe('octobre 2026');
    expect(awardedMonthLabel('2026-10', 'fr')).not.toMatch(/\d{1,2} octobre/);
  });
});

describe('les jours', () => {
  test('un jour local se dit dans la langue, sans glisser d’un fuseau à l’autre', () => {
    expect(dayLabel('2026-08-02', 'fr')).toBe('2 août 2026');
    expect(dayLabel('2026-08-02', 'en')).toBe('August 2, 2026');
  });
});

describe('l’anneau de niveau, lu', () => {
  test('sans Prestige : le libellé d’avant ; avec : les étoiles se disent aussi', () => {
    expect(levelRingLabelWithPrestige(34, 'eclat', 0, 'fr')).toBe('Niveau 34, palier Éclat, quatrième palier');
    expect(levelRingLabelWithPrestige(34, 'eclat', 2, 'fr')).toBe('Niveau 34, palier Éclat, quatrième palier, Étoiles : 2 sur 5');
  });
});
