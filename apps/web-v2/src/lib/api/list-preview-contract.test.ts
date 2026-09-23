import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { ConversationLastReaction } from '@meeshy/shared/types/conversation-preview';
import type { ConversationUpdatedEventData } from '@meeshy/shared/types/socketio-events/conversation';

import { localMessage } from '@/test-support/thread-cache';

import { CONVERSATIONS_QUERY_KEY } from './conversations';
import type { ListConversation, ListLastMessage } from './list-preview';
import { applyConversationUpdated } from './realtime-apply';
import type { Conversation } from './types';

/**
 * LE CONTRAT DE LA LIGNE (#7545) ATTEINT LE CACHE DE LISTE (#7547).
 *
 * `conversation:updated` porte désormais la dernière réaction, l'appel en
 * cours et la NATURE du dernier message (type, effets, durée d'éphémère,
 * chiffrement, transfert, événement système, synthèse d'appel, résumé des
 * pièces jointes). Le composeur partagé (#7546) les lit sur la ligne : ces
 * témoins mesurent qu'ils y ARRIVENT, sans rien composer.
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
    .getQueryData<{ readonly pages: readonly { readonly conversations: readonly ListConversation[] }[] }>(
      CONVERSATIONS_QUERY_KEY,
    )
    ?.pages.flatMap((p) => p.conversations)
    .find((c) => c.id === 'c-a');

const row = (partial: Partial<ListConversation> = {}): Conversation =>
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
    lastMessage: localMessage({ id: 'm-1', content: 'Bonjour', createdAt: '2026-09-23T09:59:00.000Z' as unknown as Date }),
    lastMessageAt: '2026-09-23T09:59:00.000Z' as unknown as Date,
    ...partial,
  }) as Conversation;

const updated = (partial: Partial<ConversationUpdatedEventData>): ConversationUpdatedEventData => ({
  conversationId: 'c-a',
  updatedBy: { id: 'u-alice' },
  updatedAt: '2026-09-23T10:00:00.000Z',
  ...partial,
});

const reaction: ConversationLastReaction = {
  emoji: '❤️',
  reactorId: 'p-alice',
  reactorUserId: 'u-alice',
  reactorName: 'Alice',
  messageId: 'm-1',
  targetSenderId: 'p-me',
  targetSenderUserId: 'u-me',
  excerpt: 'Bonjour',
  excerptOriginalLanguage: 'fr',
  excerptTranslations: null,
  excerptProtection: null,
  createdAt: '2026-09-23T09:59:59.000Z',
};

describe('lastReaction (#7545 → #7547)', () => {
  test('un événement qui ne porte QUE la réaction la pose sans toucher au groupe d’aperçu ni au rang', () => {
    const client = new QueryClient();
    seed(client, [row()]);

    applyConversationUpdated(client, updated({ lastReaction: reaction }));

    const r = rowOf(client);
    expect(r?.lastReaction).toEqual(reaction);
    expect(r?.lastMessage?.content).toBe('Bonjour');
    expect(r?.lastMessageAt as unknown).toBe('2026-09-23T09:59:00.000Z');
  });

  test('réaction à MON message : le serveur porte `lastMessageAt`, la conversation remonte', () => {
    const client = new QueryClient();
    seed(client, [row()]);

    applyConversationUpdated(client, updated({ lastReaction: reaction, lastMessageAt: '2026-09-23T09:59:59.000Z' }));

    expect(rowOf(client)?.lastMessageAt as unknown).toBe('2026-09-23T09:59:59.000Z');
    expect(rowOf(client)?.lastMessage?.id).toBe('m-1');
  });

  test('un `lastMessageAt` de réaction plus ancien que le rang ne le fait jamais reculer', () => {
    const client = new QueryClient();
    seed(client, [row()]);

    applyConversationUpdated(client, updated({ lastReaction: reaction, lastMessageAt: '2026-09-23T09:00:00.000Z' }));

    expect(rowOf(client)?.lastMessageAt as unknown).toBe('2026-09-23T09:59:00.000Z');
  });

  test('`lastReaction: null` retire la réaction ; clé absente la laisse', () => {
    const client = new QueryClient();
    seed(client, [row({ lastReaction: reaction })]);

    applyConversationUpdated(client, updated({ activeCall: null }));
    expect(rowOf(client)?.lastReaction).toEqual(reaction);

    applyConversationUpdated(client, updated({ lastReaction: null }));
    expect('lastReaction' in (rowOf(client) ?? {})).toBe(false);
  });
});

describe('activeCall (#7545 → #7547)', () => {
  test('l’appel en cours se pose, puis `null` le retire', () => {
    const client = new QueryClient();
    seed(client, [row()]);
    const call = { id: 'call-1', kind: 'audio', participantCount: 3, startedAt: '2026-09-23T09:58:00.000Z' } as const;

    applyConversationUpdated(client, updated({ activeCall: call }));
    expect(rowOf(client)?.activeCall).toEqual(call);
    expect(rowOf(client)?.lastMessage?.content).toBe('Bonjour');

    applyConversationUpdated(client, updated({ activeCall: null }));
    expect('activeCall' in (rowOf(client) ?? {})).toBe(false);
  });
});

describe('sous-groupe NATURE du dernier message (#7545 → #7547)', () => {
  const nature = {
    lastMessageType: 'system',
    lastMessageEffectFlags: 8,
    lastMessageEphemeralDuration: 300,
    lastMessageIsForwarded: true,
    lastMessageSystemEvent: { key: 'system.member-joined', params: { name: 'Bob' } },
    lastMessageCallSummary: { callId: 'call-1', kind: 'video', outcome: 'completed', durationSec: 252, initiatorId: 'u-me', endedByInitiator: false },
    lastMessageAttachmentSummary: { count: 3, kinds: { image: 3 }, totalSize: 1_468_006 },
  } as const satisfies Partial<ConversationUpdatedEventData>;

  test('un AUTRE message adopté porte sa nature', () => {
    const client = new QueryClient();
    seed(client, [row()]);

    applyConversationUpdated(client, updated({ lastMessageId: 'm-2', lastMessageAt: '2026-09-23T10:00:00.000Z', lastMessagePreview: '', ...nature }));

    const last = rowOf(client)?.lastMessage as ListLastMessage | undefined;
    expect(last?.id).toBe('m-2');
    expect(last?.messageType).toBe('system');
    expect(last?.effectFlags).toBe(8);
    expect(last?.ephemeralDuration).toBe(300);
    expect(last?.isForwarded).toBe(true);
    expect(last?.systemEvent).toEqual(nature.lastMessageSystemEvent);
    expect(last?.callSummary).toEqual(nature.lastMessageCallSummary);
    expect(last?.attachmentSummary).toEqual(nature.lastMessageAttachmentSummary);
  });

  test('le MÊME message rafraîchit sa nature — et un résumé `null` le retire', () => {
    const client = new QueryClient();
    seed(client, [row()]);
    applyConversationUpdated(client, updated({ lastMessageId: 'm-1', lastMessageAt: '2026-09-23T09:59:00.000Z', ...nature }));

    applyConversationUpdated(
      client,
      updated({ lastMessageId: 'm-1', lastMessageAt: '2026-09-23T09:59:00.000Z', lastMessageAttachmentSummary: null, lastMessageEffectFlags: 2 }),
    );

    const last = rowOf(client)?.lastMessage as ListLastMessage | undefined;
    expect(last?.effectFlags).toBe(2);
    expect('attachmentSummary' in (last ?? {})).toBe(false);
  });

  test('un message CHIFFRÉ adopté ne garde ni texte ni carte', () => {
    const client = new QueryClient();
    seed(client, [row()]);

    applyConversationUpdated(
      client,
      updated({
        lastMessageId: 'm-3',
        lastMessageAt: '2026-09-23T10:01:00.000Z',
        lastMessagePreview: 'AAECAwQ=',
        lastMessageIsEncrypted: true,
        lastMessageTranslations: { en: 'leak' },
      }),
    );

    const r = rowOf(client);
    expect(r?.lastMessage?.isEncrypted).toBe(true);
    expect(r?.lastMessage?.content).toBe('');
    expect('lastMessageTranslations' in (r ?? {})).toBe(false);
  });
});
