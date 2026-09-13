import { describe, expect, test } from 'bun:test';

import { railTientLaPlace } from './story-tray';

/**
 * Le rail des stories réserve sa hauteur PENDANT que son corpus arrive, et
 * seulement pendant. Ce fichier mesure la borne — celle qui manquait (#6080,
 * relevée par `check-gateway-build.mjs`).
 */
describe('railTientLaPlace — un squelette est une promesse', () => {
  test('tient la place pendant la première requête, qui n’a encore rien dit', () => {
    expect(railTientLaPlace({ data: undefined, isError: false, failureCount: 0 })).toBe(true);
  });

  /**
   * LE TÉMOIN DE LA RÉGRESSION. Avant la borne, ce cas rendait `true` pendant
   * les trois tentatives de react-query et leur repli exponentiel : une bande
   * vide de 174 px au-dessus d'un écran vide, plusieurs secondes, puis rien.
   */
  test('lâche la place dès la PREMIÈRE tentative échouée, sans attendre les suivantes', () => {
    expect(railTientLaPlace({ data: undefined, isError: false, failureCount: 1 })).toBe(false);
    expect(railTientLaPlace({ data: undefined, isError: false, failureCount: 3 })).toBe(false);
  });

  test('lâche la place sur une erreur définitive', () => {
    expect(railTientLaPlace({ data: undefined, isError: true, failureCount: 3 })).toBe(false);
  });

  /**
   * Un corpus LENT n'est pas un corpus ABSENT : tant qu'aucune tentative n'a
   * échoué, la place reste tenue, quel que soit le temps que ça prend. C'est la
   * moitié que la borne ne doit PAS mordre.
   */
  test('tient la place d’un corpus lent — la lenteur n’est pas un refus', () => {
    expect(railTientLaPlace({ data: undefined, isError: false, failureCount: 0 })).toBe(true);
  });

  test('lâche la place dès que le corpus est arrivé — même vide', () => {
    expect(railTientLaPlace({ data: [], isError: false, failureCount: 0 })).toBe(false);
  });
});
