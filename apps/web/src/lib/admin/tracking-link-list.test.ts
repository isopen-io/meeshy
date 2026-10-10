import { describe, expect, test } from 'bun:test';

import { parseListState, serializeListState, toggleSort, withFilter, withIdFilter } from './list-state';
import { TRACKING_LINK_LIST_SPEC, trackingLinkListQuery } from './tracking-link-list';

/**
 * **LA LISTE DES LIENS DE SUIVI** (#8876, #6729) — le tri, les filtres, la recherche
 * et la page que la passerelle sert, et rien d'autre : l'adresse ne porte que cette
 * liste blanche, la requête nomme le tri `sort` / `order` (et non `sortBy`).
 */

const OBJECT_ID = (seed: number): string => seed.toString(16).padStart(24, '0');
const parse = (chaine: string) => parseListState(new URLSearchParams(chaine), TRACKING_LINK_LIST_SPEC);

describe('l’état de la liste vit dans l’adresse', () => {
  test('une adresse nue : plus récents d’abord, première page, aucun filtre', () => {
    expect(parse('')).toEqual({ sort: 'createdAt', order: 'desc', filters: {}, ids: {}, q: '', offset: 0, limit: 20 });
  });

  test('les quatre clés de tri se relisent ; une clé hors liste blanche retombe sur le défaut', () => {
    for (const key of ['createdAt', 'totalClicks', 'uniqueClicks', 'lastClickedAt']) expect(parse(`sort=${key}`).sort).toBe(key);
    expect(parse('sort=token&order=asc').sort).toBe('createdAt');
  });

  test('l’état, le genre de cible, le créateur et la recherche se relisent', () => {
    expect(parse(`isActive=false&targetType=REEL&createdBy=${OBJECT_ID(2)}&q=rentree`)).toMatchObject({
      filters: { isActive: 'false', targetType: 'REEL' },
      ids: { createdBy: OBJECT_ID(2) },
      q: 'rentree',
    });
  });

  test('un genre de cible hors liste ou un créateur sans forme d’ObjectId est ignoré', () => {
    const state = parse('targetType=VIDEO&createdBy=../x&isActive=maybe');

    expect(state.filters).toEqual({});
    expect(state.ids).toEqual({});
  });

  test('trier par clics part du plus grand ; un second clic inverse', () => {
    const first = toggleSort(parse(''), 'totalClicks', TRACKING_LINK_LIST_SPEC);
    expect([first.sort, first.order]).toEqual(['totalClicks', 'desc']);
    expect(toggleSort(first, 'totalClicks', TRACKING_LINK_LIST_SPEC).order).toBe('asc');
  });

  test('l’état se réécrit dans l’adresse, et seulement ce qui diffère du défaut', () => {
    const state = withIdFilter(withFilter(parse('sort=totalClicks&q=a'), 'targetType', 'POST', TRACKING_LINK_LIST_SPEC), 'createdBy', OBJECT_ID(2), TRACKING_LINK_LIST_SPEC);

    expect(serializeListState(state, TRACKING_LINK_LIST_SPEC).toString()).toBe(`sort=totalClicks&order=desc&targetType=POST&createdBy=${OBJECT_ID(2)}&q=a`);
  });
});

describe('la requête envoyée à la passerelle', () => {
  test('tri explicite sous les noms `sort` et `order` — jamais `sortBy`', () => {
    const query = trackingLinkListQuery(parse(''));

    expect(query.toString()).toBe('offset=0&limit=20&sort=createdAt&order=desc');
    expect(query.has('sortBy')).toBe(false);
  });

  test('tout ce qui est posé part : recherche en `search`, état, genre, créateur', () => {
    const query = trackingLinkListQuery(parse(`sort=lastClickedAt&order=asc&q=rentree&isActive=true&targetType=CONVERSATION&createdBy=${OBJECT_ID(2)}&offset=40&limit=50`));

    expect(query.toString()).toBe(
      `offset=40&limit=50&sort=lastClickedAt&order=asc&search=rentree&isActive=true&targetType=CONVERSATION&createdBy=${OBJECT_ID(2)}`,
    );
  });
});
