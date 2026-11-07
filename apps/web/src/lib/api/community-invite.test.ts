import { describe, expect, test } from 'bun:test';
import { QueryClient, type InfiniteData } from '@tanstack/react-query';

import { communityQueryKey, type CommunitySummary } from './communities';
import { canInviteOf } from '@/lib/communities/view';

import { performInviteMembers } from './community-invite';
import { communityMembersQueryKey, type CommunityMember, type CommunityMemberPage } from './community-members';
import type { PersonSummary } from './friend-requests';
import type { ApiResult, HttpRequest, HttpTransport } from './http';

const community = (overrides: Partial<CommunitySummary> = {}): CommunitySummary => ({
  id: 'c1',
  identifier: 'mshy_c1',
  name: 'Club',
  description: null,
  avatar: null,
  banner: null,
  isPrivate: false,
  createdBy: 'u-creator',
  memberCount: 2,
  conversationCount: 0,
  viewerRole: 'member',
  ...overrides,
});

const person = (id: string): PersonSummary => ({ id, username: id, displayName: `Nom ${id}`, avatar: null });

const member = (id: string, userId: string): CommunityMember => ({ id, userId, role: 'member', name: userId, username: userId, avatar: null, online: false });

const servedRow = (userId: string) => ({
  id: `row-${userId}`,
  userId,
  role: 'member',
  user: { id: userId, username: userId, displayName: `Nom ${userId}`, avatar: null, isOnline: false, lastActiveAt: '2026-11-07T10:00:00Z', email: 'x@y.z' },
});

function setup({ online = true, answers }: { readonly online?: boolean; readonly answers: Readonly<Record<string, ApiResult<unknown>>> }) {
  const queryClient = new QueryClient();
  queryClient.setQueryData<InfiniteData<CommunityMemberPage, number>>(communityMembersQueryKey('c1'), {
    pages: [{ members: [member('r1', 'u-creator'), member('r2', 'u-bob')], nextOffset: null }],
    pageParams: [0],
  });
  queryClient.setQueryData(communityQueryKey('mshy_c1'), community());
  const sent: HttpRequest[] = [];
  const gates: Array<() => void> = [];
  const transport = {
    request: (request: HttpRequest) => {
      sent.push(request);
      const userId = (request.body as { userId: string }).userId;
      return new Promise<ApiResult<unknown>>((resolve) => gates.push(() => resolve(answers[userId] ?? { ok: false, status: 500, error: 'x' })));
    },
  } as unknown as HttpTransport;
  const deps = { source: 'gateway' as const, transport, queryClient, isOnline: () => online };
  const rows = () =>
    queryClient.getQueryData<InfiniteData<CommunityMemberPage, number>>(communityMembersQueryKey('c1'))?.pages.flatMap((page) => page.members) ?? [];
  const detail = () => queryClient.getQueryData<CommunitySummary>(communityQueryKey('mshy_c1'));
  const releaseAll = () => gates.forEach((release) => release());
  return { deps, sent, rows, detail, releaseAll };
}

describe('qui peut inviter', () => {
  test('un membre invite dans une communauté publique', () => {
    expect(canInviteOf(community({ viewerRole: 'member' }))).toBe(true);
  });

  test('dans une communauté privée, seuls administrateurs et modérateurs invitent (la règle de la passerelle)', () => {
    expect(canInviteOf(community({ isPrivate: true, viewerRole: 'member' }))).toBe(false);
    expect(canInviteOf(community({ isPrivate: true, viewerRole: 'moderator' }))).toBe(true);
    expect(canInviteOf(community({ isPrivate: true, viewerRole: 'admin' }))).toBe(true);
  });

  test('un non-membre, ou un rôle non servi, n’a pas le geste', () => {
    expect(canInviteOf(community({ viewerRole: null }))).toBe(false);
    const { viewerRole: _served, ...unserved } = community();
    expect(canInviteOf(unserved)).toBe(false);
  });
});

describe('inviter, optimiste', () => {
  test('les personnes paraissent AU GESTE dans les membres et le compteur monte, avant la réponse', async () => {
    const { deps, rows, detail, releaseAll } = setup({ answers: { 'u-ann': { ok: true, data: servedRow('u-ann') } } });
    const pending = performInviteMembers({ community: community(), people: [person('u-ann')], deps });
    expect(rows().map((row) => row.userId)).toEqual(['u-creator', 'u-bob', 'u-ann']);
    expect(detail()?.memberCount).toBe(3);
    releaseAll();
    const outcome = await pending;
    expect(outcome).toEqual({ status: 'done', invited: 1, refused: 0, failed: 0 });
    expect(rows().find((row) => row.userId === 'u-ann')?.id).toBe('row-u-ann');
    expect(detail()?.memberCount).toBe(3);
  });

  test('une invitation par personne, sur l’adresse d’invitation, avec le seul identifiant', async () => {
    const { deps, sent, releaseAll } = setup({ answers: {} });
    const pending = performInviteMembers({ community: community(), people: [person('u-ann'), person('u-cy')], deps });
    releaseAll();
    await pending;
    expect(sent.map((request) => [request.method, request.path, request.body])).toEqual([
      ['POST', '/api/v1/communities/c1/invite', { userId: 'u-ann' }],
      ['POST', '/api/v1/communities/c1/invite', { userId: 'u-cy' }],
    ]);
  });

  test('une personne refusée (404 : inconnue, désactivée ou bloquée) repart seule, les autres restent', async () => {
    const { deps, rows, detail, releaseAll } = setup({
      answers: { 'u-ann': { ok: true, data: servedRow('u-ann') }, 'u-cy': { ok: false, status: 404, error: 'User to invite not found' } },
    });
    const pending = performInviteMembers({ community: community(), people: [person('u-ann'), person('u-cy')], deps });
    expect(detail()?.memberCount).toBe(4);
    releaseAll();
    expect(await pending).toEqual({ status: 'done', invited: 1, refused: 1, failed: 0 });
    expect(rows().map((row) => row.userId)).toEqual(['u-creator', 'u-bob', 'u-ann']);
    expect(detail()?.memberCount).toBe(3);
  });

  test('une panne rend exactement le cache d’avant', async () => {
    const { deps, rows, detail, releaseAll } = setup({ answers: { 'u-ann': { ok: false, status: 503, error: 'down' } } });
    const before = rows();
    const pending = performInviteMembers({ community: community(), people: [person('u-ann')], deps });
    releaseAll();
    expect(await pending).toEqual({ status: 'done', invited: 0, refused: 0, failed: 1 });
    expect(rows()).toEqual(before);
    expect(detail()?.memberCount).toBe(2);
  });

  test('déjà membre (409) : l’état visé est atteint, la ligne provisoire repart et la vérité est relue', async () => {
    const { deps, rows, detail, releaseAll } = setup({ answers: { 'u-bob': { ok: false, status: 409, error: 'already' } } });
    const pending = performInviteMembers({ community: community(), people: [person('u-bob')], deps });
    releaseAll();
    expect(await pending).toEqual({ status: 'done', invited: 1, refused: 0, failed: 0 });
    expect(rows().filter((row) => row.userId === 'u-bob')).toHaveLength(1);
    expect(detail()?.memberCount).toBe(2);
  });

  test('hors ligne, rien ne part ni ne change', async () => {
    const { deps, sent, rows } = setup({ online: false, answers: {} });
    const before = rows();
    expect(await performInviteMembers({ community: community(), people: [person('u-ann')], deps })).toEqual({ status: 'offline' });
    expect(sent).toHaveLength(0);
    expect(rows()).toEqual(before);
  });

  test('rien de ce que la passerelle sert À CÔTÉ (activité, e-mail) n’entre dans le cache persisté', async () => {
    const { deps, rows, releaseAll } = setup({ answers: { 'u-ann': { ok: true, data: servedRow('u-ann') } } });
    const pending = performInviteMembers({ community: community(), people: [person('u-ann')], deps });
    releaseAll();
    await pending;
    const stored = JSON.stringify(rows());
    expect(stored).not.toContain('lastActiveAt');
    expect(stored).not.toContain('x@y.z');
  });
});
