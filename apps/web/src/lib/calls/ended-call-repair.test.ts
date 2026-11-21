import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { conversationActiveCallQueryKey } from '@/lib/api/call-sessions';
import { CONVERSATIONS_QUERY_KEY, conversationQueryKey, findCachedConversation } from '@/lib/api/conversations';
import type { ListConversation } from '@/lib/api/list-preview';
import { messagesQueryKey } from '@/lib/api/messages';
import type { Conversation, Message } from '@/lib/api/types';

import { repairEndedCall } from './ended-call-repair';

/**
 * #19778 — la carte d'un appel TERMINÉ offrait encore « Rejoindre ». Quand le
 * serveur a dit que CET appel est fini (join refusé CALL_ENDED, sondage qui ne
 * le voit plus), ce que le client en tenait pour vivant cesse de l'être : le
 * sondage du fil, la ligne de liste et le détail, et le fil se relit pour que
 * la carte reçoive son résumé terminal servi.
 */

const conversation = (activeCall: ListConversation['activeCall'] | undefined): ListConversation =>
  ({
    id: 'c1',
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...(activeCall === undefined ? {} : { activeCall }),
  }) as ListConversation;

const callMessage = (kind: 'call' | 'call-live', callId: string): Message =>
  ({ id: `m-${callId}`, conversationId: 'c1', content: 'Appel audio en cours', messageType: 'system', metadata: { kind, callId, callType: 'audio' } }) as unknown as Message;

function seeded(options: { readonly row?: ListConversation; readonly probe?: { readonly callId: string; readonly media: 'audio' | 'video' } | null; readonly thread?: readonly Message[] }): QueryClient {
  const queryClient = new QueryClient();
  if (options.row !== undefined) {
    queryClient.setQueryData(CONVERSATIONS_QUERY_KEY, {
      pages: [{ conversations: [options.row], pagination: { limit: 30, offset: 0, total: 1, hasMore: false }, cursorPagination: { limit: 30, hasMore: false, nextCursor: null } }],
      pageParams: [undefined],
    });
    queryClient.setQueryData(conversationQueryKey('c1'), options.row as Conversation);
  }
  if (options.probe !== undefined) queryClient.setQueryData(conversationActiveCallQueryKey('c1'), options.probe);
  if (options.thread !== undefined) queryClient.setQueryData(messagesQueryKey('c1'), { pages: [{ messages: options.thread, hasOlder: false, nextCursor: null }], pageParams: [undefined] });
  return queryClient;
}

const rowCall = (queryClient: QueryClient) => (findCachedConversation(queryClient, 'c1') as ListConversation | undefined)?.activeCall;
const detailCall = (queryClient: QueryClient) => queryClient.getQueryData<ListConversation>(conversationQueryKey('c1'))?.activeCall;
const threadInvalidated = (queryClient: QueryClient) => queryClient.getQueryState(messagesQueryKey('c1'))?.isInvalidated === true;

describe('repairEndedCall (#19778)', () => {
  test('le sondage du fil qui nommait CET appel ne le nomme plus', () => {
    const queryClient = seeded({ probe: { callId: 'k1', media: 'video' } });
    repairEndedCall(queryClient, { conversationId: 'c1', callId: 'k1' });
    expect(queryClient.getQueryData(conversationActiveCallQueryKey('c1'))).toBeNull();
  });

  test('un AUTRE appel vivant que le sondage nomme reste joignable', () => {
    const queryClient = seeded({ probe: { callId: 'k2', media: 'audio' } });
    repairEndedCall(queryClient, { conversationId: 'c1', callId: 'k1' });
    expect(queryClient.getQueryData(conversationActiveCallQueryKey('c1'))).toEqual({ callId: 'k2', media: 'audio' });
  });

  test('un sondage jamais répondu ne s’invente pas de réponse', () => {
    const queryClient = seeded({});
    repairEndedCall(queryClient, { conversationId: 'c1', callId: 'k1' });
    expect(queryClient.getQueryData(conversationActiveCallQueryKey('c1'))).toBeUndefined();
  });

  test('la ligne de liste et le détail perdent l’appel fini, pas un autre', () => {
    const ended = seeded({ row: conversation({ id: 'k1', kind: 'audio' } as ListConversation['activeCall']) });
    repairEndedCall(ended, { conversationId: 'c1', callId: 'k1' });
    expect(rowCall(ended)).toBeUndefined();
    expect(detailCall(ended)).toBeUndefined();

    const other = seeded({ row: conversation({ id: 'k2', kind: 'audio' } as ListConversation['activeCall']) });
    repairEndedCall(other, { conversationId: 'c1', callId: 'k1' });
    expect(rowCall(other)?.id).toBe('k2');
    expect(detailCall(other)?.id).toBe('k2');
  });

  test('le fil qui tient la carte « en cours » de cet appel se relit', () => {
    const queryClient = seeded({ thread: [callMessage('call-live', 'k1')] });
    repairEndedCall(queryClient, { conversationId: 'c1', callId: 'k1' });
    expect(threadInvalidated(queryClient)).toBe(true);
  });

  test('un fil dont la carte est déjà terminale, ou d’un autre appel, ne se relit pas', () => {
    const terminal = seeded({ thread: [callMessage('call', 'k1')] });
    repairEndedCall(terminal, { conversationId: 'c1', callId: 'k1' });
    expect(threadInvalidated(terminal)).toBe(false);

    const other = seeded({ thread: [callMessage('call-live', 'k2')] });
    repairEndedCall(other, { conversationId: 'c1', callId: 'k1' });
    expect(threadInvalidated(other)).toBe(false);
  });
});
