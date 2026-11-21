import { describe, expect, test } from 'bun:test';
import { QueryClient, type InfiniteData } from '@tanstack/react-query';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';
import type {
  CommunityMemberJoinedEventData,
  CommunityMemberLeftEventData,
  CommunityMemberRoleUpdatedEventData,
} from '@meeshy/shared/types/socketio-events';

import type { SocketClient } from '../net/socket';
import { communitiesQueryKey, communityQueryKey, type CommunityPage, type CommunitySummary } from './communities';
import { communityJoinRequestsQueryKey } from './community-join-requests';
import { communityMembersQueryKey } from './community-members';
import { applyCommunityMemberEvent } from './community-member-live';
import { bindCommunityLive } from './community-live';

/**
 * **L'EFFECTIF D'UNE COMMUNAUTÉ SUIT SES GESTES** (#18766) —
 * `community:member-joined`, `community:member-left`,
 * `community:member-role-updated`. Les charges sont celles que la passerelle
 * émet, clé par clé (`community-member-broadcast.ts`) ; chaque témoin assert
 * sur ce que le cache REND.
 */

const CLUB = '6650c0000000000000000001';
const OTHER = '6650c0000000000000000002';
const ME = 'u-me';
const AT = '2026-11-15T23:50:00.000Z';

const summary = (id: string, overrides: Partial<CommunitySummary> = {}): CommunitySummary => ({
  id, identifier: `mshy_${id}`, name: 'Club', description: null, avatar: null, banner: null, isPrivate: false,
  createdBy: 'u-creator', memberCount: 3, conversationCount: 2, viewerRole: 'member', onlineMemberCount: 4, ...overrides,
});
const listOf = (...communities: CommunitySummary[]): InfiniteData<CommunityPage, number> => ({ pages: [{ communities, nextOffset: null }], pageParams: [0] });

const joined = (overrides: Partial<CommunityMemberJoinedEventData> = {}): CommunityMemberJoinedEventData => ({
  communityId: CLUB, userId: 'u-bob', role: 'member', via: 'self', memberCount: 4, at: AT, ...overrides,
});
const left = (overrides: Partial<CommunityMemberLeftEventData> = {}): CommunityMemberLeftEventData => ({
  communityId: CLUB, userId: 'u-bob', reason: 'left', memberCount: 2, at: AT, ...overrides,
});
const roleUpdated = (overrides: Partial<CommunityMemberRoleUpdatedEventData> = {}): CommunityMemberRoleUpdatedEventData => ({
  communityId: CLUB, userId: 'u-bob', role: 'moderator', memberCount: 3, at: AT, ...overrides,
});

const seeded = () => {
  const client = new QueryClient();
  client.setQueryData(communityQueryKey(CLUB), summary(CLUB));
  client.setQueryData(communitiesQueryKey(''), listOf(summary(OTHER), summary(CLUB)));
  client.setQueryData(communityMembersQueryKey(CLUB), { pages: [], pageParams: [] });
  return client;
};
const detail = (client: QueryClient, id = CLUB) => client.getQueryData<CommunitySummary>(communityQueryKey(id));
const row = (client: QueryClient, id: string) =>
  client.getQueryData<InfiniteData<CommunityPage, number>>(communitiesQueryKey(''))?.pages[0]?.communities.find((c) => c.id === id);
const stale = (client: QueryClient, key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated === true;

describe('applyCommunityMemberEvent', () => {
  test("l'entrée d'un autre membre met à jour l'effectif du détail et de la liste, garde le rôle du lecteur et relit la liste des membres", () => {
    const client = seeded();
    applyCommunityMemberEvent(client, SERVER_EVENTS.COMMUNITY_MEMBER_JOINED, joined(), ME);

    expect(detail(client)).toEqual(summary(CLUB, { memberCount: 4 }));
    expect(row(client, CLUB)?.memberCount).toBe(4);
    expect(row(client, OTHER)).toEqual(summary(OTHER));
    expect(stale(client, communityMembersQueryKey(CLUB))).toBe(true);
  });

  test("une entrée — acceptée par un AUTRE intendant — relit les demandes en attente ; un départ ne les relit pas (#19871)", () => {
    const client = seeded();
    client.setQueryData(communityJoinRequestsQueryKey(CLUB), { pages: [], pageParams: [null] });
    applyCommunityMemberEvent(client, SERVER_EVENTS.COMMUNITY_MEMBER_LEFT, left(), ME);
    expect(stale(client, communityJoinRequestsQueryKey(CLUB))).toBe(false);
    applyCommunityMemberEvent(client, SERVER_EVENTS.COMMUNITY_MEMBER_JOINED, joined(), ME);
    expect(stale(client, communityJoinRequestsQueryKey(CLUB))).toBe(true);
  });

  test("le départ ou le retrait d'un autre membre baisse l'effectif", () => {
    const client = seeded();
    applyCommunityMemberEvent(client, SERVER_EVENTS.COMMUNITY_MEMBER_LEFT, left({ reason: 'removed' }), ME);

    expect(detail(client)?.memberCount).toBe(2);
    expect(detail(client)?.viewerRole).toBe('member');
  });

  test("un rôle qui change chez le lecteur devient SON rôle (le menu de gestion suit), chez un autre il ne touche pas le sien", () => {
    const mine = seeded();
    applyCommunityMemberEvent(mine, SERVER_EVENTS.COMMUNITY_MEMBER_ROLE_UPDATED, roleUpdated({ userId: ME, role: 'admin' }), ME);
    expect(detail(mine)?.viewerRole).toBe('admin');
    expect(row(mine, CLUB)?.viewerRole).toBe('admin');

    const theirs = seeded();
    applyCommunityMemberEvent(theirs, SERVER_EVENTS.COMMUNITY_MEMBER_ROLE_UPDATED, roleUpdated(), ME);
    expect(detail(theirs)?.viewerRole).toBe('member');
  });

  test("être ajouté depuis un autre appareil ou par un tiers donne au lecteur son rôle", () => {
    const client = new QueryClient();
    client.setQueryData(communityQueryKey(CLUB), summary(CLUB, { viewerRole: null }));
    applyCommunityMemberEvent(client, SERVER_EVENTS.COMMUNITY_MEMBER_JOINED, joined({ userId: ME, via: 'invited' }), ME);

    expect(detail(client)?.viewerRole).toBe('member');
  });

  test("sa demande ACCEPTÉE fait du lecteur un membre, et la demande s'efface — un départ ultérieur ne la ressuscite pas (#19868)", () => {
    const client = new QueryClient();
    client.setQueryData(communityQueryKey(CLUB), summary(CLUB, { viewerRole: null, requiresJoinApproval: true, viewerJoinRequest: 'pending' }));
    applyCommunityMemberEvent(client, SERVER_EVENTS.COMMUNITY_MEMBER_JOINED, joined({ userId: ME }), ME);
    expect([detail(client)?.viewerRole, detail(client)?.viewerJoinRequest]).toEqual(['member', null]);

    applyCommunityMemberEvent(client, SERVER_EVENTS.COMMUNITY_MEMBER_LEFT, left({ userId: ME }), ME);
    expect([detail(client)?.viewerRole, detail(client)?.viewerJoinRequest]).toEqual([null, null]);
  });

  test("le lecteur retiré n'a plus de rôle, et ce qu'il voyait de la communauté se relit (une privée cesse d'être servie)", () => {
    const client = seeded();
    applyCommunityMemberEvent(client, SERVER_EVENTS.COMMUNITY_MEMBER_LEFT, left({ userId: ME, reason: 'removed' }), ME);

    expect(detail(client)?.viewerRole).toBeNull();
    expect(stale(client, communityQueryKey(CLUB))).toBe(true);
    expect(stale(client, communitiesQueryKey(''))).toBe(true);
  });

  test("une charge illisible, un nom inconnu ou une autre communauté absente du cache ne touchent rien", () => {
    const client = seeded();
    applyCommunityMemberEvent(client, SERVER_EVENTS.COMMUNITY_MEMBER_JOINED, { communityId: CLUB, userId: 'u-bob' }, ME);
    applyCommunityMemberEvent(client, SERVER_EVENTS.COMMUNITY_MEMBER_JOINED, joined({ memberCount: -1 }), ME);
    applyCommunityMemberEvent(client, SERVER_EVENTS.COMMUNITY_MEMBER_ROLE_UPDATED, { ...roleUpdated(), role: 'owner' }, ME);
    applyCommunityMemberEvent(client, SERVER_EVENTS.COMMUNITY_MEMBER_JOINED, joined({ communityId: '6650c0000000000000000099' }), ME);

    expect(detail(client)).toEqual(summary(CLUB));
    expect(client.getQueryData(communityQueryKey('6650c0000000000000000099'))).toBeUndefined();
  });
});

describe('bindCommunityLive — effectif', () => {
  test("écoute les trois événements d'effectif sous le lecteur courant, et s'en débranche", () => {
    const handlers = new Map<string, (payload: unknown) => void>();
    const socket: SocketClient = {
      connected: true,
      connect: () => undefined,
      disconnect: () => undefined,
      on: (name, handler) => { handlers.set(name, handler as (payload: unknown) => void); },
      off: (name) => { handlers.delete(name); },
      emit: () => undefined,
    };
    const client = seeded();

    const stop = bindCommunityLive({ socket, queryClient: client, viewerId: () => ME });
    handlers.get(SERVER_EVENTS.COMMUNITY_MEMBER_JOINED)?.(joined());
    handlers.get(SERVER_EVENTS.COMMUNITY_MEMBER_ROLE_UPDATED)?.(roleUpdated({ userId: ME, role: 'moderator', memberCount: 4 }));
    expect(detail(client)).toEqual(summary(CLUB, { memberCount: 4, viewerRole: 'moderator' }));
    handlers.get(SERVER_EVENTS.COMMUNITY_MEMBER_LEFT)?.(left({ memberCount: 3 }));
    expect(detail(client)?.memberCount).toBe(3);

    stop();
    expect([SERVER_EVENTS.COMMUNITY_MEMBER_JOINED, SERVER_EVENTS.COMMUNITY_MEMBER_LEFT, SERVER_EVENTS.COMMUNITY_MEMBER_ROLE_UPDATED].some((name) => handlers.has(name))).toBe(false);
  });
});
