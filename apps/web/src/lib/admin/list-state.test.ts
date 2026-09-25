import { describe, expect, test } from 'bun:test';

import { defineListSpec, parseListState, serializeListState, toggleSort, withFilter, withPage, withSearch } from './list-state';

const SPEC = defineListSpec({
  sortKeys: ['createdAt', 'username', 'lastActiveAt'],
  defaultSort: 'createdAt',
  ascendingFirst: ['username'],
  filters: { role: ['USER', 'ADMIN'], isActive: ['true', 'false'] },
  pageSizes: [20, 50, 100],
});

const sousEnsemble = (etat: object, attendu: object): object =>
  Object.fromEntries(Object.keys(attendu).map((cle) => [cle, (etat as Record<string, unknown>)[cle]]));

const parse = (chaine: string) => parseListState(new URLSearchParams(chaine), SPEC);

describe('l’état d’une liste d’administration vit dans l’adresse', () => {
  test('une adresse nue rend le tri par défaut, décroissant, première page', () => {
    expect(parse('')).toEqual({ sort: 'createdAt', order: 'desc', filters: {}, q: '', offset: 0, limit: 20 });
  });

  test('une adresse complète se relit telle quelle', () => {
    expect(parse('sort=username&order=asc&role=ADMIN&q=ali&offset=40&limit=50')).toEqual({
      sort: 'username',
      order: 'asc',
      filters: { role: 'ADMIN' },
      q: 'ali',
      offset: 40,
      limit: 50,
    });
  });

  test('une valeur hors liste blanche est ignorée, jamais transmise', () => {
    expect(parse('sort=password&order=sideways&role=ROOT&limit=5000&offset=-3')).toEqual({
      sort: 'createdAt',
      order: 'desc',
      filters: {},
      q: '',
      offset: 0,
      limit: 20,
    });
  });

  test('l’état se réécrit sans les valeurs par défaut, pour une adresse courte', () => {
    const etat = parse('sort=username&order=asc&role=ADMIN');
    expect(serializeListState(etat, SPEC).toString()).toBe('sort=username&order=asc&role=ADMIN');
    expect(serializeListState(parse(''), SPEC).toString()).toBe('');
  });
});

describe('trier une colonne', () => {
  test('recliquer la colonne active inverse l’ordre', () => {
    expect(toggleSort(parse(''), 'createdAt', SPEC).order).toBe('asc');
  });

  test('une nouvelle colonne de TEXTE part dans l’ordre alphabétique', () => {
    expect(sousEnsemble(toggleSort(parse(''), 'username', SPEC), { sort: 'username', order: 'asc' })).toEqual({ sort: 'username', order: 'asc' });
  });

  test('une nouvelle colonne de DATE part de la plus récente', () => {
    expect(sousEnsemble(toggleSort(parse('sort=username&order=asc'), 'lastActiveAt', SPEC), { sort: 'lastActiveAt', order: 'desc' })).toEqual({ sort: 'lastActiveAt', order: 'desc' });
  });

  test('changer de tri repart de la première page', () => {
    expect(toggleSort(parse('offset=60'), 'username', SPEC).offset).toBe(0);
  });
});

describe('filtrer et chercher repartent de la première page', () => {
  test('poser un filtre', () => {
    expect(sousEnsemble(withFilter(parse('offset=40'), 'role', 'ADMIN', SPEC), { filters: { role: 'ADMIN' }, offset: 0 })).toEqual({ filters: { role: 'ADMIN' }, offset: 0 });
  });

  test('retirer un filtre avec la valeur vide', () => {
    expect(withFilter(parse('role=ADMIN'), 'role', '', SPEC).filters).toEqual({});
  });

  test('une valeur de filtre inconnue ne s’écrit pas', () => {
    expect(withFilter(parse(''), 'role', 'ROOT', SPEC).filters).toEqual({});
  });

  test('chercher', () => {
    expect(sousEnsemble(withSearch(parse('offset=40'), 'bob'), { q: 'bob', offset: 0 })).toEqual({ q: 'bob', offset: 0 });
  });

  test('changer la taille de page repart du début, avancer garde la taille', () => {
    expect(sousEnsemble(withPage(parse('offset=40'), { limit: 50 }, SPEC), { limit: 50, offset: 0 })).toEqual({ limit: 50, offset: 0 });
    expect(sousEnsemble(withPage(parse('limit=50'), { offset: 50 }, SPEC), { limit: 50, offset: 50 })).toEqual({ limit: 50, offset: 50 });
  });
});
