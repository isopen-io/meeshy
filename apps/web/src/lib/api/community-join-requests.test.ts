import { describe, expect, test } from 'bun:test';
import { QueryClient, type InfiniteData } from '@tanstack/react-query';

import { communityQueryKey, type CommunitySummary } from './communities';
import {
  communityJoinRequestsQueryKey,
  decodeCommunityJoinRequest,
  isCommunityStewardOf,
  loadCommunityJoinRequests,
  type CommunityJoinRequest,
  type CommunityJoinRequestPage,
} from './community-join-requests';
import { performDecideJoinRequest } from './community-join-request-actions';
import { applyCommunityJoinRequestedEvent } from './community-join-request-live';
import { communityMembersQueryKey, type CommunityMember, type CommunityMemberPage } from './community-members';
import type { ApiResult, HttpRequest, HttpTransport } from './http';

const wireRequest = (id: string, userId: string, extra: Record<string, unknown> = {}) => ({
  id,
  communityId: 'c1',
  userId,
  status: 'pending',
  via: 'self',
  country: 'SN',
  createdAt: '2026-11-18T09:00:00.000Z',
  user: { id: userId, username: `@${userId}`, displayName: `Nom ${userId}`, avatar: null },
  ...extra,
});

const request = (id: string, userId: string): CommunityJoinRequest => ({
  id,
  userId,
  name: `Nom ${userId}`,
  username: `@${userId}`,
  avatar: null,
  country: 'SN',
  createdAt: '2026-11-18T09:00:00.000Z',
});

const community: CommunitySummary = {
  id: 'c1',
  identifier: 'mshy_c1',
  name: 'Club',
  description: null,
  avatar: null,
  banner: null,
  isPrivate: true,
  createdBy: 'u-creator',
  memberCount: 3,
  conversationCount: 0,
  viewerRole: 'moderator',
  requiresJoinApproval: true,
};

const member = (id: string, userId: string): CommunityMember => ({ id, userId, role: 'member', name: userId, username: userId, avatar: null, online: false });

describe('décoder une demande', () => {
  test('rend le nom, l’avatar, le pays et la date — rien d’autre de la charge', () => {
    const decoded = decodeCommunityJoinRequest(wireRequest('q1', 'u-ann', { user: { id: 'u-ann', username: 'ann', displayName: ' ', avatar: '', isOnline: true, email: 'a@b.c' } }));
    expect(decoded).toEqual({ id: 'q1', userId: 'u-ann', name: 'ann', username: 'ann', avatar: null, country: 'SN', createdAt: '2026-11-18T09:00:00.000Z' });
  });

  test('un pays qui n’est pas un code ISO à deux lettres ne s’affiche pas', () => {
    expect(decodeCommunityJoinRequest(wireRequest('q1', 'u-ann', { country: 'Dakar' }))?.country).toBeNull();
    expect(decodeCommunityJoinRequest(wireRequest('q1', 'u-ann', { country: null }))?.country).toBeNull();
  });

  test('une demande déjà tranchée ou sans personne n’est pas une ligne', () => {
    expect(decodeCommunityJoinRequest(wireRequest('q1', 'u-ann', { status: 'rejected' }))).toBeNull();
    expect(decodeCommunityJoinRequest({ id: 'q1', userId: 'u', status: 'pending' })).toBeNull();
  });
});

describe('lire les demandes en attente', () => {
  const transportAnswering = (answer: ApiResult<unknown>, seen: HttpRequest[]) =>
    ({
      request: (req: HttpRequest) => {
        seen.push(req);
        return Promise.resolve(answer);
      },
    }) as unknown as HttpTransport;

  test('suit le curseur servi, et s’arrête quand la passerelle n’en sert plus', async () => {
    const seen: HttpRequest[] = [];
    const transport = transportAnswering(
      { ok: true, data: [wireRequest('q2', 'u-bob'), { broken: true }], pagination: { hasMore: true, nextCursor: 'aaaaaaaaaaaaaaaaaaaaaaaa' } as never },
      seen,
    );
    const result = await loadCommunityJoinRequests({ source: 'gateway', transport, communityId: 'c1', cursor: 'bbbbbbbbbbbbbbbbbbbbbbbb' });
    expect(seen[0]?.method).toBe('GET');
    expect(seen[0]?.path).toBe('/api/v1/communities/c1/join-requests?limit=50&cursor=bbbbbbbbbbbbbbbbbbbbbbbb');
    expect(result).toEqual({ ok: true, data: { requests: [request('q2', 'u-bob')], nextCursor: 'aaaaaaaaaaaaaaaaaaaaaaaa' } });

    const last = await loadCommunityJoinRequests({ source: 'gateway', transport: transportAnswering({ ok: true, data: [] }, seen), communityId: 'c1', cursor: null });
    expect(seen[1]?.path).toBe('/api/v1/communities/c1/join-requests?limit=50');
    expect(last).toEqual({ ok: true, data: { requests: [], nextCursor: null } });
  });
});

describe('qui tranche les demandes', () => {
  test('administrateur, modérateur et créateur — jamais un membre simple ni un visiteur', () => {
    expect(isCommunityStewardOf({ ...community, viewerRole: 'admin' }, 'u-x')).toBe(true);
    expect(isCommunityStewardOf({ ...community, viewerRole: 'moderator' }, 'u-x')).toBe(true);
    expect(isCommunityStewardOf({ ...community, viewerRole: null }, 'u-creator')).toBe(true);
    expect(isCommunityStewardOf({ ...community, viewerRole: 'member' }, 'u-x')).toBe(false);
    expect(isCommunityStewardOf({ ...community, viewerRole: null }, 'u-x')).toBe(false);
    expect(isCommunityStewardOf({ ...community, viewerRole: 'admin' }, null)).toBe(false);
  });
});

type Gate = { release: (answer: ApiResult<unknown>) => void; seen: HttpRequest[] };

function setup({ online = true }: { readonly online?: boolean } = {}) {
  const queryClient = new QueryClient();
  queryClient.setQueryData<InfiniteData<CommunityJoinRequestPage, string | null>>(communityJoinRequestsQueryKey('c1'), {
    pages: [{ requests: [request('q1', 'u-ann'), request('q2', 'u-bob')], nextCursor: null }],
    pageParams: [null],
  });
  queryClient.setQueryData<InfiniteData<CommunityMemberPage, number>>(communityMembersQueryKey('c1'), {
    pages: [{ members: [member('r1', 'u-creator')], nextOffset: null }],
    pageParams: [0],
  });
  queryClient.setQueryData(communityQueryKey('mshy_c1'), community);
  const gate: Gate = { release: () => undefined, seen: [] };
  const transport = {
    request: (req: HttpRequest) =>
      new Promise<ApiResult<unknown>>((resolve) => {
        gate.seen.push(req);
        gate.release = resolve;
      }),
  } as unknown as HttpTransport;
  const deps = { source: 'gateway' as const, transport, queryClient, isOnline: () => online };
  const pending = () =>
    queryClient
      .getQueryData<InfiniteData<CommunityJoinRequestPage, string | null>>(communityJoinRequestsQueryKey('c1'))
      ?.pages.flatMap((page) => page.requests.map((row) => row.id)) ?? [];
  const members = () =>
    queryClient.getQueryData<InfiniteData<CommunityMemberPage, number>>(communityMembersQueryKey('c1'))?.pages.flatMap((page) => page.members.map((row) => row.userId)) ?? [];
  const count = () => queryClient.getQueryData<CommunitySummary>(communityQueryKey('mshy_c1'))?.memberCount;
  return { deps, gate, pending, members, count, queryClient };
}

const servedMember = {
  id: 'r9',
  communityId: 'c1',
  userId: 'u-ann',
  role: 'member',
  user: { id: 'u-ann', username: 'ann', displayName: 'Ann', avatar: null, isOnline: true },
};

describe('accepter une demande', () => {
  test('la demande quitte la liste et le compteur monte AU GESTE ; le membre servi entre dans l’effectif', async () => {
    const { deps, gate, pending, members, count } = setup();
    const decided = performDecideJoinRequest({ community, request: request('q1', 'u-ann'), decision: 'accept', deps });
    expect(pending()).toEqual(['q2']);
    expect(count()).toBe(4);
    expect(gate.seen[0]).toMatchObject({ method: 'POST', path: '/api/v1/communities/c1/join-requests/q1/accept' });
    gate.release({ ok: true, data: servedMember });
    expect((await decided).status).toBe('accepted');
    expect(members()).toEqual(['u-creator', 'u-ann']);
    expect(count()).toBe(4);
  });

  test('un échec rend EXACTEMENT la liste et le compteur d’avant', async () => {
    const { deps, gate, pending, members, count } = setup();
    const decided = performDecideJoinRequest({ community, request: request('q1', 'u-ann'), decision: 'accept', deps });
    gate.release({ ok: false, status: 500, error: 'boom' });
    expect((await decided).status).toBe('error');
    expect(pending()).toEqual(['q1', 'q2']);
    expect(members()).toEqual(['u-creator']);
    expect(count()).toBe(3);
  });

  test('un 404 dit qu’elle a déjà été tranchée ailleurs : la ligne reste partie et tout se relit', async () => {
    const { deps, gate, pending, count, queryClient } = setup();
    const decided = performDecideJoinRequest({ community, request: request('q1', 'u-ann'), decision: 'accept', deps });
    gate.release({ ok: false, status: 404, error: 'Community not found' });
    expect((await decided).status).toBe('gone');
    expect(pending()).toEqual(['q2']);
    expect(count()).toBe(3);
    expect(queryClient.getQueryState(communityJoinRequestsQueryKey('c1'))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(communityMembersQueryKey('c1'))?.isInvalidated).toBe(true);
  });

  test('hors ligne, rien ne part ni ne change', async () => {
    const { deps, gate, pending, count } = setup({ online: false });
    expect((await performDecideJoinRequest({ community, request: request('q1', 'u-ann'), decision: 'accept', deps })).status).toBe('offline');
    expect(gate.seen).toEqual([]);
    expect(pending()).toEqual(['q1', 'q2']);
    expect(count()).toBe(3);
  });
});

describe('refuser une demande', () => {
  test('la demande quitte la liste, personne n’entre, le compteur ne bouge pas', async () => {
    const { deps, gate, pending, members, count } = setup();
    const decided = performDecideJoinRequest({ community, request: request('q2', 'u-bob'), decision: 'reject', deps });
    expect(pending()).toEqual(['q1']);
    expect(gate.seen[0]).toMatchObject({ method: 'POST', path: '/api/v1/communities/c1/join-requests/q2/reject' });
    gate.release({ ok: true, data: { id: 'q2', status: 'rejected' } });
    expect((await decided).status).toBe('rejected');
    expect(members()).toEqual(['u-creator']);
    expect(count()).toBe(3);
  });

  test('un échec remet la demande à sa place', async () => {
    const { deps, gate, pending } = setup();
    const decided = performDecideJoinRequest({ community, request: request('q2', 'u-bob'), decision: 'reject', deps });
    gate.release({ ok: false, status: 0, error: 'network' });
    expect((await decided).status).toBe('error');
    expect(pending()).toEqual(['q1', 'q2']);
  });
});

describe('community:join-requested, en direct', () => {
  test('relit la liste de CETTE communauté, jamais celle d’une autre', () => {
    const { queryClient } = setup();
    queryClient.setQueryData(communityJoinRequestsQueryKey('c2'), { pages: [], pageParams: [null] });
    applyCommunityJoinRequestedEvent(queryClient, { communityId: 'c1', requestId: 'q3', userId: 'u-cy', pendingCount: 3, at: '2026-11-19T10:00:00.000Z' });
    expect(queryClient.getQueryState(communityJoinRequestsQueryKey('c1'))?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(communityJoinRequestsQueryKey('c2'))?.isInvalidated).toBe(false);
  });

  test('une charge sans communauté ne relance rien', () => {
    const { queryClient } = setup();
    applyCommunityJoinRequestedEvent(queryClient, { requestId: 'q3' });
    applyCommunityJoinRequestedEvent(queryClient, null);
    expect(queryClient.getQueryState(communityJoinRequestsQueryKey('c1'))?.isInvalidated).toBe(false);
  });
});
