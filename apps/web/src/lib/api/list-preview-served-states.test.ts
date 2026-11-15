import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { ConversationUpdatedEventData } from '@meeshy/shared/types/socketio-events/conversation';
import { composeConversationPreview, renderConversationPreviewText } from '@meeshy/shared/utils/conversation-preview';

import { previewInputOf } from '@/lib/view/conversation-preview-input';
import { localMessage } from '@/test-support/thread-cache';

import { CONVERSATIONS_QUERY_KEY } from './conversations';
import type { ListConversation } from './list-preview';
import { applyConversationUpdated } from './realtime-apply';
import type { Conversation } from './types';

/**
 * CE QUE LA PASSERELLE SERT SUR `conversation:updated` ARRIVE AU PIXEL (#7671).
 *
 * Sticker, position et « vue unique déjà ouverte » voyagent sur la charge
 * (`lastMessageSticker`, `location`, `lastMessageViewOnceConsumed`). Ces
 * témoins passent la ligne mise à jour au composeur partagé et lisent le
 * TEXTE rendu : une clé qui n'atteint pas la ligne ne peut pas y apparaître.
 */

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

const row = (): Conversation =>
  ({
    id: 'c-a',
    type: 'direct',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 2,
    participants: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    unreadCount: 0,
    lastMessage: localMessage({ id: 'm-1', content: 'Bonjour', createdAt: '2026-09-23T09:59:00.000Z' as unknown as Date }),
    lastMessageAt: '2026-09-23T09:59:00.000Z' as unknown as Date,
  }) as Conversation;

const updated = (partial: Partial<ConversationUpdatedEventData>): ConversationUpdatedEventData => ({
  conversationId: 'c-a',
  updatedBy: { id: 'u-alice' },
  updatedAt: '2026-09-23T10:00:00.000Z',
  lastMessageId: 'm-2',
  lastMessageAt: '2026-09-23T10:00:00.000Z',
  senderId: 'p-alice',
  ...partial,
});

const lineAfter = (event: ConversationUpdatedEventData): string => {
  const client = new QueryClient();
  seed(client, [row()]);
  applyConversationUpdated(client, event);
  const c = rowOf(client) as Conversation;
  const context = { viewerId: 'u-me', language: 'fr', preferredLanguages: ['fr'], now: Date.parse('2026-09-23T10:00:05.000Z') };
  return renderConversationPreviewText(composeConversationPreview(previewInputOf(c, context)), context.language);
};

describe('la ligne adoptée par `conversation:updated` rend ce que la passerelle sert (#7671)', () => {
  test('un sticker se lit « 🏷 … », jamais « 📷 Photo »', () => {
    const text = lineAfter(
      updated({
        lastMessagePreview: '',
        lastMessageSticker: { templateId: 'tpl-hello' },
        lastMessageAttachments: [
          { id: 'a-1', mimeType: 'image/png', alt: 'Bonjour à tous' },
        ] as unknown as NonNullable<ConversationUpdatedEventData['lastMessageAttachments']>,
      }),
    );
    expect(text).toContain('🏷');
    expect(text).toContain('Bonjour à tous');
    expect(text).not.toContain('📷');
  });

  test('une position se lit « 📍 Position · lieu »', () => {
    const text = lineAfter(updated({ lastMessagePreview: '', location: { name: 'Gare du Nord', latitude: 48.88, longitude: 2.35 } }));
    expect(text).toContain('📍');
    expect(text).toContain('Gare du Nord');
  });

  test('une vue unique que j’ai ouverte se lit « 👁 Ouvert »', () => {
    const text = lineAfter(updated({ lastMessagePreview: '', lastMessageIsViewOnce: true, lastMessageViewOnceConsumed: true }));
    expect(text).toContain('👁 Ouvert');
  });

  test('une vue unique que je n’ai pas ouverte ne se lit pas « Ouvert »', () => {
    const text = lineAfter(updated({ lastMessagePreview: '', lastMessageIsViewOnce: true, lastMessageViewOnceConsumed: false }));
    expect(text).not.toContain('Ouvert');
  });
});
