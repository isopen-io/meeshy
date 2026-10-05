import { describe, expect, test } from 'bun:test';

import { BROADCAST_LIST_SPEC, BROADCAST_STATUSES, broadcastListQuery } from './broadcast-list';
import { parseListState, serializeListState } from './list-state';

/**
 * **LA LISTE DES DIFFUSIONS** (#8876, #6731) — ce que la passerelle sait filtrer
 * (le statut, la recherche sur le nom et l'objet) et rien de plus : aucun tri,
 * la route range par création décroissante, et une colonne triable qui ne
 * changerait rien serait un contrôle sans effet.
 */
const read = (address: string) => parseListState(new URLSearchParams(address), BROADCAST_LIST_SPEC);

describe('la spécification de liste', () => {
  test('les six statuts servis, dans l’ordre de vie d’une diffusion', () => {
    expect(BROADCAST_STATUSES).toEqual(['DRAFT', 'TRANSLATING', 'READY', 'SENDING', 'SENT', 'FAILED']);
  });

  test('aucun tri n’est offert : une seule clé, celle que la passerelle applique', () => {
    expect(BROADCAST_LIST_SPEC.sortKeys).toEqual(['createdAt']);
  });

  test('le statut voyage dans l’adresse, avec une liste blanche', () => {
    expect(read('status=SENT').filters.status).toBe('SENT');
    expect(read('status=legendaire').filters.status).toBeUndefined();
    expect(serializeListState(read('status=FAILED&q=automne'), BROADCAST_LIST_SPEC).toString()).toBe('status=FAILED&q=automne');
  });
});

describe('la requête envoyée à la passerelle', () => {
  test('par défaut : la première page, sans filtre ni recherche', () => {
    expect(broadcastListQuery(read('')).toString()).toBe('offset=0&limit=20');
  });

  test('le statut et la recherche sont transmis ; la recherche est nettoyée', () => {
    const query = broadcastListQuery(read('status=DRAFT&q=%20automne%20'));

    expect(query.get('status')).toBe('DRAFT');
    expect(query.get('search')).toBe('automne');
  });

  test('la page demandée est transmise', () => {
    const query = broadcastListQuery(read('offset=40&limit=50'));

    expect(query.get('offset')).toBe('40');
    expect(query.get('limit')).toBe('50');
  });

  test('la recherche est bornée à 100 caractères, comme la passerelle l’exige', () => {
    const query = broadcastListQuery(read(`q=${'a'.repeat(150)}`));

    expect(query.get('search')).toBe('a'.repeat(100));
  });

  test('aucun paramètre de tri n’est envoyé', () => {
    const query = broadcastListQuery(read('sort=createdAt&order=asc'));

    expect(query.has('sortBy')).toBe(false);
    expect(query.has('sortOrder')).toBe(false);
  });
});
