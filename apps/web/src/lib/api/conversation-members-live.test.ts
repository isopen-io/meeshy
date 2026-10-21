import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { SocketClient, SocketHandler } from '@/lib/net/socket';

import { conversationMembersQueryKey, type ConversationMember, type ConversationMembersData } from './conversation-members';
import { bindConversationMembersLive } from './conversation-members-live';
import { conversationQueryKey } from './conversations';
import type { Conversation } from './types';

/**
 * **LA FEUILLE OUVERTE SUIT CE QUE LES AUTRES FONT** (#10613) — un rang changé,
 * un départ, un bannissement ou une arrivée, faits sur un autre appareil,
 * se voient dans la liste des membres sans la rouvrir.
 */

const member = (id: string, role = 'member'): ConversationMember => ({
  id: `p-${id}`,
  userId: `u-${id}`,
  username: id,
  displayName: id,
  avatar: undefined,
  role,
});

const fakeSocket = () => {
  const handlers = new Map<string, SocketHandler<unknown>>();
  const socket: SocketClient = {
    connected: true,
    connect: () => undefined,
    disconnect: () => undefined,
    on: (event, handler) => handlers.set(event, handler as SocketHandler<unknown>),
    off: (event) => handlers.delete(event),
    emit: () => undefined,
  };
  return { socket, fire: (event: string, payload: unknown) => handlers.get(event)?.(payload), handlers };
};

const seed = (members: readonly ConversationMember[]) => {
  const queryClient = new QueryClient();
  const data: ConversationMembersData = { pages: [{ members, nextCursor: null, totalCount: members.length }], pageParams: [null] };
  queryClient.setQueryData(conversationMembersQueryKey('c-1'), data);
  return queryClient;
};

const page = (queryClient: QueryClient) => queryClient.getQueryData<ConversationMembersData>(conversationMembersQueryKey('c-1'))?.pages[0];

describe('la liste des membres suit le temps réel de SA conversation', () => {
  test('un rang changé ailleurs se voit', () => {
    const queryClient = seed([member('a'), member('b')]);
    const { socket, fire } = fakeSocket();
    bindConversationMembersLive({ socket, queryClient, conversationId: 'c-1', viewerId: 'u-a' });
    fire('participant:role-updated', { conversationId: 'c-1', userId: 'u-b', newRole: 'MODERATOR', updatedBy: 'u-a' });
    expect(page(queryClient)?.members.find((m) => m.id === 'p-b')?.role).toBe('moderator');
  });

  test('le LECTEUR qui change de rang le voit aussi sur sa conversation', () => {
    const queryClient = seed([member('a'), member('b')]);
    queryClient.setQueryData(conversationQueryKey('c-1'), { id: 'c-1', currentUserRole: 'member' } as unknown as Conversation);
    const { socket, fire } = fakeSocket();
    bindConversationMembersLive({ socket, queryClient, conversationId: 'c-1', viewerId: 'u-a' });
    fire('participant:role-updated', { conversationId: 'c-1', userId: 'u-a', newRole: 'ADMIN', updatedBy: 'u-z' });
    expect(queryClient.getQueryData<Conversation>(conversationQueryKey('c-1'))?.currentUserRole).toBe('admin');
  });

  test('un départ et un bannissement retirent la rangée et décomptent', () => {
    const queryClient = seed([member('a'), member('b'), member('c')]);
    const { socket, fire } = fakeSocket();
    bindConversationMembersLive({ socket, queryClient, conversationId: 'c-1', viewerId: 'u-a' });
    fire('conversation:participant-left', { conversationId: 'c-1', participantId: 'p-b', userId: 'u-b', displayName: 'b', leftAt: '2026-10-14' });
    fire('conversation:participant-banned', { conversationId: 'c-1', userId: 'u-c', bannedBy: { id: 'u-a' }, bannedAt: '2026-10-14' });
    expect(page(queryClient)?.members.map((m) => m.id)).toEqual(['p-a']);
    expect(page(queryClient)?.totalCount).toBe(1);
  });

  test('un événement d’une AUTRE conversation ne touche rien', () => {
    const queryClient = seed([member('a'), member('b')]);
    const { socket, fire } = fakeSocket();
    bindConversationMembersLive({ socket, queryClient, conversationId: 'c-1', viewerId: 'u-a' });
    fire('conversation:participant-left', { conversationId: 'c-2', userId: 'u-b', displayName: 'b', leftAt: '2026-10-14' });
    fire('participant:role-updated', { conversationId: 'c-2', userId: 'u-a', newRole: 'admin', updatedBy: 'x' });
    expect(page(queryClient)?.members).toEqual([member('a'), member('b')]);
  });

  test('une arrivée relit la liste servie', () => {
    const queryClient = seed([member('a')]);
    const { socket, fire } = fakeSocket();
    bindConversationMembersLive({ socket, queryClient, conversationId: 'c-1', viewerId: 'u-a' });
    fire('conversation:participant-joined', { conversationId: 'c-1', userId: 'u-z', displayName: 'z', joinedAt: '2026-10-14' });
    expect(queryClient.getQueryState(conversationMembersQueryKey('c-1'))?.isInvalidated).toBe(true);
  });

  test('une charge mal formée est ignorée, et le débranchement retire chaque écoute', () => {
    const queryClient = seed([member('a')]);
    const { socket, fire, handlers } = fakeSocket();
    const unbind = bindConversationMembersLive({ socket, queryClient, conversationId: 'c-1', viewerId: 'u-a' });
    fire('participant:role-updated', { conversationId: 'c-1', viewerId: 'u-a' });
    fire('conversation:participant-left', null);
    expect(page(queryClient)?.members).toEqual([member('a')]);
    unbind();
    expect(handlers.size).toBe(0);
  });
});
