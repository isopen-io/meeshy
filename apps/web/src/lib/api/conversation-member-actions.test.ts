import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { conversationMembersQueryKey, type ConversationMember, type ConversationMembersData } from './conversation-members';
import { addConversationMembers, performMemberAction } from './conversation-member-actions';
import { CONVERSATIONS_QUERY_KEY, conversationQueryKey, type ConversationsDeps } from './conversations';
import type { ConversationsInfiniteData } from './conversations-pages';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import type { Conversation } from './types';

/**
 * **GÉRER LES MEMBRES D'UN GROUPE DEPUIS LE WEB** (#10613) — chaque geste se
 * voit AVANT la réponse (la liste des membres change aussitôt), part sur la
 * route existante de la passerelle, et se défait si elle refuse.
 */

const member = (id: string, role = 'member', userId: string | null = `u-${id}`): ConversationMember => ({
  id: `p-${id}`,
  userId,
  username: userId === null ? null : id,
  displayName: id,
  avatar: undefined,
  role,
});

const seed = (members: readonly ConversationMember[], totalCount = members.length) => {
  const queryClient = new QueryClient();
  const data: ConversationMembersData = { pages: [{ members, nextCursor: null, totalCount }], pageParams: [null] };
  queryClient.setQueryData(conversationMembersQueryKey('c-1'), data);
  const conversation = { id: 'c-1', type: 'group', memberCount: totalCount, participants: [] } as unknown as Conversation;
  const list: ConversationsInfiniteData = { pages: [{ conversations: [conversation], hasMore: false } as never], pageParams: [undefined] };
  queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, list);
  queryClient.setQueryData(conversationQueryKey('c-1'), conversation);
  return queryClient;
};

const membersOf = (queryClient: QueryClient) =>
  queryClient.getQueryData<ConversationMembersData>(conversationMembersQueryKey('c-1'))?.pages.flatMap((page) => page.members) ?? [];
const totalOf = (queryClient: QueryClient) => queryClient.getQueryData<ConversationMembersData>(conversationMembersQueryKey('c-1'))?.pages[0]?.totalCount;
const listCountOf = (queryClient: QueryClient) =>
  queryClient.getQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY)?.pages[0]?.conversations[0]?.memberCount;

/** Un transport qui répond quand on le lui dit — on observe l'état PENDANT le vol. */
const deferredTransport = () => {
  const calls: HttpRequest[] = [];
  let resolve: (reply: ApiResult<unknown>) => void = () => undefined;
  const transport = (async () => ({ ok: false, status: 0, error: 'jamais' })) as unknown as HttpTransport;
  transport.request = ((req: HttpRequest) => {
    calls.push(req);
    return new Promise<ApiResult<unknown>>((done) => {
      resolve = done;
    });
  }) as HttpTransport['request'];
  const deps: ConversationsDeps = { source: 'gateway', transport };
  return { deps, calls, reply: (value: ApiResult<unknown>) => resolve(value) };
};

describe('changer un rang', () => {
  test('le nouveau rang se voit avant la réponse, la route reçoit le rang en minuscules', async () => {
    const queryClient = seed([member('a'), member('b')]);
    const net = deferredTransport();
    const pending = performMemberAction({ deps: { ...net.deps, queryClient }, conversationId: 'c-1', member: member('a'), action: { kind: 'promote-moderator', targetKey: 'u-a' } });
    expect(membersOf(queryClient).find((m) => m.id === 'p-a')?.role).toBe('moderator');
    expect(net.calls[0]).toMatchObject({ method: 'PATCH', path: '/api/v1/conversations/c-1/participants/u-a/role', body: { role: 'moderator' } });
    net.reply({ ok: true, data: { role: 'moderator' } });
    expect(await pending).toEqual({ ok: true });
    expect(membersOf(queryClient).find((m) => m.id === 'p-a')?.role).toBe('moderator');
  });

  test('un refus défait le changement et rend la raison servie', async () => {
    const queryClient = seed([member('a', 'admin')]);
    const net = deferredTransport();
    const pending = performMemberAction({ deps: { ...net.deps, queryClient }, conversationId: 'c-1', member: member('a', 'admin'), action: { kind: 'demote-member', targetKey: 'u-a' } });
    expect(membersOf(queryClient)[0]?.role).toBe('member');
    net.reply({ ok: false, status: 403, error: 'Vous ne pouvez pas modifier le rang' });
    expect(await pending).toEqual({ ok: false, reason: 'refused', error: 'Vous ne pouvez pas modifier le rang' });
    expect(membersOf(queryClient)[0]?.role).toBe('admin');
  });
});

describe('retirer, bannir', () => {
  test('expulser retire la rangée et décompte le groupe aussitôt, liste et détail compris', async () => {
    const queryClient = seed([member('a'), member('b')], 2);
    const net = deferredTransport();
    const pending = performMemberAction({ deps: { ...net.deps, queryClient }, conversationId: 'c-1', member: member('b'), action: { kind: 'expel', targetKey: 'u-b' } });
    expect(membersOf(queryClient).map((m) => m.id)).toEqual(['p-a']);
    expect(totalOf(queryClient)).toBe(1);
    expect(listCountOf(queryClient)).toBe(1);
    expect(queryClient.getQueryData<Conversation>(conversationQueryKey('c-1'))?.memberCount).toBe(1);
    expect(net.calls[0]).toMatchObject({ method: 'DELETE', path: '/api/v1/conversations/c-1/participants/u-b' });
    net.reply({ ok: true, data: { message: 'ok' } });
    expect(await pending).toEqual({ ok: true });
  });

  test('une panne remet la rangée et le compte', async () => {
    const queryClient = seed([member('a'), member('b')], 2);
    const net = deferredTransport();
    const pending = performMemberAction({ deps: { ...net.deps, queryClient }, conversationId: 'c-1', member: member('b'), action: { kind: 'ban', targetKey: 'u-b' } });
    expect(net.calls[0]).toMatchObject({ method: 'PATCH', path: '/api/v1/conversations/c-1/participants/u-b/ban' });
    net.reply({ ok: false, status: 0, error: 'réseau' });
    expect(await pending).toEqual({ ok: false, reason: 'failed', error: 'réseau' });
    expect(membersOf(queryClient).map((m) => m.id)).toEqual(['p-a', 'p-b']);
    expect(totalOf(queryClient)).toBe(2);
    expect(listCountOf(queryClient)).toBe(2);
  });

  test('un visiteur sans compte est visé par son identifiant de participant', async () => {
    const queryClient = seed([member('v', 'member', null)]);
    const net = deferredTransport();
    const pending = performMemberAction({ deps: { ...net.deps, queryClient }, conversationId: 'c-1', member: member('v', 'member', null), action: { kind: 'expel', targetKey: 'p-v' } });
    expect(net.calls[0]?.path).toBe('/api/v1/conversations/c-1/participants/p-v');
    net.reply({ ok: true, data: {} });
    await pending;
  });
});

describe('ajouter des membres', () => {
  test('les personnes choisies paraissent tout de suite, un seul appel les porte toutes, les refus se rendent', async () => {
    const queryClient = seed([member('a')], 1);
    const net = deferredTransport();
    const pending = addConversationMembers({
      deps: { ...net.deps, queryClient },
      conversationId: 'c-1',
      people: [
        { id: 'u-x', username: 'x', displayName: 'Xavier', avatar: null },
        { id: 'u-y', username: 'y', displayName: null, avatar: null },
      ],
    });
    expect(membersOf(queryClient).map((m) => m.displayName)).toEqual(['a', 'Xavier', 'y']);
    expect(totalOf(queryClient)).toBe(3);
    expect(net.calls[0]).toMatchObject({ method: 'POST', path: '/api/v1/conversations/c-1/participants', body: { userIds: ['u-x', 'u-y'] } });
    net.reply({ ok: true, data: { results: [{ userId: 'u-x', outcome: 'new' }, { userId: 'u-y', outcome: 'banned' }] } });
    expect(await pending).toEqual({ ok: true, added: ['u-x'], refused: ['u-y'] });
  });

  test('un refus de la requête entière défait l’ajout', async () => {
    const queryClient = seed([member('a')], 1);
    const net = deferredTransport();
    const pending = addConversationMembers({
      deps: { ...net.deps, queryClient },
      conversationId: 'c-1',
      people: [{ id: 'u-x', username: 'x', displayName: 'Xavier', avatar: null }],
    });
    net.reply({ ok: false, status: 403, error: 'Interdit' });
    expect(await pending).toEqual({ ok: false, reason: 'refused', error: 'Interdit' });
    expect(membersOf(queryClient).map((m) => m.id)).toEqual(['p-a']);
    expect(totalOf(queryClient)).toBe(1);
  });
});
