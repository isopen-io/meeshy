import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { ConversationUpdatedEventData } from '@meeshy/shared/types/socketio-events/conversation';
import { composeConversationPreview, renderConversationPreviewText } from '@meeshy/shared/utils/conversation-preview';

import { previewInputOf } from '@/lib/view/conversation-preview-input';
import { localMessage } from '@/test-support/thread-cache';

import { CONVERSATIONS_QUERY_KEY } from './conversations';
import { performDeleteForEveryone } from './delete-message';
import type { ApiResult, HttpRequest } from './http';
import { messagesQueryKey } from './messages';
import { applyConversationUpdated } from './realtime-apply';
import { applyMessageDeleted } from './realtime-message-mutations';
import type { Conversation, Message } from './types';

/**
 * #11466 — un administrateur retire le DERNIER message d'un autre membre : sa
 * ligne de liste lisait « Recette Retrait : » suivi de rien. La pierre tombale
 * optimiste (contenu vidé) restait l'aperçu tant que l'aperçu recalculé de la
 * passerelle n'arrivait pas. La ligne retombe désormais sur le dernier message
 * encore visible du fil, et, faute de fil chargé, dit « Message supprimé »
 * comme la bulle. Mesuré sur les données de la recette staging du 2026-10-20 :
 * groupe « Recette retrait modéré », Demo (créateur) retire le message de
 * Recette Retrait ; le dernier message visible est celui de Demo.
 */

const VIEWER = 'u-demo';
const NOW = new Date('2026-10-20T21:24:18.000Z');

const fromDemo = localMessage({
  id: 'm-a',
  senderId: 'p-demo',
  sender: { displayName: 'Demo', userId: VIEWER } as never,
  content: 'Message de A dans le groupe',
  createdAt: new Date('2026-10-20T21:14:40.401Z'),
});

const fromAuthor = localMessage({
  id: 'm-b',
  senderId: 'p-author',
  sender: { displayName: 'Recette Retrait', userId: 'u-author' } as never,
  content: 'Message de B à retirer depuis le web',
  createdAt: new Date('2026-10-20T21:23:24.809Z'),
});

const row = (): Conversation =>
  ({
    id: 'c-a',
    type: 'group',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date('2026-10-20T21:14:00.000Z'),
    updatedAt: new Date('2026-10-20T21:23:24.809Z'),
    unreadCount: 0,
    lastMessage: fromAuthor,
    lastMessageAt: fromAuthor.createdAt,
    lastMessageOriginalLanguage: 'fr',
  }) as Conversation;

function seed(options: { readonly thread: readonly Message[] | null }): QueryClient {
  const client = new QueryClient();
  client.setQueryData(CONVERSATIONS_QUERY_KEY, {
    pages: [
      {
        conversations: [row()],
        pagination: { limit: 30, offset: 0, total: 1, hasMore: false },
        cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
      },
    ],
    pageParams: [undefined],
  });
  if (options.thread !== null) {
    client.setQueryData(messagesQueryKey('c-a'), {
      pages: [{ messages: options.thread, hasOlder: false, nextCursor: null }],
      pageParams: [undefined],
    });
  }
  return client;
}

function listRow(client: QueryClient): Conversation {
  const data = client.getQueryData<{ readonly pages: readonly { readonly conversations: readonly Conversation[] }[] }>(
    CONVERSATIONS_QUERY_KEY,
  );
  const found = data?.pages[0]?.conversations[0];
  if (found === undefined) throw new Error('ligne absente du cache');
  return found;
}

const line = (client: QueryClient, language = 'fr'): string => {
  const input = previewInputOf(listRow(client), { viewerId: VIEWER, language, preferredLanguages: [language], now: NOW.getTime() });
  return renderConversationPreviewText(composeConversationPreview(input), language);
};

const transport = (answer: ApiResult<unknown>, during?: (request: HttpRequest) => void) => ({
  request: async <T,>(request: HttpRequest): Promise<ApiResult<T>> => {
    during?.(request);
    return answer as ApiResult<T>;
  },
});

const recalculated: ConversationUpdatedEventData = {
  conversationId: 'c-a',
  updatedBy: { id: VIEWER },
  updatedAt: '2026-10-20T21:24:18.300Z',
  lastMessageId: 'm-a',
  lastMessageAt: '2026-10-20T21:14:40.401Z',
  lastMessagePreview: 'Message de A dans le groupe',
  lastMessageOriginalLanguage: 'fr',
  lastMessageSenderName: 'Demo',
  lastMessageSenderUserId: VIEWER,
  senderId: 'p-demo',
  previewRecalculated: true,
};

describe('la ligne de liste après la suppression de son dernier message (#11466)', () => {
  test('le fil est chargé : la ligne retombe sur le dernier message encore visible, avant même la réponse', async () => {
    const client = seed({ thread: [fromDemo, fromAuthor] });
    let during = '';
    await performDeleteForEveryone({
      queryClient: client,
      conversationId: 'c-a',
      messages: [fromAuthor],
      reason: 'Hors sujet',
      now: NOW,
      transport: transport({ ok: true, data: null }, () => {
        during = line(client);
      }),
    });
    expect(during).toBe('Vous : Message de A dans le groupe');
    expect(line(client)).toBe('Vous : Message de A dans le groupe');
  });

  test('aucun fil chargé : la ligne dit « Message supprimé », jamais « Nom : » suivi de rien', () => {
    const client = seed({ thread: null });
    applyMessageDeleted(client, { messageId: 'm-b', conversationId: 'c-a' }, NOW);
    expect(line(client)).toBe('Recette Retrait : Message supprimé');
    expect(line(client, 'en')).toBe('Recette Retrait: Message deleted');
  });

  test('l’aperçu recalculé de la passerelle prend ensuite la place, quel que soit l’état optimiste', () => {
    const client = seed({ thread: null });
    applyMessageDeleted(client, { messageId: 'm-b', conversationId: 'c-a' }, NOW);
    applyConversationUpdated(client, recalculated);
    expect(line(client)).toBe('Vous : Message de A dans le groupe');
  });

  test('un message:deleted tardif ne défait pas l’aperçu recalculé', () => {
    const client = seed({ thread: [fromDemo, fromAuthor] });
    applyConversationUpdated(client, recalculated);
    applyMessageDeleted(client, { messageId: 'm-b', conversationId: 'c-a' }, NOW);
    expect(line(client)).toBe('Vous : Message de A dans le groupe');
  });

  test('un refus de la passerelle rend la ligne d’origine, même après le repli sur le message précédent', async () => {
    const client = seed({ thread: [fromDemo, fromAuthor] });
    await performDeleteForEveryone({
      queryClient: client,
      conversationId: 'c-a',
      messages: [fromAuthor],
      now: NOW,
      transport: transport({ ok: false, status: 403, error: 'FORBIDDEN' } as ApiResult<unknown>),
    });
    expect(listRow(client).lastMessage?.id).toBe('m-b');
    expect(line(client)).toBe('Recette Retrait : Message de B à retirer depuis le web');
  });

  test('accepté : la liste est relue, au cas où l’aperçu recalculé ne serait jamais arrivé', async () => {
    const client = seed({ thread: null });
    await performDeleteForEveryone({
      queryClient: client,
      conversationId: 'c-a',
      messages: [fromAuthor],
      now: NOW,
      transport: transport({ ok: true, data: null }),
    });
    expect(client.getQueryState(CONVERSATIONS_QUERY_KEY)?.isInvalidated).toBe(true);
  });

  test('accepté, mais la ligne décrivait un autre message : la liste n’est pas relue', async () => {
    const client = seed({ thread: [fromDemo, fromAuthor] });
    await performDeleteForEveryone({
      queryClient: client,
      conversationId: 'c-a',
      messages: [fromDemo],
      now: NOW,
      transport: transport({ ok: true, data: null }),
    });
    expect(client.getQueryState(CONVERSATIONS_QUERY_KEY)?.isInvalidated).toBe(false);
  });
});
