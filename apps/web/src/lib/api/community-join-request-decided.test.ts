import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { communityQueryKey, decodeCommunity, type CommunitySummary } from './communities';
import { applyCommunityJoinRequestDecidedEvent } from './community-join-request-live';

/**
 * LE REFUS D'UNE DEMANDE D'ENTRÉE SE LIT CHEZ LE DEMANDEUR (#19879) — le détail
 * sert la date à partir de laquelle il peut redemander, et
 * `community:join-request-decided` (sa room seule) fait passer l'écran ouvert de
 * « Demande envoyée » à « Demande refusée » sans relecture.
 */

const club = (overrides: Partial<CommunitySummary> = {}): CommunitySummary => ({
  id: 'c1',
  identifier: 'club',
  name: 'Club',
  description: null,
  avatar: null,
  banner: null,
  isPrivate: false,
  createdBy: 'u-owner',
  memberCount: 12,
  conversationCount: 2,
  viewerRole: null,
  requiresJoinApproval: true,
  viewerJoinRequest: 'pending',
  ...overrides,
});

const RETRY = '2026-11-26T10:00:00.000Z';
const decided = (overrides: Record<string, unknown> = {}) => ({ communityId: 'c1', decision: 'rejected', retryAt: RETRY, at: '2026-11-19T10:00:00.000Z', ...overrides });

describe('le détail décode la date de la prochaine demande', () => {
  test('servie, elle se garde ; absente (serveur ancien), la clé n’existe pas', () => {
    const wire = { id: 'c1', name: 'Club', requiresJoinApproval: true, currentUserJoinRequest: null };
    expect(decodeCommunity({ ...wire, currentUserJoinRetryAt: RETRY })?.viewerJoinRetryAt).toBe(RETRY);
    expect(decodeCommunity({ ...wire, currentUserJoinRetryAt: null })?.viewerJoinRetryAt).toBeNull();
    expect('viewerJoinRetryAt' in (decodeCommunity(wire) ?? {})).toBe(false);
  });

  test('une date illisible se lit comme aucune date', () => {
    expect(decodeCommunity({ id: 'c1', name: 'Club', currentUserJoinRetryAt: 'demain' })?.viewerJoinRetryAt).toBeNull();
  });
});

describe('community:join-request-decided, en direct', () => {
  const setup = (cached: CommunitySummary | undefined = club()) => {
    const queryClient = new QueryClient();
    if (cached !== undefined) queryClient.setQueryData(communityQueryKey(cached.id), cached);
    return queryClient;
  };

  test('le refus efface la demande en attente et pose la date de la prochaine', () => {
    const queryClient = setup();
    applyCommunityJoinRequestDecidedEvent(queryClient, decided());
    const after = queryClient.getQueryData<CommunitySummary>(communityQueryKey('c1'));
    expect([after?.viewerJoinRequest, after?.viewerJoinRetryAt, after?.memberCount, after?.viewerRole]).toEqual([null, RETRY, 12, null]);
  });

  test('ne touche jamais une autre communauté, ni ne pose un détail absent du cache', () => {
    const queryClient = setup();
    applyCommunityJoinRequestDecidedEvent(queryClient, decided({ communityId: 'c2' }));
    expect(queryClient.getQueryData<CommunitySummary>(communityQueryKey('c1'))?.viewerJoinRequest).toBe('pending');
    expect(queryClient.getQueryData(communityQueryKey('c2'))).toBeUndefined();
  });

  test('une décision inconnue, une date illisible ou une charge vide ne changent rien', () => {
    const queryClient = setup();
    applyCommunityJoinRequestDecidedEvent(queryClient, decided({ decision: 'accepted' }));
    applyCommunityJoinRequestDecidedEvent(queryClient, decided({ retryAt: 'bientôt' }));
    applyCommunityJoinRequestDecidedEvent(queryClient, null);
    expect(queryClient.getQueryData<CommunitySummary>(communityQueryKey('c1'))?.viewerJoinRequest).toBe('pending');
  });

  test('un lecteur devenu membre entre-temps garde son rôle', () => {
    const queryClient = setup(club({ viewerRole: 'member', viewerJoinRequest: null }));
    applyCommunityJoinRequestDecidedEvent(queryClient, decided());
    const after = queryClient.getQueryData<CommunitySummary>(communityQueryKey('c1'));
    expect(after?.viewerRole).toBe('member');
  });
});
