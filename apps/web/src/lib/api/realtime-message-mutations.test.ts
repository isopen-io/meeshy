import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { ConversationUpdatedEventData } from '@meeshy/shared/types/socketio-events/conversation';

import { localMessage, threadOf, threadPages } from '@/test-support/thread-cache';

import { CONVERSATIONS_QUERY_KEY } from './conversations';
import { messagesQueryKey } from './messages';
import { applyConversationUpdated } from './realtime-apply';
import {
  applyMessageDeleted,
  applyMessageEdited,
  isMessageDeletedEvent,
  isMessageEditedEvent,
} from './realtime-message-mutations';
import type { Conversation, Message } from './types';

/**
 * `message:edited` / `message:deleted` (#7926) — la passerelle les diffuse à
 * la room de la conversation (`MessageHandler`, `broadcastMessageMutation`).
 * Le fil ouvert suit sans rechargement, ET tout ce qui CITE le message :
 * les citations embarquées (`replyTo`) des autres messages du fil et la ligne
 * de liste qui le décrit. Miroir iOS : `ConversationSocketHandler` →
 * `markEdited` (texte + `isEdited` + `editedAt`, garde d'ordre sur
 * `editedAt`) et `markDeleted` (pierre tombale : `deletedAt`, contenu vidé ;
 * une vue unique est scellée « déjà ouverte », jamais une pierre tombale).
 */

const EDITED_AT = '2026-09-25T10:05:00.000Z';

const seeded = (messages: readonly Message[], conversationId = 'c-a'): QueryClient => {
  const client = new QueryClient();
  client.setQueryData(messagesQueryKey(conversationId), threadPages(messages));
  return client;
};

const seedList = (client: QueryClient, conversations: readonly Conversation[]): void => {
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

const listRow = (client: QueryClient, id = 'c-a'): Conversation | undefined =>
  client
    .getQueryData<{ readonly pages: readonly { readonly conversations: readonly Conversation[] }[] }>(
      CONVERSATIONS_QUERY_KEY,
    )
    ?.pages.flatMap((p) => p.conversations)
    .find((c) => c.id === id);

const conv = (partial: Partial<Conversation>): Conversation =>
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
    ...partial,
  }) as Conversation;

const original = (partial: Partial<Message> = {}): Message =>
  localMessage({
    id: 'm-1',
    senderId: 'u-other',
    content: 'Rendez-vous à 9h',
    originalLanguage: 'fr',
    translations: [{ targetLanguage: 'en', translatedContent: 'Meeting at 9' } as unknown as Message['translations'][number]],
    reactionSummary: { '👍': 2 },
    ...partial,
  });

const edited = (partial: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'm-1',
  conversationId: 'c-a',
  senderId: 'u-other',
  content: 'Rendez-vous à 10h',
  originalLanguage: 'fr',
  messageType: 'text',
  createdAt: '2026-09-12T09:00:00.000Z',
  updatedAt: EDITED_AT,
  isEdited: true,
  editedAt: EDITED_AT,
  translations: [],
  ...partial,
});

const deleted = (partial: Record<string, unknown> = {}): Record<string, unknown> => ({
  messageId: 'm-1',
  conversationId: 'c-a',
  ...partial,
});

const editWith = (client: QueryClient, payload: Record<string, unknown>): void => {
  if (!isMessageEditedEvent(payload)) throw new Error('charge invalide');
  applyMessageEdited(client, payload);
};

const deleteWith = (client: QueryClient, payload: Record<string, unknown>, now = new Date(EDITED_AT)): void => {
  if (!isMessageDeletedEvent(payload)) throw new Error('charge invalide');
  applyMessageDeleted(client, payload, now);
};

const rowOf = (client: QueryClient, id = 'm-1', conversationId = 'c-a'): Message | undefined =>
  threadOf(client, conversationId)?.messages.find((m) => m.id === id);

const reply = (quoted: Message, partial: Partial<Message> = {}): Message =>
  localMessage({ id: 'm-reply', senderId: 'u-viewer', content: 'Ok', replyToId: quoted.id, replyTo: quoted, ...partial });

describe('gardes de forme — fail-closed', () => {
  test('les charges servies passent', () => {
    expect(isMessageEditedEvent(edited())).toBe(true);
    expect(isMessageDeletedEvent(deleted())).toBe(true);
  });

  test('une charge qui ne nomme pas son message ou sa conversation est rejetée', () => {
    expect(isMessageEditedEvent(edited({ conversationId: undefined }))).toBe(false);
    expect(isMessageEditedEvent(edited({ content: 42 }))).toBe(false);
    expect(isMessageDeletedEvent(deleted({ messageId: undefined }))).toBe(false);
    expect(isMessageDeletedEvent(deleted({ conversationId: null }))).toBe(false);
    expect(isMessageDeletedEvent(null)).toBe(false);
  });
});

describe('message:edited — le fil suit le texte modifié', () => {
  test('le texte, la marque « modifié » et son heure se posent ; les traductions PÉRIMÉES partent', () => {
    const client = seeded([original()]);

    editWith(client, edited());

    const row = rowOf(client);
    expect(row?.content).toBe('Rendez-vous à 10h');
    expect(row?.isEdited).toBe(true);
    expect(String(row?.editedAt)).toBe(EDITED_AT);
    expect(row?.translations).toEqual([]);
  });

  test('ce que l’édition ne touche pas reste : réactions, expéditeur, horloge de création', () => {
    const client = seeded([original()]);

    editWith(client, edited());

    const row = rowOf(client);
    expect(row?.reactionSummary).toEqual({ '👍': 2 });
    expect(row?.senderId).toBe('u-other');
    expect(String(row?.createdAt)).toBe(String(original().createdAt));
  });

  test('une traduction déjà servie avec l’édition est gardée', () => {
    const client = seeded([original()]);
    const fresh = [{ targetLanguage: 'en', translatedContent: 'Meeting at 10' }];

    editWith(client, edited({ translations: fresh }));

    expect(rowOf(client)?.translations).toEqual(fresh as unknown as Message['translations']);
  });

  test('une édition PLUS ANCIENNE que celle en place (livraison dans le désordre) est ignorée', () => {
    const client = seeded([original({ content: 'Rendez-vous à 11h', isEdited: true, editedAt: '2026-09-25T10:10:00.000Z' as unknown as Date })]);

    editWith(client, edited());

    expect(rowOf(client)?.content).toBe('Rendez-vous à 11h');
  });

  test('le voisin garde sa référence', () => {
    const neighbour = localMessage({ id: 'm-2' });
    const client = seeded([original(), neighbour]);

    editWith(client, edited());

    expect(rowOf(client, 'm-2')).toBe(neighbour);
  });

  test('la citation embarquée d’un AUTRE message suit l’édition', () => {
    const client = seeded([original(), reply(original())]);

    editWith(client, edited());

    const quote = rowOf(client, 'm-reply')?.replyTo;
    expect(quote?.content).toBe('Rendez-vous à 10h');
    expect(quote?.translations).toEqual([]);
  });

  test('la citation suit MÊME si le message cité n’est pas dans la fenêtre chargée', () => {
    const client = seeded([reply(original())]);

    editWith(client, edited());

    expect(rowOf(client, 'm-reply')?.replyTo?.content).toBe('Rendez-vous à 10h');
  });

  test('une citation PROTÉGÉE garde son placeholder — le texte en clair n’y entre jamais', () => {
    const client = seeded([reply(original({ isViewOnce: true, content: '👁️' }))]);

    editWith(client, edited());

    expect(rowOf(client, 'm-reply')?.replyTo?.content).toBe('👁️');
  });

  test('la ligne de liste qui décrit ce message suit, sans sa carte périmée', () => {
    const client = seeded([original()]);
    seedList(client, [
      conv({ lastMessage: original(), lastMessageAt: original().createdAt, lastMessageTranslations: { en: 'Meeting at 9' } }),
    ]);

    editWith(client, edited());

    const row = listRow(client);
    expect(row?.lastMessage?.content).toBe('Rendez-vous à 10h');
    expect(row?.lastMessage?.isEdited).toBe(true);
    expect(row?.lastMessageTranslations).toBeUndefined();
  });

  test('une ligne qui décrit un AUTRE message ne bouge pas', () => {
    const client = seeded([original()]);
    const other = localMessage({ id: 'm-9', content: 'plus récent' });
    seedList(client, [conv({ lastMessage: other, lastMessageTranslations: { en: 'newer' } })]);

    editWith(client, edited());

    expect(listRow(client)?.lastMessage?.content).toBe('plus récent');
    expect(listRow(client)?.lastMessageTranslations).toEqual({ en: 'newer' });
  });
});

describe('message:deleted — la bulle devient « Message supprimé », comme sur iOS', () => {
  test('pierre tombale : `deletedAt` posé, texte, traductions et pièces jointes retirés', () => {
    const client = seeded([
      original({ attachments: [{ id: 'a-1', fileUrl: 'https://cdn.example/p.png' } as unknown as NonNullable<Message['attachments']>[number]] }),
    ]);

    deleteWith(client, deleted());

    const row = rowOf(client);
    expect(row?.deletedAt).toBeDefined();
    expect(row?.content).toBe('');
    expect(row?.translations).toEqual([]);
    expect(row?.attachments ?? []).toEqual([]);
  });

  test('une vue unique est scellée « déjà ouverte », jamais transformée en pierre tombale', () => {
    const client = seeded([original({ isViewOnce: true })]);

    deleteWith(client, deleted());

    const row = rowOf(client);
    expect(row?.deletedAt).toBeUndefined();
    expect(row?.isFullyConsumed).toBe(true);
    expect(row?.content).toBe('');
  });

  test('la citation embarquée d’un autre message perd le texte supprimé', () => {
    const client = seeded([original(), reply(original())]);

    deleteWith(client, deleted());

    const quote = rowOf(client, 'm-reply')?.replyTo;
    expect(quote?.deletedAt).toBeDefined();
    expect(quote?.content).toBe('');
    expect(quote?.translations).toEqual([]);
  });

  test('la ligne de liste ne garde pas le texte supprimé, puis adopte l’aperçu recalculé par la passerelle', () => {
    const client = seeded([original()]);
    seedList(client, [
      conv({ lastMessage: original(), lastMessageAt: original().createdAt, lastMessageTranslations: { en: 'Meeting at 9' } }),
    ]);

    deleteWith(client, deleted());

    expect(listRow(client)?.lastMessage?.content).toBe('');
    expect(listRow(client)?.lastMessageTranslations).toBeUndefined();

    applyConversationUpdated(client, {
      conversationId: 'c-a',
      lastMessageId: 'm-0',
      lastMessageAt: '2026-09-12T08:00:00.000Z',
      lastMessagePreview: 'Bonjour',
      previewRecalculated: true,
    } as unknown as ConversationUpdatedEventData);

    expect(listRow(client)?.lastMessage?.id).toBe('m-0');
    expect(listRow(client)?.lastMessage?.content).toBe('Bonjour');
  });
});

describe('aucune fuite inter-conversation', () => {
  test('un événement qui nomme une AUTRE conversation ne touche pas le message de même id ailleurs', () => {
    const client = seeded([original(), reply(original())], 'c-a');
    seedList(client, [conv({ lastMessage: original() })]);

    editWith(client, edited({ conversationId: 'c-b' }));
    deleteWith(client, deleted({ conversationId: 'c-b' }));

    expect(rowOf(client)?.content).toBe('Rendez-vous à 9h');
    expect(rowOf(client)?.deletedAt).toBeUndefined();
    expect(rowOf(client, 'm-reply')?.replyTo?.content).toBe('Rendez-vous à 9h');
    expect(listRow(client)?.lastMessage?.content).toBe('Rendez-vous à 9h');
  });

  test('un message rangé sous la bonne clé mais qui se DIT d’une autre conversation n’est pas touché', () => {
    const client = seeded([original({ conversationId: 'c-z' })], 'c-a');

    editWith(client, edited());
    deleteWith(client, deleted());

    expect(rowOf(client)?.content).toBe('Rendez-vous à 9h');
    expect(rowOf(client)?.deletedAt).toBeUndefined();
  });

  test('fil fermé : rien n’est fabriqué', () => {
    const client = new QueryClient();

    editWith(client, edited());
    deleteWith(client, deleted());

    expect(threadOf(client, 'c-a')).toBeUndefined();
  });
});
