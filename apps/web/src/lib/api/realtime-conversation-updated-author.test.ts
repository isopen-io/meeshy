import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { ConversationUpdatedEventData } from '@meeshy/shared/types/socketio-events/conversation';
import { composeConversationPreview } from '@meeshy/shared/utils/conversation-preview';

import { previewInputOf } from '@/lib/view/conversation-preview-input';
import { localMessage } from '@/test-support/thread-cache';

import { CONVERSATIONS_QUERY_KEY } from './conversations';
import { applyConversationUpdated } from './realtime-apply';
import type { Conversation, Message } from './types';

/**
 * #7978 — la ligne de liste dit « Vous : » sur l'identité UTILISATEUR que la
 * passerelle joint à l'aperçu (`lastMessageSenderUserId`), quel que soit le
 * chemin qui l'a recalculé. `senderId` est un `Participant.id` : il ne vaut
 * jamais l'id du lecteur, et la ligne me nommait par mon nom.
 */

const VIEWER = 'u-demo';

const conv = (partial: Partial<Conversation>): Conversation =>
  ({
    id: 'c-a',
    type: 'group',
    status: 'active',
    visibility: 'private',
    isActive: true,
    memberCount: 3,
    participants: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    unreadCount: 0,
    ...partial,
  }) as Conversation;

function seed(client: QueryClient, conversation: Conversation): void {
  client.setQueryData(CONVERSATIONS_QUERY_KEY, {
    pages: [
      {
        conversations: [conversation],
        pagination: { limit: 30, offset: 0, total: 1, hasMore: false },
        cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
      },
    ],
    pageParams: [undefined],
  });
}

function row(client: QueryClient): Conversation {
  const data = client.getQueryData<{ readonly pages: readonly { readonly conversations: readonly Conversation[] }[] }>(
    CONVERSATIONS_QUERY_KEY,
  );
  const found = data?.pages[0]?.conversations[0];
  if (found === undefined) throw new Error('ligne absente du cache');
  return found;
}

function authorOf(conversation: Conversation) {
  return composeConversationPreview(
    previewInputOf(conversation, { viewerId: VIEWER, language: 'fr', preferredLanguages: ['fr'], now: Date.parse('2026-09-25T10:00:00Z') }),
  ).author;
}

const thirdPartyMessage = (): Message =>
  ({
    ...localMessage({ id: 'm-third', content: 'Oups', originalLanguage: 'fr' }),
    senderId: 'p-third',
    sender: { displayName: 'Tiers', userId: 'u-third' } as never,
  }) as Message;

const recalculated = (overrides: Partial<ConversationUpdatedEventData> = {}): ConversationUpdatedEventData => ({
  conversationId: 'c-a',
  updatedBy: { id: 'u-third' },
  updatedAt: '2026-09-25T09:10:00.000Z',
  lastMessageId: 'm-mine',
  lastMessageAt: '2026-09-25T09:00:00.000Z',
  lastMessagePreview: 'Hello everyone',
  lastMessageOriginalLanguage: 'en',
  lastMessageTranslations: { fr: 'Bonjour à tous' },
  lastMessageSenderName: 'Demo',
  lastMessageSenderUserId: VIEWER,
  senderId: 'p-demo',
  previewRecalculated: true,
  ...overrides,
});

describe('conversation:updated — « Vous » sur lastMessageSenderUserId (#7978)', () => {
  test("un tiers supprime le dernier message : le mien redevient l'aperçu et la ligne dit « Vous »", () => {
    const client = new QueryClient();
    seed(client, conv({ lastMessage: thirdPartyMessage(), lastMessageAt: new Date('2026-09-25T09:05:00.000Z') }));

    applyConversationUpdated(client, recalculated());

    expect(authorOf(row(client))?.kind).toBe('self');
  });

  test("la même projection nomme un tiers par son nom quand l'identité n'est pas la mienne", () => {
    const client = new QueryClient();
    seed(client, conv({}));

    applyConversationUpdated(client, recalculated({ lastMessageSenderName: 'Tiers', lastMessageSenderUserId: 'u-third', senderId: 'p-third' }));

    const author = authorOf(row(client));
    expect(author?.kind).toBe('member');
    expect(author?.label).toBe('Tiers');
  });

  test('la ré-émission du MÊME message (traduction) complète une ligne qui ne savait pas que c’était moi', () => {
    const client = new QueryClient();
    seed(
      client,
      conv({
        lastMessage: {
          ...localMessage({ id: 'm-mine', content: 'Hello everyone', originalLanguage: 'en' }),
          senderId: 'p-demo',
          sender: { displayName: 'Demo' } as never,
        } as Message,
        lastMessageAt: new Date('2026-09-25T09:00:00.000Z'),
      }),
    );
    expect(authorOf(row(client))?.kind).toBe('member');

    applyConversationUpdated(client, recalculated());

    expect(authorOf(row(client))?.kind).toBe('self');
  });

  test("le Prisme de la ligne n'est pas touché : l'aperçu servi reste en français", () => {
    const client = new QueryClient();
    seed(client, conv({}));

    applyConversationUpdated(client, recalculated());

    const preview = composeConversationPreview(
      previewInputOf(row(client), { viewerId: VIEWER, language: 'fr', preferredLanguages: ['fr'], now: Date.parse('2026-09-25T10:00:00Z') }),
    );
    expect(JSON.stringify(preview.segments)).toContain('Bonjour à tous');
    expect(JSON.stringify(preview.segments)).not.toContain('Hello everyone');
  });
});
