import { describe, expect, test } from 'bun:test';

import { searchStateOf } from './global-search-state';

/**
 * #14619 / #14620 — L'ÉTAT D'UNE RECHERCHE : sous deux caractères rien ne part
 * (repos), une première page attendue est un chargement, un échec se dit
 * « hors ligne » quand le réseau manque, et jamais de chargement plein écran
 * quand des résultats sont déjà là.
 */
describe('searchStateOf', () => {
  test('requête trop courte ⇒ repos, quel que soit le reste', () => {
    expect(searchStateOf({ query: null, isPending: true, isError: true, online: true })).toBe('idle');
  });

  test('première page attendue ⇒ chargement ; servie ⇒ prête', () => {
    expect(searchStateOf({ query: 'plage', isPending: true, isError: false, online: true })).toBe('loading');
    expect(searchStateOf({ query: 'plage', isPending: false, isError: false, online: true })).toBe('ready');
  });

  test('un échec se dit hors ligne sans réseau, échec sinon', () => {
    expect(searchStateOf({ query: 'plage', isPending: false, isError: true, online: false })).toBe('offline');
    expect(searchStateOf({ query: 'plage', isPending: false, isError: true, online: true })).toBe('error');
  });
});
