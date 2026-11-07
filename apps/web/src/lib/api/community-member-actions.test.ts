import { describe, expect, test } from 'bun:test';
import { QueryClient, type InfiniteData } from '@tanstack/react-query';

import { communityQueryKey, type CommunitySummary } from './communities';
import { performChangeMemberRole, performRemoveMember } from './community-member-actions';
import { communityMembersQueryKey, type CommunityMember, type CommunityMemberPage } from './community-members';
import type { ApiResult, HttpTransport } from './http';

const member = (id: string, userId: string, role: CommunityMember['role'] = 'member'): CommunityMember => ({
  id,
  userId,
  role,
  name: userId,
  username: userId,
  avatar: null,
  online: false,
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
  viewerRole: 'admin',
};

const pages = (): InfiniteData<CommunityMemberPage, number> => ({
  pages: [{ members: [member('r1', 'u-creator', 'admin'), member('r2', 'u-bob')], nextOffset: 2 }, { members: [member('r3', 'u-ann')], nextOffset: null }],
  pageParams: [0, 2],
});

type Gate = { release: (answer: ApiResult<unknown>) => void };

function setup({ online = true }: { readonly online?: boolean } = {}) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(communityMembersQueryKey('c1'), pages());
  queryClient.setQueryData(communityQueryKey('mshy_c1'), community);
  const gate: Gate = { release: () => undefined };
  const transport = {
    request: () =>
      new Promise<ApiResult<unknown>>((resolve) => {
        gate.release = resolve;
      }),
  } as unknown as HttpTransport;
  const deps = { source: 'gateway' as const, transport, queryClient, isOnline: () => online };
  const rows = () =>
    queryClient.getQueryData<InfiniteData<CommunityMemberPage, number>>(communityMembersQueryKey('c1'))?.pages.flatMap((page) => page.members) ?? [];
  const detail = () => queryClient.getQueryData<CommunitySummary>(communityQueryKey('mshy_c1'));
  return { deps, gate, rows, detail };
}

describe('changer un rôle', () => {
  test('la ligne change AU GESTE, avant la réponse, et reste après un succès', async () => {
    const { deps, gate, rows } = setup();
    const pending = performChangeMemberRole({ community, member: member('r3', 'u-ann'), role: 'moderator', deps });
    expect(rows().find((row) => row.id === 'r3')?.role).toBe('moderator');
    gate.release({ ok: true, data: {} });
    expect((await pending).status).toBe('changed');
    expect(rows().find((row) => row.id === 'r3')?.role).toBe('moderator');
  });

  test('un refus rend EXACTEMENT ce qui était en cache', async () => {
    const { deps, gate, rows } = setup();
    const before = rows();
    const pending = performChangeMemberRole({ community, member: member('r2', 'u-bob'), role: 'admin', deps });
    gate.release({ ok: false, status: 403, error: 'nope' });
    expect((await pending).status).toBe('refused');
    expect(rows()).toEqual(before);
  });

  test('hors ligne, rien ne part ni ne change', async () => {
    const { deps, rows } = setup({ online: false });
    const before = rows();
    expect((await performChangeMemberRole({ community, member: member('r2', 'u-bob'), role: 'admin', deps })).status).toBe('offline');
    expect(rows()).toEqual(before);
  });
});

describe('retirer un membre', () => {
  test('la ligne disparaît au geste et le compteur du détail descend', async () => {
    const { deps, gate, rows, detail } = setup();
    const pending = performRemoveMember({ community, member: member('r2', 'u-bob'), deps });
    expect(rows().map((row) => row.id)).toEqual(['r1', 'r3']);
    expect(detail()?.memberCount).toBe(2);
    gate.release({ ok: true, data: {} });
    expect((await pending).status).toBe('removed');
  });

  test('un 404 décrit l’état visé (déjà retiré ailleurs) : la ligne reste partie', async () => {
    const { deps, gate, rows } = setup();
    const pending = performRemoveMember({ community, member: member('r2', 'u-bob'), deps });
    gate.release({ ok: false, status: 404, error: 'gone' });
    expect((await pending).status).toBe('removed');
    expect(rows().map((row) => row.id)).toEqual(['r1', 'r3']);
  });

  test('et puisqu’un 404 dit aussi « communauté désactivée », la liste et la fiche sont relues', async () => {
    const { deps, gate } = setup();
    const pending = performRemoveMember({ community, member: member('r2', 'u-bob'), deps });
    gate.release({ ok: false, status: 404, error: 'gone' });
    await pending;
    expect(deps.queryClient.getQueryState(communityMembersQueryKey('c1'))?.isInvalidated).toBe(true);
    expect(deps.queryClient.getQueryState(communityQueryKey('mshy_c1'))?.isInvalidated).toBe(true);
  });

  test('un échec remet la ligne ET le compteur', async () => {
    const { deps, gate, rows, detail } = setup();
    const before = rows();
    const pending = performRemoveMember({ community, member: member('r2', 'u-bob'), deps });
    gate.release({ ok: false, status: 500, error: 'boom' });
    expect((await pending).status).toBe('error');
    expect(rows()).toEqual(before);
    expect(detail()?.memberCount).toBe(3);
  });
});
