import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { composeConversationPreview, renderConversationPreviewText } from '@meeshy/shared/utils/conversation-preview';

import { previewInputOf } from '@/lib/view/conversation-preview-input';
import { systemRowOf, systemRowText } from '@/lib/view/message-badges';
import { localMessage, threadOf, threadPages } from '@/test-support/thread-cache';

import { CONVERSATIONS_QUERY_KEY } from './conversations';
import { messagesQueryKey } from './messages';
import { applyMessageEdited, isMessageEditedEvent } from './realtime-message-mutations';
import type { Conversation, Message } from './types';

/**
 * La ligne d'arrivées regroupées de Meeshy Global (#8565) est COMPLÉTÉE sur
 * place par le serveur : seul `message:edited` part, sans
 * `conversation:updated`. La charge porte `systemEvent` (clé, noms, compte)
 * et `isEdited: false` — la ligne de liste doit dire les nouveaux arrivants,
 * et un avis système n'est jamais « modifié ».
 */

const CONV = 'c-global';
const LINE = 'm-arrivals';

const arrivalsEvent = (names: readonly string[]) => {
  const named = names.length > 3 ? 2 : names.length;
  return {
    key: 'system.members-arrived' as const,
    params: {
      first: names[0] ?? '',
      second: named > 1 ? (names[1] ?? '') : '',
      third: named > 2 ? (names[2] ?? '') : '',
      others: names.length - named,
      count: names.length,
    },
  };
};

const arrivalsMetadata = (names: readonly string[]) => ({
  kind: 'members-arrived',
  arrivals: names.map((displayName, index) => ({ participantId: `p-${index}`, displayName })),
  count: names.length,
  windowStartedAt: '2026-09-28T09:00:00.000Z',
});

const arrivalsLine = (names: readonly string[]): Message =>
  ({
    ...localMessage({ id: LINE, conversationId: CONV, senderId: 'p-aicha', content: 'Aïcha vient d’arriver — dis-lui salut' }),
    messageType: 'system',
    messageSource: 'system',
    metadata: arrivalsMetadata(names),
    systemEvent: arrivalsEvent(names),
  }) as Message;

const completion = (names: readonly string[]): Record<string, unknown> => ({
  id: LINE,
  conversationId: CONV,
  senderId: 'u-aicha',
  content: 'repli français',
  originalLanguage: 'fr',
  messageType: 'system',
  messageSource: 'system',
  createdAt: '2026-09-28T09:00:00.000Z',
  updatedAt: '2026-09-28T09:04:00.000Z',
  isEdited: false,
  editedAt: '2026-09-28T09:04:00.000Z',
  metadata: arrivalsMetadata(names),
  systemEvent: arrivalsEvent(names),
});

const seed = (line: Message, { thread }: { readonly thread: boolean }): QueryClient => {
  const client = new QueryClient();
  if (thread) client.setQueryData(messagesQueryKey(CONV), threadPages([line]));
  const row = {
    id: CONV,
    type: 'global',
    status: 'active',
    visibility: 'public',
    isActive: true,
    memberCount: 1200,
    participants: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    unreadCount: 0,
    lastMessage: line,
    lastMessageAt: line.createdAt,
  } as unknown as Conversation;
  client.setQueryData(CONVERSATIONS_QUERY_KEY, {
    pages: [{ conversations: [row], pagination: { limit: 30, offset: 0, total: 1, hasMore: false } }],
    pageParams: [undefined],
  });
  return client;
};

const apply = (client: QueryClient, payload: Record<string, unknown>): void => {
  if (!isMessageEditedEvent(payload)) throw new Error('charge invalide');
  applyMessageEdited(client, payload);
};

const listRow = (client: QueryClient): Conversation => {
  const data = client.getQueryData<{ readonly pages: readonly { readonly conversations: readonly Conversation[] }[] }>(
    CONVERSATIONS_QUERY_KEY,
  );
  const row = data?.pages[0]?.conversations[0];
  if (row === undefined) throw new Error('ligne absente du cache');
  return row;
};

const listText = (client: QueryClient): string =>
  renderConversationPreviewText(
    composeConversationPreview(
      previewInputOf(listRow(client), { viewerId: 'u-me', language: 'fr', preferredLanguages: ['fr'], now: Date.parse('2026-09-28T09:05:00Z') }),
    ),
    'fr',
  );

describe('une ligne d’arrivées complétée met à jour la liste (#8565)', () => {
  test('la ligne de liste dit les nouveaux arrivants — clé, noms et compte', () => {
    const client = seed(arrivalsLine(['Aïcha']), { thread: false });

    apply(client, completion(['Tom', 'Léa', 'Aïcha']));

    expect(listText(client)).toContain('Tom, Léa et Aïcha viennent d’arriver');
  });

  test('au-delà de trois, deux noms et le nombre des autres', () => {
    const client = seed(arrivalsLine(['Aïcha']), { thread: false });

    apply(client, completion(['Omar', 'Tom', 'Léa', 'Aïcha']));

    expect(listText(client)).toContain('Omar, Tom et 2 autres viennent d’arriver');
  });

  test('un avis système complété n’est jamais « modifié » — ni en liste, ni dans le fil', () => {
    const client = seed(arrivalsLine(['Aïcha']), { thread: true });

    apply(client, completion(['Tom', 'Aïcha']));

    expect(listRow(client).lastMessage?.isEdited).toBe(false);
    expect(threadOf(client, CONV)?.messages.find((m) => m.id === LINE)?.isEdited).toBe(false);
  });

  test('la rangée du fil ouvert dit aussi les nouveaux arrivants', () => {
    const client = seed(arrivalsLine(['Aïcha']), { thread: true });

    apply(client, completion(['Tom', 'Léa', 'Aïcha']));

    const line = threadOf(client, CONV)?.messages.find((m) => m.id === LINE);
    const row = line === undefined ? null : systemRowOf(line);
    if (row === null) throw new Error('rangée d’arrivées attendue');
    expect(systemRowText(row, 'fr')).toBe('Tom, Léa et Aïcha viennent d’arriver — dis-leur salut');
  });

  test('une édition d’utilisateur reste « modifiée », même si sa charge tait `isEdited`', () => {
    const client = seed(localMessage({ id: LINE, conversationId: CONV, content: 'avant' }), { thread: true });
    const { isEdited: _silent, systemEvent: _none, messageType: _t, messageSource: _s, metadata: _m, ...userEdit } = completion([]);

    apply(client, { ...userEdit, content: 'après', messageType: 'text' });

    expect(listRow(client).lastMessage?.isEdited).toBe(true);
    expect(threadOf(client, CONV)?.messages.find((m) => m.id === LINE)?.isEdited).toBe(true);
  });
});
