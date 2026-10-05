import { describe, expect, test } from 'bun:test';

import { defineListSpec, parseListState, serializeListState, toggleSort, withFilter, withIdFilter, withPage, withSearch } from './list-state';

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
    expect(parse('')).toEqual({ sort: 'createdAt', order: 'desc', filters: {}, ids: {}, q: '', offset: 0, limit: 20 });
  });

  test('une adresse complète se relit telle quelle', () => {
    expect(parse('sort=username&order=asc&role=ADMIN&q=ali&offset=40&limit=50')).toEqual({
      sort: 'username',
      order: 'asc',
      filters: { role: 'ADMIN' },
      ids: {},
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
      ids: {},
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

/**
 * LES FILTRES PAR IDENTIFIANT (#8876) — `?senderId=…`, posé depuis la fiche d'un
 * membre pour ne lister que SES demandes. Ce que l'adresse apporte passe par une
 * liste blanche, et un identifiant n'a qu'une forme : 24 caractères
 * hexadécimaux. Tout le reste est ignoré, jamais transmis à la passerelle.
 */
describe('un filtre par identifiant n’accepte qu’un ObjectId', () => {
  const ID_SPEC = defineListSpec({
    sortKeys: ['createdAt'],
    defaultSort: 'createdAt',
    ascendingFirst: [],
    filters: { status: ['pending', 'accepted'] },
    idFilters: ['senderId', 'reportedEntityId'],
    pageSizes: [20],
  });
  const ID = '64f1c2a9e8b7d6c5b4a39281';
  const parseId = (chaine: string) => parseListState(new URLSearchParams(chaine), ID_SPEC);

  test('un identifiant valide se lit, et se réécrit à l’identique', () => {
    const etat = parseId(`senderId=${ID}&status=pending`);
    expect(etat.ids).toEqual({ senderId: ID });
    expect(serializeListState(etat, ID_SPEC).toString()).toBe(`status=pending&senderId=${ID}`);
  });

  test('un identifiant mal formé est IGNORÉ — chaîne vague, majuscules, trop court, injection', () => {
    for (const mauvais of ['abc', ID.toUpperCase(), ID.slice(1), `${ID}zz`, '{"$ne":null}', '../../x', ' ']) {
      expect(parseId(`senderId=${encodeURIComponent(mauvais)}`).ids).toEqual({});
    }
  });

  test('une clé d’identifiant inconnue de la spécification est ignorée', () => {
    expect(parseId(`userId=${ID}`).ids).toEqual({});
  });

  test('withIdFilter pose, remplace et retire — et repart de la première page', () => {
    const posé = withIdFilter(parseId('offset=40'), 'senderId', ID, ID_SPEC);
    expect(posé.ids).toEqual({ senderId: ID });
    expect(posé.offset).toBe(0);
    expect(withIdFilter(posé, 'senderId', null, ID_SPEC).ids).toEqual({});
  });

  test('withIdFilter refuse une valeur mal formée : c’est un retrait, pas une écriture', () => {
    const posé = parseId(`senderId=${ID}`);
    expect(withIdFilter(posé, 'senderId', 'pas-un-id', ID_SPEC).ids).toEqual({});
  });

  test('les autres états survivent à la pose d’un identifiant', () => {
    const etat = withIdFilter(parseId('status=accepted'), 'reportedEntityId', ID, ID_SPEC);
    expect(etat.filters).toEqual({ status: 'accepted' });
    expect(etat.ids).toEqual({ reportedEntityId: ID });
  });

  test('sans idFilters, rien ne change : les listes d’avant n’en savent rien', () => {
    expect(parse(`senderId=${ID}`).ids).toEqual({});
  });
});
