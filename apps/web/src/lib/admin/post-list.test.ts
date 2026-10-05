import { describe, expect, test } from 'bun:test';

import { parseListState, serializeListState, withIdFilter } from './list-state';
import { periodOf, POST_LIST_SPEC, POST_PERIODS, POST_TABS, POST_TYPES, POST_VISIBILITIES, postTabOf, postTypeOfTab } from './post-list';

/**
 * LA LISTE DES PUBLICATIONS (#8876) — ce que `GET /admin/posts` admet : cinq
 * filtres à valeurs fermées, un filtre par auteur, une recherche — et AUCUN tri
 * (la passerelle range toujours de la plus récente à la plus ancienne).
 */
const address = (query: string) => new URLSearchParams(query);

describe('POST_LIST_SPEC — l’adresse porte les filtres que la passerelle comprend', () => {
  test('les valeurs fermées sont celles du schéma de la route', () => {
    expect([...POST_TYPES]).toEqual(['POST', 'STORY', 'REEL', 'STATUS']);
    expect([...POST_VISIBILITIES]).toEqual(['PUBLIC', 'FRIENDS', 'COMMUNITY', 'PRIVATE', 'EXCEPT', 'ONLY']);
    expect([...POST_PERIODS]).toEqual(['today', 'week', 'month']);
  });

  test('une adresse vide rend l’état par défaut : rien de filtré, première page', () => {
    const state = parseListState(address(''), POST_LIST_SPEC);
    expect(state).toMatchObject({ filters: {}, ids: {}, q: '', offset: 0, limit: 20 });
  });

  test('type, visibilité, retrait, épinglage et période se lisent dans l’adresse', () => {
    const state = parseListState(address('type=STORY&visibility=PRIVATE&isDeleted=true&isPinned=false&period=week'), POST_LIST_SPEC);
    expect(state.filters).toEqual({ type: 'STORY', visibility: 'PRIVATE', isDeleted: 'true', isPinned: 'false', period: 'week' });
  });

  test('une valeur inconnue est ignorée : la liste ne fait pas de requête qu’elle ne saurait pas nommer', () => {
    const state = parseListState(address('type=VIDEO&visibility=SECRET&period=year'), POST_LIST_SPEC);
    expect(state.filters).toEqual({});
  });

  test('l’auteur se filtre par identifiant, et seulement s’il a la forme d’un ObjectId', () => {
    expect(parseListState(address('authorId=64f1c2a9e8b7d6c5b4a39281'), POST_LIST_SPEC).ids).toEqual({ authorId: '64f1c2a9e8b7d6c5b4a39281' });
    expect(parseListState(address('authorId=awa'), POST_LIST_SPEC).ids).toEqual({});
  });

  test('l’état se réécrit dans l’adresse à l’identique (aller-retour)', () => {
    const state = withIdFilter(parseListState(address('type=REEL&q=fête&offset=40'), POST_LIST_SPEC), 'authorId', '64f1c2a9e8b7d6c5b4a39281', POST_LIST_SPEC);
    expect(serializeListState(state, POST_LIST_SPEC).toString()).toBe('type=REEL&authorId=64f1c2a9e8b7d6c5b4a39281&q=f%C3%AAte');
  });

  test('aucun tri n’est offert : le seul tri déclaré est le défaut, jamais écrit dans l’adresse', () => {
    expect([...POST_LIST_SPEC.sortKeys]).toEqual(['createdAt']);
    expect(serializeListState(parseListState(address('sort=createdAt&order=asc'), POST_LIST_SPEC), POST_LIST_SPEC).toString()).toBe('order=asc');
  });
});

describe('periodOf — la période lue dans l’adresse', () => {
  test('une période connue est rendue, sinon « depuis le début »', () => {
    expect(periodOf('week')).toBe('week');
    expect(periodOf('today')).toBe('today');
    expect(periodOf(undefined)).toBe('all');
    expect(periodOf('year')).toBe('all');
  });
});

describe('les onglets de type — Toutes, Publications, Stories, Reels, Statuts', () => {
  test('l’ordre des onglets est celui de l’interface, « Toutes » d’abord', () => {
    expect([...POST_TABS]).toEqual(['all', 'POST', 'STORY', 'REEL', 'STATUS']);
  });

  test('l’onglet actif se lit du filtre de type ; sans filtre, c’est « Toutes »', () => {
    expect(postTabOf({})).toBe('all');
    expect(postTabOf({ type: 'STORY' })).toBe('STORY');
  });

  test('« Toutes » retire le filtre de type, les autres le posent', () => {
    expect(postTypeOfTab('all')).toBeNull();
    expect(postTypeOfTab('REEL')).toBe('REEL');
  });
});
