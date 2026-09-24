import { describe, expect, test } from 'bun:test';

import { adminMoment } from './format';

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
