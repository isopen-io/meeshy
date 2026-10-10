import { describe, expect, test } from 'bun:test';

import { parseListState, serializeListState, withFilter } from './list-state';
import { SHARE_LINK_LIST_SPEC, shareLinkListQuery } from './share-link-list';

/**
 * **LA LISTE DES LIENS DE PARTAGE** (#8876, #6729) — ce que l'adresse peut
 * porter : l'ouverture, la recherche par nom, la page. Pas de tri : la route n'en
 * sert pas.
 */

const parse = (chaine: string) => parseListState(new URLSearchParams(chaine), SHARE_LINK_LIST_SPEC);

describe('l’état de la liste vit dans l’adresse', () => {
  test('une adresse nue : plus récents d’abord, première page, aucun filtre', () => {
    expect(parse('')).toEqual({ sort: 'createdAt', order: 'desc', filters: {}, ids: {}, q: '', offset: 0, limit: 20 });
  });

  test('l’ouverture et la recherche se relisent ; une valeur hors liste blanche est ignorée', () => {
    expect(parse('isActive=false&q=voisins')).toMatchObject({ filters: { isActive: 'false' }, q: 'voisins' });
    expect(parse('isActive=maybe').filters).toEqual({});
    expect(parse('sort=linkId&order=asc').sort).toBe('createdAt');
  });

  test('l’état se réécrit dans l’adresse, et seulement ce qui diffère du défaut', () => {
    const filtered = withFilter(parse('q=soir'), 'isActive', 'true', SHARE_LINK_LIST_SPEC);

    expect(serializeListState(filtered, SHARE_LINK_LIST_SPEC).toString()).toBe('isActive=true&q=soir');
  });
});

describe('la requête envoyée à la passerelle', () => {
  test('la page seule, sans filtre', () => {
    expect(shareLinkListQuery(parse('offset=40&limit=50')).toString()).toBe('offset=40&limit=50');
  });

  test('la recherche part en `search` (le nom seul), l’ouverture en `isActive`', () => {
    expect(shareLinkListQuery(parse('q=voisins&isActive=true')).toString()).toBe('offset=0&limit=20&search=voisins&isActive=true');
  });

  test('aucun paramètre de tri ne part : la route n’en lit pas', () => {
    const query = shareLinkListQuery(parse('sort=createdAt&order=asc'));

    expect(query.has('sort')).toBe(false);
    expect(query.has('sortBy')).toBe(false);
    expect(query.has('order')).toBe(false);
  });
});
