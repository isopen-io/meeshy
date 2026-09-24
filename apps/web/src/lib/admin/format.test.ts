import { describe, expect, test } from 'bun:test';

import { adminCount, adminDay, adminMoment } from './format';

/**
 * **UN HORODATAGE SERVI N'EST PAS UN HORODATAGE AFFICHABLE** (#6819,
 * revue-recette au navigateur).
 *
 * La fiche d'un membre peignait `createdAt` et `lastActiveAt` TELS QUELS —
 * « Inscrit le 2026-01-12T08:30:00.000Z ». Le champ était juste, son décodage
 * était juste, et aucun témoin ne pouvait tomber : la valeur affichée ÉTAIT la
 * valeur servie. Seul un œil sur l'écran voit la différence, et c'est la
 * recette au navigateur qui l'a vue.
 *
 * Le site est UNIQUE parce qu'il l'était déjà à moitié : l'écran de l'agent
 * portait la même ligne `Intl.DateTimeFormat`, en privé. Deux écrans
 * d'administration qui formatent une date de deux façons finissent par la
 * formater de deux façons.
 */
describe('adminMoment', () => {
  test('rend une date LOCALISÉE, jamais la chaîne ISO servie', () => {
    const rendu = adminMoment('2026-01-12T08:30:00.000Z', 'fr');
    expect(rendu).not.toContain('2026-01-12T08:30:00.000Z');
    expect(rendu).toContain('12/01/2026');
  });

  test('la LANGUE décide de la forme — sinon le formateur ne sert à rien', () => {
    const iso = '2026-01-12T08:30:00.000Z';
    expect(adminMoment(iso, 'fr')).not.toBe(adminMoment(iso, 'en'));
  });

  test('une absence se DIT par un tiret, jamais par une date de 1970', () => {
    expect(adminMoment(null, 'fr')).toBe('—');
  });

  /**
   * `new Date('pas une date')` rend une `Invalid Date`, que `Intl` formate en
   * « Invalid Date » — un texte anglais non traduit, au milieu d'une fiche. Une
   * charge illisible se dit comme une absence : c'est ce qu'elle est.
   */
  test('une chaîne illisible se dit comme une absence, pas « Invalid Date »', () => {
    expect(adminMoment('pas-une-date', 'fr')).toBe('—');
  });
});

/**
 * UN COMPTEUR ET UN JOUR, DANS LA LANGUE DE LA PAGE (#7845) — les tuiles de
 * statistiques et les dates sans heure (naissance, consentement, fin de série).
 * Même site que `adminMoment`, pour la même raison : deux écrans qui formatent
 * un nombre de deux façons finissent par le formater de deux façons.
 */
describe('adminCount', () => {
  test('groupe les milliers selon la LANGUE', () => {
    expect(adminCount(12345, 'en')).toBe('12,345');
    expect(adminCount(12345, 'fr')).not.toBe(adminCount(12345, 'en'));
  });

  test('un compteur illisible se dit par un tiret', () => {
    expect(adminCount(Number.NaN, 'fr')).toBe('—');
    expect(adminCount(-1, 'fr')).toBe('—');
  });
});

describe('adminDay', () => {
  test('rend un JOUR localisé, sans heure', () => {
    const rendu = adminDay('2026-01-12T08:30:00.000Z', 'fr');
    expect(rendu).toContain('2026');
    expect(rendu).not.toContain('08:30');
    expect(rendu).not.toBe(adminDay('2026-01-12T08:30:00.000Z', 'en'));
  });

  test('une absence ou une charge illisible se dit par un tiret', () => {
    expect(adminDay(null, 'fr')).toBe('—');
    expect(adminDay('pas-une-date', 'fr')).toBe('—');
  });
});
