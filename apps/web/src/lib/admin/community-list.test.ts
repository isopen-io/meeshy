import { describe, expect, test } from 'bun:test';

import { COMMUNITY_LIST_SPEC, COMMUNITY_MEMBERS_SPEC, COMMUNITY_ROLES } from './community-list';
import { parseListState, serializeListState } from './list-state';

/**
 * LES LISTES DE COMMUNAUTÉS (#8876) — la liste (`GET /admin/communities` : tri
 * `createdAt` | `name`, deux filtres, une recherche) et les membres d'une fiche
 * (`GET /admin/communities/:id/members` : recherche, rôle, actif — et aucun tri).
 */
const address = (query: string) => new URLSearchParams(query);

describe('COMMUNITY_LIST_SPEC', () => {
  test('les deux tris de la passerelle, les plus récentes d’abord ; le nom part de A à Z', () => {
    expect([...COMMUNITY_LIST_SPEC.sortKeys]).toEqual(['createdAt', 'name']);
    expect(parseListState(address(''), COMMUNITY_LIST_SPEC)).toMatchObject({ sort: 'createdAt', order: 'desc' });
    expect(parseListState(address('sort=name'), COMMUNITY_LIST_SPEC)).toMatchObject({ sort: 'name', order: 'asc' });
  });

  test('un tri que la passerelle n’admet pas est ignoré', () => {
    expect(parseListState(address('sort=memberCount'), COMMUNITY_LIST_SPEC).sort).toBe('createdAt');
  });

  test('visibilité et état se filtrent par vrai ou faux, rien d’autre', () => {
    expect(parseListState(address('isPrivate=true&isActive=false'), COMMUNITY_LIST_SPEC).filters).toEqual({ isPrivate: 'true', isActive: 'false' });
    expect(parseListState(address('isPrivate=oui&isActive=1'), COMMUNITY_LIST_SPEC).filters).toEqual({});
  });

  test('l’état se réécrit dans l’adresse à l’identique', () => {
    const state = parseListState(address('sort=name&order=desc&isActive=true&q=jazz&limit=50'), COMMUNITY_LIST_SPEC);
    expect(serializeListState(state, COMMUNITY_LIST_SPEC).toString()).toBe('sort=name&order=desc&isActive=true&q=jazz&limit=50');
  });
});

describe('COMMUNITY_MEMBERS_SPEC', () => {
  test('les trois rôles d’une communauté, et le filtre d’activité', () => {
    expect([...COMMUNITY_ROLES]).toEqual(['admin', 'moderator', 'member']);
    expect(parseListState(address('role=moderator&isActive=true&q=awa'), COMMUNITY_MEMBERS_SPEC)).toMatchObject({
      filters: { role: 'moderator', isActive: 'true' },
      q: 'awa',
    });
  });

  test('un rôle inconnu est ignoré, et aucun tri n’est offert', () => {
    expect(parseListState(address('role=owner'), COMMUNITY_MEMBERS_SPEC).filters).toEqual({});
    expect([...COMMUNITY_MEMBERS_SPEC.sortKeys]).toEqual(['joinedAt']);
  });
});
