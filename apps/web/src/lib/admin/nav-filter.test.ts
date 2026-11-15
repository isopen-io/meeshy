import { describe, expect, test } from 'bun:test';

import { foldForSearch, matchesNavQuery } from './nav-filter';

describe('« Aller à… » — la règle de filtrage du menu (#10562)', () => {
  test('ni casse ni accents', () => {
    expect(foldForSearch('  Journal d’Audit ')).toBe('journal d’audit');
    expect(foldForSearch('Désactivé')).toBe('desactive');
  });

  test('chaque mot tapé doit se trouver dans le libellé ou son groupe', () => {
    expect(matchesNavQuery('jour aud', ['Journal d’audit', 'Système'])).toBe(true);
    expect(matchesNavQuery('PERSONNES', ['Comptes', 'Personnes'])).toBe(true);
    expect(matchesNavQuery('statistiques', ['Comptes', 'Personnes'])).toBe(false);
    expect(matchesNavQuery('comptes zzz', ['Comptes', 'Personnes'])).toBe(false);
  });

  test('une recherche vide garde tout', () => {
    expect(matchesNavQuery('   ', ['Comptes'])).toBe(true);
  });
});
