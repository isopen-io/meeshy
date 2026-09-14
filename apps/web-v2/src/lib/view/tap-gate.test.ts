import { describe, expect, test } from 'bun:test';

import { DOUBLE_TAP_MS, createTapGate } from './tap-gate';

/**
 * LE SECOND TAP D'UN DOUBLE TAP N'ATTEINT AUCUN GESTE (#6417). Un geste
 * optimiste REMPLACE ce qu'il touche : la ligne refusée quitte la liste, « Ajouter »
 * devient « En attente », « Désactiver » devient « Activer ». Le second tap d'un
 * double tap tombe alors sur la ligne ou le bouton qui a pris la place — mesuré :
 * deux personnes refusées, une demande envoyée puis annulée, un lien réactivé.
 */

const clockAt = (...instants: readonly number[]) => {
  const queue = [...instants];
  return () => queue.shift() ?? Number.POSITIVE_INFINITY;
};

describe('createTapGate', () => {
  test('le premier tap passe', () => {
    const admit = createTapGate(clockAt(1_000));
    expect(admit()).toBe(true);
  });

  test('le second tap d’un double tap (120 ms) est retenu', () => {
    const admit = createTapGate(clockAt(1_000, 1_120));
    expect([admit(), admit()]).toEqual([true, false]);
  });

  test('un tap posé après la fenêtre du double tap passe', () => {
    const admit = createTapGate(clockAt(1_000, 1_000 + DOUBLE_TAP_MS));
    expect([admit(), admit()]).toEqual([true, true]);
  });

  test('un triple tap rapide reste UN geste : la fenêtre part du tap précédent, retenu ou non', () => {
    const admit = createTapGate(clockAt(1_000, 1_200, 1_400, 1_800));
    expect([admit(), admit(), admit(), admit()]).toEqual([true, false, false, true]);
  });
});
