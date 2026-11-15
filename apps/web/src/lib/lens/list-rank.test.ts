import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { ConversationUpdatedEventData } from '@meeshy/shared/types/socketio-events/conversation';

import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import type { ListConversation } from '@/lib/api/list-preview';
import { applyConversationUpdated } from '@/lib/api/realtime-apply';
import type { Conversation } from '@/lib/api/types';

import { orderConversations } from './filters';

/**
 * TOUTE ACTIVITÉ FAIT REMONTER LA LIGNE, POUR TOUS (#9026, directive porteur du
 * 2026-10-01, qui remplace la règle « auteur réagi seul » de #7592). Le rang
 * vient du SERVEUR (`listRankAt` = max(`lastMessageAt`, `lastActivityAt`)) :
 * `GET /conversations` le sert sur chaque ligne, et `conversation:updated` le
 * porte chez CHAQUE participant quand une réaction, un appel ou une épingle
 * survient. Clé absente = ne pas réordonner. Le client ne fabrique aucun rang :
 * il prend le max du rang servi et de `lastMessageAt`, parce qu'un message plus
 * récent fait toujours remonter la ligne.
 */
const conversation = (partial: Partial<ListConversation>): Conversation =>
  ({
    id: 'c1',
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date('2026-09-23T00:00:00.000Z'),
    updatedAt: new Date('2026-09-23T00:00:00.000Z'),
    unreadCount: 0,
    ...partial,
  }) as Conversation;

describe('le rang servi ordonne la liste', () => {
  test('une activité (listRankAt servi) passe au-dessus d’un message plus récent', () => {
    const reacted = conversation({ id: 'c-ab', lastMessageAt: new Date('2026-09-23T12:06:24.000Z'), listRankAt: '2026-09-23T12:07:24.082Z' });
    const other = conversation({ id: 'c-autre', lastMessageAt: new Date('2026-09-23T12:07:16.000Z') });
    expect(orderConversations([other, reacted], {}).map((c) => c.id)).toEqual(['c-ab', 'c-autre']);
  });

  test('sans rang servi, l’ordre reste celui de lastMessageAt', () => {
    const a = conversation({ id: 'c-ab', lastMessageAt: new Date('2026-09-23T12:06:24.000Z') });
    const other = conversation({ id: 'c-autre', lastMessageAt: new Date('2026-09-23T12:07:16.000Z') });
    expect(orderConversations([a, other], {}).map((c) => c.id)).toEqual(['c-autre', 'c-ab']);
  });

  test('un message plus récent que le rang servi l’emporte : le rang est au moins lastMessageAt', () => {
    const a = conversation({ id: 'c-ab', lastMessageAt: new Date('2026-09-23T12:09:00.000Z'), listRankAt: '2026-09-23T12:07:24.000Z' });
    const other = conversation({ id: 'c-autre', lastMessageAt: new Date('2026-09-23T12:08:00.000Z') });
    expect(orderConversations([other, a], {}).map((c) => c.id)).toEqual(['c-ab', 'c-autre']);
  });
});

describe('conversation:updated applique le rang servi, et lui seul', () => {
  const seed = (client: QueryClient, conversations: readonly Conversation[]): void => {
    client.setQueryData(CONVERSATIONS_QUERY_KEY, {
      pages: [
        {
          conversations,
          pagination: { limit: 30, offset: 0, total: conversations.length, hasMore: false },
          cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
        },
      ],
      pageParams: [undefined],
    });
  };
  const rowOf = (client: QueryClient): ListConversation | undefined =>
    client
      .getQueryData<{ readonly pages: readonly { readonly conversations: readonly ListConversation[] }[] }>(CONVERSATIONS_QUERY_KEY)
      ?.pages.flatMap((p) => p.conversations)
      .find((c) => c.id === 'c-a');
  const updated = (partial: Record<string, unknown>): ConversationUpdatedEventData =>
    ({ conversationId: 'c-a', updatedBy: { id: 'u-bob' }, updatedAt: '2026-09-23T12:07:24.082Z', ...partial }) as ConversationUpdatedEventData;

  test('l’émission d’une activité porte listRankAt : la ligne prend ce rang', () => {
    const client = new QueryClient();
    seed(client, [conversation({ id: 'c-a', lastMessageAt: '2026-09-23T12:06:24.000Z' as unknown as Date })]);
    applyConversationUpdated(client, updated({ listRankAt: '2026-09-23T12:07:24.082Z' }));
    expect(rowOf(client)?.listRankAt).toBe('2026-09-23T12:07:24.082Z');
  });

  test('le rang servi est posé tel quel, même plus bas que le précédent', () => {
    const client = new QueryClient();
    seed(client, [conversation({ id: 'c-a', lastMessageAt: '2026-09-23T12:06:24.000Z' as unknown as Date, listRankAt: '2026-09-23T12:07:24.082Z' })]);
    applyConversationUpdated(client, updated({ listRankAt: '2026-09-23T12:06:24.000Z' }));
    expect(rowOf(client)?.listRankAt).toBe('2026-09-23T12:06:24.000Z');
  });

  test('clé absente : le rang ne bouge pas', () => {
    const client = new QueryClient();
    seed(client, [conversation({ id: 'c-a', lastMessageAt: '2026-09-23T12:06:24.000Z' as unknown as Date })]);
    applyConversationUpdated(client, updated({ lastReaction: null }));
    expect(rowOf(client)?.listRankAt).toBeUndefined();
    expect(rowOf(client)?.lastMessageAt as unknown).toBe('2026-09-23T12:06:24.000Z');
  });

  const pageOf = (client: QueryClient): readonly ListConversation[] =>
    client
      .getQueryData<{ readonly pages: readonly { readonly conversations: readonly ListConversation[] }[] }>(CONVERSATIONS_QUERY_KEY)
      ?.pages.flatMap((p) => p.conversations) ?? [];

  test('#9026 — une réaction ENTRE TIERS (listRankAt servi à tous) remonte la ligne au-dessus d’un message plus récent', () => {
    const client = new QueryClient();
    seed(client, [
      conversation({ id: 'c-autre', lastMessageAt: new Date('2026-09-23T12:07:16.000Z') }),
      conversation({ id: 'c-a', lastMessageAt: new Date('2026-09-23T12:06:24.000Z') }),
    ]);
    applyConversationUpdated(
      client,
      updated({
        lastReaction: {
          emoji: '👍',
          reactorId: 'p-bob',
          reactorUserId: 'u-bob',
          reactorName: 'Bob',
          messageId: 'm-carol',
          targetSenderId: 'p-carol',
          targetSenderUserId: 'u-carol',
          createdAt: '2026-09-23T12:07:24.082Z',
          excerpt: 'Salut',
          excerptTranslations: null,
          excerptOriginalLanguage: 'fr',
          excerptProtection: null,
        },
        listRankAt: '2026-09-23T12:07:24.082Z',
      }),
    );
    expect(orderConversations(pageOf(client), {}).map((c) => c.id)).toEqual(['c-a', 'c-autre']);
  });

  test('#9026 — un appel ou une épingle (rang seul, sans réaction ni aperçu) remonte la ligne', () => {
    const client = new QueryClient();
    seed(client, [
      conversation({ id: 'c-autre', lastMessageAt: new Date('2026-09-23T12:07:16.000Z') }),
      conversation({ id: 'c-a', lastMessageAt: new Date('2026-09-23T12:06:24.000Z') }),
    ]);
    applyConversationUpdated(client, updated({ listRankAt: '2026-09-23T12:08:00.000Z' }));
    expect(orderConversations(pageOf(client), {}).map((c) => c.id)).toEqual(['c-a', 'c-autre']);
  });
});
