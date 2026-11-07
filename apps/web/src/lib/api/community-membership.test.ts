import { describe, expect, test } from 'bun:test';
import { QueryClient, type InfiniteData } from '@tanstack/react-query';

import { communitiesQueryKey, communityConversationsQueryKey, communityQueryKey, decodeCommunity, type CommunityPage, type CommunitySummary } from './communities';
import { performJoinCommunity, performLeaveCommunity, type CommunityActionDeps } from './community-actions';
import { createHttpTransport } from './http';

/**
 * REJOINDRE ET QUITTER UNE COMMUNAUTÉ (#6378) — miroir
 * `CommunityDetailViewModel.joinCommunity` / `leaveCommunity` d'iOS, mais
 * OPTIMISTE : le détail bascule au geste, et une réponse qui refuse rend
 * EXACTEMENT ce qui était en cache. Quitter retire la carte de toutes les
 * listes en cache ; rejoindre la met en tête de « mes communautés ».
 */

const club = (overrides: Partial<CommunitySummary> = {}): CommunitySummary => ({
  id: 'm-club',
  identifier: 'mshy_club',
  name: 'Club',
  description: null,
  avatar: null,
  banner: null,
  isPrivate: false,
  createdBy: 'u-owner',
  memberCount: 10,
  conversationCount: 1,
  ...overrides,
});

type Reply = { readonly status: number; readonly body: unknown };

const depsReplying = (reply: Reply, online = true) => {
  const calls: { url: string; method: string }[] = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(input), method: init?.method ?? 'GET' });
    await gate;
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'content-type': 'application/json' } });
  };
  const queryClient = new QueryClient();
  const deps: CommunityActionDeps = {
    source: 'gateway',
    transport: createHttpTransport({ base: 'https://gate.test', fetchImpl: fetchImpl as typeof fetch, timeoutMs: 0 }),
    queryClient,
    isOnline: () => online,
  };
  return { calls, deps, queryClient, release: () => release() };
};

const seedList = (queryClient: QueryClient, key: readonly unknown[], communities: readonly CommunitySummary[]) =>
  queryClient.setQueryData<InfiniteData<CommunityPage, number>>(key, { pages: [{ communities, nextOffset: null }], pageParams: [0] });

const listIds = (queryClient: QueryClient, key: readonly unknown[]) =>
  queryClient.getQueryData<InfiniteData<CommunityPage, number>>(key)?.pages.flatMap((page) => page.communities.map((row) => row.id));

describe('le rôle du lecteur se décode', () => {
  test('servi : son rôle ; servi nul : pas membre ; absent : inconnu', () => {
    const wire = { id: 'm-club', name: 'Club' };
    expect(decodeCommunity({ ...wire, currentUserRole: 'moderator' })?.viewerRole).toBe('moderator');
    expect(decodeCommunity({ ...wire, currentUserRole: null })?.viewerRole).toBeNull();
    expect('viewerRole' in (decodeCommunity(wire) ?? {})).toBe(false);
  });

  test('un rôle que le web ne connaît pas reste un membre', () => {
    expect(decodeCommunity({ id: 'm-club', name: 'Club', currentUserRole: 'creator' })?.viewerRole).toBe('member');
  });
});

describe('performJoinCommunity', () => {
  test('le détail bascule AU GESTE, avant la réponse', async () => {
    const { deps, queryClient, release } = depsReplying({ status: 200, body: { success: true, data: {} } });
    queryClient.setQueryData(communityQueryKey('mshy_club'), club({ viewerRole: null }));
    const pending = performJoinCommunity({ community: club({ viewerRole: null }), deps });
    const optimistic = queryClient.getQueryData<CommunitySummary>(communityQueryKey('mshy_club'));
    expect([optimistic?.viewerRole, optimistic?.memberCount]).toEqual(['member', 11]);
    release();
    expect(await pending).toEqual({ status: 'joined' });
  });

  test('rejointe : POST /join sur l’id, et la carte entre en tête de « mes communautés »', async () => {
    const { deps, queryClient, calls, release } = depsReplying({ status: 200, body: { success: true, data: {} } });
    seedList(queryClient, communitiesQueryKey(''), [club({ id: 'm-autre' })]);
    release();
    await performJoinCommunity({ community: club({ viewerRole: null }), deps });
    expect(calls).toEqual([{ url: 'https://gate.test/api/v1/communities/m-club/join', method: 'POST' }]);
    expect(listIds(queryClient, communitiesQueryKey(''))).toEqual(['m-club', 'm-autre']);
  });

  test('déjà membre (409) : c’est un succès, le détail reste membre', async () => {
    const { deps, queryClient, release } = depsReplying({ status: 409, body: { success: false, error: 'already' } });
    queryClient.setQueryData(communityQueryKey('m-club'), club({ viewerRole: null }));
    release();
    expect(await performJoinCommunity({ community: club({ viewerRole: null }), deps })).toEqual({ status: 'joined' });
    expect(queryClient.getQueryData<CommunitySummary>(communityQueryKey('m-club'))?.viewerRole).toBe('member');
  });

  test('un refus rend EXACTEMENT le cache d’avant', async () => {
    const { deps, queryClient, release } = depsReplying({ status: 403, body: { success: false, error: 'private' } });
    const before = club({ viewerRole: null });
    queryClient.setQueryData(communityQueryKey('m-club'), before);
    seedList(queryClient, communitiesQueryKey(''), [club({ id: 'm-autre' })]);
    release();
    expect(await performJoinCommunity({ community: before, deps })).toEqual({ status: 'refused' });
    expect(queryClient.getQueryData(communityQueryKey('m-club'))).toEqual(before);
    expect(listIds(queryClient, communitiesQueryKey(''))).toEqual(['m-autre']);
  });

  test('hors ligne, rien ne part et rien ne bouge', async () => {
    const { deps, queryClient, calls } = depsReplying({ status: 200, body: {} }, false);
    queryClient.setQueryData(communityQueryKey('m-club'), club({ viewerRole: null }));
    expect(await performJoinCommunity({ community: club({ viewerRole: null }), deps })).toEqual({ status: 'offline' });
    expect(calls).toHaveLength(0);
    expect(queryClient.getQueryData<CommunitySummary>(communityQueryKey('m-club'))?.viewerRole).toBeNull();
  });
});

describe('performLeaveCommunity', () => {
  test('la carte quitte TOUTES les listes en cache au geste, et le détail n’est plus membre', async () => {
    const { deps, queryClient, release } = depsReplying({ status: 200, body: { success: true, data: { message: 'ok' } } });
    const member = club({ viewerRole: 'member' });
    queryClient.setQueryData(communityQueryKey('m-club'), member);
    seedList(queryClient, communitiesQueryKey(''), [member, club({ id: 'm-autre' })]);
    seedList(queryClient, communitiesQueryKey('clu'), [member]);
    const pending = performLeaveCommunity({ community: member, deps });
    expect(listIds(queryClient, communitiesQueryKey(''))).toEqual(['m-autre']);
    expect(listIds(queryClient, communitiesQueryKey('clu'))).toEqual([]);
    const detail = queryClient.getQueryData<CommunitySummary>(communityQueryKey('m-club'));
    expect([detail?.viewerRole, detail?.memberCount]).toEqual([null, 9]);
    release();
    expect(await pending).toEqual({ status: 'left' });
  });

  test('quittée : ses conversations ne restent pas en cache', async () => {
    const { deps, queryClient, calls, release } = depsReplying({ status: 200, body: { success: true, data: {} } });
    queryClient.setQueryData(communityConversationsQueryKey('m-club'), { pages: [], pageParams: [] });
    release();
    await performLeaveCommunity({ community: club({ viewerRole: 'member' }), deps });
    expect(calls).toEqual([{ url: 'https://gate.test/api/v1/communities/m-club/leave', method: 'POST' }]);
    expect(queryClient.getQueryData(communityConversationsQueryKey('m-club'))).toBeUndefined();
  });

  test('déjà parti (404) : c’est un succès', async () => {
    const { deps, release } = depsReplying({ status: 404, body: { success: false, error: 'not a member' } });
    release();
    expect(await performLeaveCommunity({ community: club({ viewerRole: 'member' }), deps })).toEqual({ status: 'left' });
  });

  test('une panne rend la carte à chaque liste et le rôle au détail', async () => {
    const { deps, queryClient, release } = depsReplying({ status: 500, body: { success: false, error: 'boom' } });
    const member = club({ viewerRole: 'moderator' });
    queryClient.setQueryData(communityQueryKey('m-club'), member);
    seedList(queryClient, communitiesQueryKey(''), [member, club({ id: 'm-autre' })]);
    release();
    expect(await performLeaveCommunity({ community: member, deps })).toEqual({ status: 'error' });
    expect(queryClient.getQueryData(communityQueryKey('m-club'))).toEqual(member);
    expect(listIds(queryClient, communitiesQueryKey(''))).toEqual(['m-club', 'm-autre']);
  });

  test('hors ligne, rien ne part', async () => {
    const { deps, calls } = depsReplying({ status: 200, body: {} }, false);
    expect(await performLeaveCommunity({ community: club({ viewerRole: 'member' }), deps })).toEqual({ status: 'offline' });
    expect(calls).toHaveLength(0);
  });
});
