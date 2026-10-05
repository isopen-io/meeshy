import { describe, expect, test } from 'bun:test';

import { CONVERSATION_LIST_SPEC, conversationListQuery, type ConversationListState } from './conversation-list';
import { parseListState } from './list-state';

/**
 * **LA LISTE DES CONVERSATIONS** (#8876) — ce que l'adresse peut porter et ce qui
 * part à la passerelle : liste blanche du tri et des filtres, période calculée
 * sur l'horloge injectée, identifiant de communauté accepté seulement s'il a la
 * forme d'un ObjectId, et jamais un filtre vide.
 */
const NOW = new Date('2026-09-30T12:00:00.000Z');
const COMMUNITY = 'a'.repeat(24);

const stateOf = (query: string): ConversationListState => parseListState(new URLSearchParams(query), CONVERSATION_LIST_SPEC);
const sent = (query: string): Record<string, string> => Object.fromEntries(conversationListQuery(stateOf(query), NOW));

describe('l’état lu dans l’adresse passe par la liste blanche', () => {
  test('sans rien, le dernier message d’abord, vingt par page', () => {
    expect(sent('')).toEqual({ offset: '0', limit: '20', sort: 'lastMessageAt', order: 'desc' });
  });

  test('un tri que la passerelle refuse (l’effectif) retombe sur le défaut', () => {
    expect(stateOf('sort=memberCount').sort).toBe('lastMessageAt');
    expect(stateOf('sort=createdAt&order=asc').order).toBe('asc');
  });

  test('un type ou une période inconnus sont ignorés, jamais transmis', () => {
    expect(sent('type=secret&period=10y')).toEqual({ offset: '0', limit: '20', sort: 'lastMessageAt', order: 'desc' });
  });
});

describe('la requête envoyée', () => {
  test('transmet recherche, type, activité et tri — et rien de vide', () => {
    expect(sent('q=Famille&type=group&isActive=false&sort=createdAt&order=asc&offset=40&limit=20')).toEqual({
      offset: '40',
      limit: '20',
      sort: 'createdAt',
      order: 'asc',
      search: 'Famille',
      type: 'group',
      isActive: 'false',
    });
  });

  test('la période devient `createdAfter`, sur l’horloge injectée', () => {
    const query = sent('period=7d');
    expect(query.createdAfter).toBe('2026-09-23T12:00:00.000Z');
    expect(query.period).toBeUndefined();
  });

  test('« toutes les conversations d’une communauté » passe `communityId`, si l’identifiant est un ObjectId', () => {
    expect(sent(`communityId=${COMMUNITY}`).communityId).toBe(COMMUNITY);
    expect(sent('communityId=pas-un-identifiant').communityId).toBeUndefined();
  });
});
