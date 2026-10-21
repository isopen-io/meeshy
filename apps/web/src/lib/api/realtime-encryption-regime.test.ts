import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { ConversationUpdatedEventData } from '@meeshy/shared/types/socketio-events/conversation';
import type { SocketIOMessage } from '@meeshy/shared/types/socketio-events/message';

import { message } from './fixtures-base';
import { createOutboxStore } from '@/lib/send/outbox-store';

import { CONVERSATIONS_QUERY_KEY, conversationQueryKey, findCachedConversation } from './conversations';
import { applyConversationUpdated, applyMessageNew } from './realtime-apply';
import { encryptionAnnounced, regimeAfterNotices } from './realtime-encryption-regime';
import type { Conversation, Message } from './types';

/**
 * #11373 — LE WEB VOIT QU'UNE CONVERSATION PASSE EN BOUT EN BOUT SANS
 * RECHARGER. Bob active le chiffrement sur iOS : la passerelle n'annonce que
 * l'avis système `encryption-enabled`. Le cache web (liste ET détail) en
 * déduit le régime, fermé par défaut, et relit le détail pour la vérité.
 */

const conv = (partial: Partial<Conversation> = {}): Conversation =>
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
    encryptionMode: null,
    ...partial,
  }) as Conversation;

const seeded = (row: Conversation = conv()): QueryClient => {
  const client = new QueryClient();
  client.setQueryData(CONVERSATIONS_QUERY_KEY, {
    pages: [{ conversations: [row], pagination: { limit: 30, offset: 0, total: 1, hasMore: false }, cursorPagination: { limit: 30, hasMore: false, nextCursor: null } }],
    pageParams: [undefined],
  });
  client.setQueryData(conversationQueryKey(row.id), row);
  return client;
};

const notice = (partial: Partial<SocketIOMessage> = {}): SocketIOMessage => ({
  id: 'm-notice',
  conversationId: 'c-a',
  senderId: 'p-bob',
  content: '🔒 End-to-end encryption enabled. Messages are now fully encrypted.',
  originalLanguage: 'en',
  messageType: 'system',
  createdAt: '2026-10-21T09:00:00.000Z' as unknown as Date,
  systemEvent: { key: 'system.encryption-enabled', params: { mode: 'e2ee' } },
  ...partial,
});

const detailOf = (client: QueryClient): Conversation | undefined => client.getQueryData<Conversation>(conversationQueryKey('c-a'));
const detailInvalidated = (client: QueryClient): boolean => client.getQueryState(conversationQueryKey('c-a'))?.isInvalidated === true;

describe('message:new — l’avis système ferme le régime dans la liste ET le détail', () => {
  test('l’avis localisable (`systemEvent`) pose `e2ee` sur les deux caches et relit le détail', () => {
    const client = seeded();
    applyMessageNew(client, createOutboxStore(), notice());
    expect(findCachedConversation(client, 'c-a')?.encryptionMode).toBe('e2ee');
    expect(detailOf(client)?.encryptionMode).toBe('e2ee');
    expect(detailInvalidated(client)).toBe(true);
  });

  test('l’avis porté par `metadata` (forme REST/ZMQ) a le même effet', () => {
    const client = seeded();
    applyMessageNew(client, createOutboxStore(), notice({ systemEvent: undefined, metadata: { kind: 'encryption-enabled', mode: 'e2ee' } }));
    expect(detailOf(client)?.encryptionMode).toBe('e2ee');
  });

  test('un mode absent ou illisible se lit comme du bout en bout — fermé par défaut', () => {
    const client = seeded();
    applyMessageNew(client, createOutboxStore(), notice({ systemEvent: { key: 'system.encryption-enabled', params: {} } }));
    expect(detailOf(client)?.encryptionMode).toBe('e2ee');
  });

  test('un message ordinaire ne touche ni au régime ni au détail', () => {
    const client = seeded();
    applyMessageNew(client, createOutboxStore(), notice({ messageType: 'text', systemEvent: undefined, content: 'salut' }));
    expect(detailOf(client)?.encryptionMode).toBeNull();
    expect(detailInvalidated(client)).toBe(false);
  });

  test('un texte d’utilisateur qui imite l’avis n’est pas un avis : seul un message SYSTÈME annonce', () => {
    expect(encryptionAnnounced({ messageType: 'text', metadata: { kind: 'encryption-enabled', mode: 'e2ee' } })).toBeNull();
  });

  test('un régime déjà fermé ne se rouvre jamais par un avis plus faible', () => {
    const client = seeded(conv({ encryptionMode: 'e2ee' }));
    applyMessageNew(client, createOutboxStore(), notice({ systemEvent: { key: 'system.encryption-enabled', params: { mode: 'server' } } }));
    expect(detailOf(client)?.encryptionMode).toBe('e2ee');
    expect(findCachedConversation(client, 'c-a')?.encryptionMode).toBe('e2ee');
  });
});

describe('conversation:updated — l’avis voyage aussi par la ligne de liste', () => {
  const updated = (partial: Partial<ConversationUpdatedEventData> = {}): ConversationUpdatedEventData =>
    ({
      conversationId: 'c-a',
      updatedAt: '2026-10-21T09:00:00.000Z',
      updatedBy: { id: 'u-bob' },
      lastMessageId: 'm-notice',
      lastMessageAt: '2026-10-21T09:00:00.000Z',
      lastMessageSystemEvent: { key: 'system.encryption-enabled', params: { mode: 'e2ee' } },
      ...partial,
    }) as ConversationUpdatedEventData;

  test('`lastMessageSystemEvent` d’activation ferme le régime et relit le détail', () => {
    const client = seeded();
    applyConversationUpdated(client, updated());
    expect(findCachedConversation(client, 'c-a')?.encryptionMode).toBe('e2ee');
    expect(detailOf(client)?.encryptionMode).toBe('e2ee');
    expect(detailInvalidated(client)).toBe(true);
  });

  test('la même ligne relue, régime déjà fermé : aucune relecture de plus', () => {
    const client = seeded(conv({ encryptionMode: 'e2ee' }));
    applyConversationUpdated(client, updated());
    expect(detailInvalidated(client)).toBe(false);
  });
});

describe('regimeAfterNotices — le fil chargé par REST dit aussi le régime', () => {
  const row = (partial: Partial<Message>): Message =>
    message({ id: 'm-1', conversationId: 'c-a', senderId: 'p-bob', content: 'avant', originalLanguage: 'fr', createdAt: new Date('2026-10-21T08:00:00.000Z'), ...partial });
  const thread = [row({}), row({ id: 'm-2', messageType: 'system', content: '🔒', metadata: { kind: 'encryption-enabled', mode: 'e2ee' } })];

  test('une conversation servie en clair mais dont le fil porte l’avis est jugée chiffrée', () => {
    expect(regimeAfterNotices(null, thread)).toBe('e2ee');
  });

  test('sans avis, le régime servi reste', () => {
    expect(regimeAfterNotices(null, thread.slice(0, 1))).toBeNull();
    expect(regimeAfterNotices('server', thread.slice(0, 1))).toBe('server');
  });

  test('un régime fermé ne se rouvre pas', () => {
    expect(regimeAfterNotices('e2ee', [row({ id: 'm-3', messageType: 'system', content: '', metadata: { kind: 'encryption-enabled', mode: 'server' } })])).toBe('e2ee');
  });
});
