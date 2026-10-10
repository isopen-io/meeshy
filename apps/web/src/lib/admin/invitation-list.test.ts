import { describe, expect, test } from 'bun:test';

import { INVITATION_LIST_SPEC, invitationListQuery } from './invitation-list';
import { parseListState, serializeListState, withFilter, withIdFilter } from './list-state';

/**
 * **LA LISTE DES DEMANDES DE CONTACT** (#8876, #6729) — ce que l'adresse peut
 * porter : un statut, un expéditeur, une page. Rien d'autre : pas de recherche, pas
 * de tri, et jamais `communityId` (la colonne n'existe pas sur une demande d'ami).
 */

const OBJECT_ID = (seed: number): string => seed.toString(16).padStart(24, '0');
const parse = (chaine: string) => parseListState(new URLSearchParams(chaine), INVITATION_LIST_SPEC);

describe('l’état de la liste vit dans l’adresse', () => {
  test('une adresse nue : plus récentes d’abord, première page, aucun filtre', () => {
    expect(parse('')).toEqual({ sort: 'createdAt', order: 'desc', filters: {}, ids: {}, q: '', offset: 0, limit: 20 });
  });

  test('le statut et l’expéditeur se relisent ; une valeur hors liste blanche est ignorée', () => {
    expect(parse(`status=pending&senderId=${OBJECT_ID(2)}`)).toMatchObject({ filters: { status: 'pending' }, ids: { senderId: OBJECT_ID(2) } });
    expect(parse('status=blocked&senderId=not-an-id').filters).toEqual({});
    expect(parse('status=blocked&senderId=not-an-id').ids).toEqual({});
  });

  test('communityId n’est jamais lu : la colonne n’existe pas côté serveur', () => {
    const state = parse(`communityId=${OBJECT_ID(9)}`);

    expect(state.ids).toEqual({});
    expect(invitationListQuery(state).has('communityId')).toBe(false);
  });

  test('l’état se réécrit dans l’adresse, et seulement ce qui diffère du défaut', () => {
    const filtered = withIdFilter(withFilter(parse(''), 'status', 'accepted', INVITATION_LIST_SPEC), 'senderId', OBJECT_ID(2), INVITATION_LIST_SPEC);

    expect(serializeListState(filtered, INVITATION_LIST_SPEC).toString()).toBe(`status=accepted&senderId=${OBJECT_ID(2)}`);
  });
});

describe('la requête envoyée à la passerelle', () => {
  test('la page seule, sans filtre : offset et limit', () => {
    expect(invitationListQuery(parse('offset=40&limit=50')).toString()).toBe('offset=40&limit=50');
  });

  test('le statut et l’expéditeur sont transmis tels que posés', () => {
    expect(invitationListQuery(parse(`status=rejected&senderId=${OBJECT_ID(2)}`)).toString()).toBe(`offset=0&limit=20&status=rejected&senderId=${OBJECT_ID(2)}`);
  });

  test('ni recherche ni tri ne partent : la route n’en sert pas', () => {
    const query = invitationListQuery(parse('q=awa&sort=createdAt&order=asc'));

    expect(query.has('search')).toBe(false);
    expect(query.has('sortBy')).toBe(false);
    expect(query.has('q')).toBe(false);
  });
});
