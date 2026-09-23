import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { ConversationUpdatedEventData } from '@meeshy/shared/types/socketio-events/conversation';
import type { SocketIOMessage } from '@meeshy/shared/types/socketio-events/message';

import { createHttpTransport } from '@/lib/api/http';
import { createOutboxStore } from '@/lib/send/outbox-store';
import { performSend, type SendDeps } from '@/lib/send/perform-send';
import { previewKindOf } from '@/lib/view/conversation';
import { localMessage, threadOf, threadPages } from '@/test-support/thread-cache';

import { CONVERSATIONS_QUERY_KEY } from './conversations';
import { messagesQueryKey } from './messages';
import { applyConversationUpdated, applyMessageNew, applyMessageTranslation } from './realtime-apply';
import { applyMessageExpired } from './realtime-ephemeral';
import type { Conversation, Message } from './types';

/**
 * LA LIGNE DE LISTE DIT TOUJOURS CE QUI VIENT DE SE PASSER (#7547, étape 1).
 *
 * Quatre chemins écrivent le dernier message d'une ligne — `message:new`,
 * `conversation:updated`, `message:translation`, l'envoi (optimiste puis
 * accusé) — et `message:expired` le périme. Ces témoins mesurent ce que la
 * ligne GARDE, jamais comment elle le garde :
 *  - un événement plus ANCIEN que l'aperçu en place ne le remplace jamais ;
 *  - un événement sur le MÊME message rafraîchit tout le groupe ;
 *  - mon envoi apparaît dans la ligne avant tout accusé ;
 *  - aucun texte protégé ne se garde dans le cache de liste (persisté).
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

const rowOf = (client: QueryClient, id = 'c-a'): Conversation | undefined =>
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

const known = (partial: Partial<Message> = {}): Message =>
  localMessage({ id: 'm-new', senderId: 'u-other', content: 'le plus récent', createdAt: '2026-09-12T10:00:00.000Z' as unknown as Date, ...partial });

const rowWith = (message: Message, extra: Partial<Conversation> = {}): Conversation =>
  conv({ lastMessage: message, lastMessageAt: message.createdAt, lastMessageOriginalLanguage: 'fr', ...extra });

const socketMessage = (partial: Partial<SocketIOMessage>): SocketIOMessage => ({
  id: 'm-old',
  conversationId: 'c-a',
  senderId: 'u-other',
  content: 'un message plus ancien',
  originalLanguage: 'fr',
  messageType: 'text',
  createdAt: '2026-09-12T09:00:00.000Z' as unknown as Date,
  ...partial,
});

const updated = (partial: Partial<ConversationUpdatedEventData>): ConversationUpdatedEventData => ({
  conversationId: 'c-a',
  updatedBy: { id: 'u-other' },
  updatedAt: '2026-09-12T10:05:00.000Z',
  ...partial,
});

describe('message:new — la garde d’ordre (#7547)', () => {
  test('un `message:new` PLUS ANCIEN que l’aperçu en place ne le remplace JAMAIS', () => {
    const client = new QueryClient();
    seed(client, [rowWith(known(), { lastMessageTranslations: { en: 'the newest' } })]);

    applyMessageNew(client, createOutboxStore(), socketMessage({}));

    const row = rowOf(client);
    expect(row?.lastMessage?.id).toBe('m-new');
    expect(row?.lastMessage?.content).toBe('le plus récent');
    expect(row?.lastMessageAt as unknown).toBe('2026-09-12T10:00:00.000Z');
    expect(row?.lastMessageTranslations).toEqual({ en: 'the newest' });
  });

  test('il entre quand même dans le fil ouvert — la garde ne vaut que pour la LIGNE', () => {
    const client = new QueryClient();
    seed(client, [rowWith(known())]);
    client.setQueryData(messagesQueryKey('c-a'), threadPages([]));

    applyMessageNew(client, createOutboxStore(), socketMessage({}));

    expect(threadOf(client, 'c-a')?.messages.map((m) => m.id)).toEqual(['m-old']);
  });

  test('un message PLUS RÉCENT remplace, même quand l’aperçu en place est mon optimiste daté par une horloge en avance', () => {
    const client = new QueryClient();
    const mine = localMessage({
      id: 'cid-1',
      clientMessageId: 'cid-1',
      senderId: 'u-viewer',
      createdAt: '2026-09-12T11:00:00.000Z' as unknown as Date,
    } as Partial<Message> & { clientMessageId: string });
    seed(client, [rowWith(mine)]);

    applyMessageNew(client, createOutboxStore(), socketMessage({ id: 'm-peer', createdAt: '2026-09-12T10:59:58.000Z' as unknown as Date }));

    expect(rowOf(client)?.lastMessage?.id).toBe('m-peer');
  });

  test('l’écho de MON envoi (même clientMessageId) promeut la ligne, quelle que soit l’heure', () => {
    const client = new QueryClient();
    const mine = localMessage({
      id: 'cid-1',
      clientMessageId: 'cid-1',
      createdAt: '2026-09-12T11:00:00.000Z' as unknown as Date,
    } as Partial<Message> & { clientMessageId: string });
    seed(client, [rowWith(mine)]);

    applyMessageNew(
      client,
      createOutboxStore(),
      socketMessage({ id: 'm-server', clientMessageId: 'cid-1', createdAt: '2026-09-12T10:59:59.000Z' as unknown as Date }),
    );

    expect(rowOf(client)?.lastMessage?.id).toBe('m-server');
  });
});

describe('message:new — aucun texte protégé dans le cache de liste (#7547)', () => {
  for (const [label, flags] of [
    ['vue unique', { isViewOnce: true }],
    ['flouté', { isBlurred: true }],
    ['chiffré', { isEncrypted: true }],
  ] as const) {
    test(`${label} : la ligne garde l’identité et le drapeau, jamais le texte, la carte ni les pièces`, () => {
      const client = new QueryClient();
      seed(client, [conv({})]);
      client.setQueryData(messagesQueryKey('c-a'), threadPages([]));

      applyMessageNew(
        client,
        createOutboxStore(),
        socketMessage({
          id: 'm-secret',
          createdAt: '2026-09-12T12:00:00.000Z' as unknown as Date,
          content: 'le secret',
          ...flags,
          translations: [
            {
              id: 't1',
              messageId: 'm-secret',
              sourceLanguage: 'fr',
              targetLanguage: 'en',
              translatedContent: 'the secret',
              translationModel: 'nllb',
              cacheKey: 'k',
              cached: false,
            },
          ] as unknown as SocketIOMessage['translations'],
          attachments: [{ id: 'a1', mimeType: 'image/png', fileUrl: 'https://x/secret.png' }] as unknown as SocketIOMessage['attachments'],
        }),
      );

      const row = rowOf(client);
      expect(row?.lastMessage?.id).toBe('m-secret');
      expect(row?.lastMessage?.content).toBe('');
      expect(row?.lastMessage?.translations).toEqual([]);
      expect(row?.lastMessage?.attachments).toBeUndefined();
      expect('lastMessageTranslations' in (row ?? {})).toBe(false);
      expect(JSON.stringify(row)).not.toContain('secret.png');
      expect(JSON.stringify(row)).not.toContain('le secret');
      /* Le fil, lui, garde le message ENTIER : c'est là qu'il s'ouvre. */
      expect(threadOf(client, 'c-a')?.messages[0]?.content).toBe('le secret');
    });
  }

  test('un éphémère ENCORE ACTIF garde son texte : il reste lisible jusqu’à son échéance', () => {
    const client = new QueryClient();
    seed(client, [conv({})]);

    applyMessageNew(
      client,
      createOutboxStore(),
      socketMessage({ id: 'm-eph', content: 'lis-moi vite', ephemeralDuration: 240, createdAt: '2026-09-12T12:00:00.000Z' as unknown as Date }),
    );

    const row = rowOf(client);
    expect(row?.lastMessage?.content).toBe('lis-moi vite');
    expect(row?.lastMessage?.ephemeralDuration).toBe(240);
  });
});

describe('conversation:updated — garde d’ordre AVANT l’adoption (#7547)', () => {
  test('un AUTRE message plus ancien, sans `previewRecalculated` : TOUT le groupe est jeté', () => {
    const client = new QueryClient();
    seed(client, [rowWith(known(), { lastMessageTranslations: { en: 'the newest' } })]);

    applyConversationUpdated(
      client,
      updated({
        lastMessageId: 'm-old',
        lastMessageAt: '2026-09-12T09:00:00.000Z',
        lastMessagePreview: 'périmé',
        lastMessageTranslations: null,
        lastMessageOriginalLanguage: 'fr',
      }),
    );

    const row = rowOf(client);
    expect(row?.lastMessage?.id).toBe('m-new');
    expect(row?.lastMessage?.content).toBe('le plus récent');
    expect(row?.lastMessageTranslations).toEqual({ en: 'the newest' });
  });

  test('`previewRecalculated` (suppression pour tous) fait revenir au message PRÉCÉDENT', () => {
    const client = new QueryClient();
    seed(client, [rowWith(known())]);

    applyConversationUpdated(
      client,
      updated({ lastMessageId: 'm-old', lastMessageAt: '2026-09-12T09:00:00.000Z', lastMessagePreview: 'le précédent', previewRecalculated: true }),
    );

    expect(rowOf(client)?.lastMessage?.id).toBe('m-old');
    expect(rowOf(client)?.lastMessage?.content).toBe('le précédent');
  });
});

describe('conversation:updated — le MÊME message rafraîchit tout le groupe (#7547)', () => {
  test('texte, pièces jointes et effets suivent — pas seulement le texte', () => {
    const client = new QueryClient();
    seed(client, [rowWith(known({ content: 'avant', effectFlags: 4 }))]);

    applyConversationUpdated(
      client,
      updated({
        lastMessageId: 'm-new',
        lastMessageAt: '2026-09-12T10:00:00.000Z',
        lastMessagePreview: 'après',
        lastMessageAttachments: [
          { id: 'a1', mimeType: 'audio/webm', thumbnailUrl: null, originalName: 'voix.webm', fileSize: 48_000, duration: 12_000, width: null, height: null },
        ],
        lastMessageAttachmentCount: 1,
        lastMessageExpiresAt: '2026-09-12T10:04:00.000Z',
      }),
    );

    const last = rowOf(client)?.lastMessage;
    expect(last?.content).toBe('après');
    expect(last?.attachments?.map((a) => a.id)).toEqual(['a1']);
    expect(last?.expiresAt as unknown).toBe('2026-09-12T10:04:00.000Z');
    /* Ce que le contrat ne transporte pas (les effets décoratifs) reste. */
    expect(last?.effectFlags).toBe(4);
  });

  test('le message devient flouté : son texte et ses pièces quittent la ligne', () => {
    const client = new QueryClient();
    seed(client, [rowWith(known({ content: 'visible' }), { lastMessageTranslations: { en: 'visible' } })]);

    applyConversationUpdated(
      client,
      updated({ lastMessageId: 'm-new', lastMessageAt: '2026-09-12T10:00:00.000Z', lastMessagePreview: 'visible', lastMessageIsBlurred: true }),
    );

    const row = rowOf(client);
    expect(row?.lastMessage?.isBlurred).toBe(true);
    expect(row?.lastMessage?.content).toBe('');
    expect('lastMessageTranslations' in (row ?? {})).toBe(false);
  });
});

describe('message:translation — la ligne suit sans que le fil soit ouvert (#7547)', () => {
  const translation = (messageId: string) => ({
    messageId,
    translations: [
      {
        id: 't1',
        messageId,
        sourceLanguage: 'fr',
        targetLanguage: 'en',
        translatedContent: 'the newest',
        translationModel: 'nllb',
        cacheKey: 'k',
        cached: false,
      },
    ],
  });

  test('le fil n’est pas en cache : la carte de la ligne reçoit quand même la traduction', () => {
    const client = new QueryClient();
    seed(client, [rowWith(known())]);

    applyMessageTranslation(client, translation('m-new') as never);

    expect(rowOf(client)?.lastMessageTranslations).toEqual({ en: 'the newest' });
  });

  test('un dernier message PROTÉGÉ ne reçoit jamais de carte', () => {
    const client = new QueryClient();
    seed(client, [rowWith(known({ isViewOnce: true, content: '' }))]);

    applyMessageTranslation(client, translation('m-new') as never);

    expect('lastMessageTranslations' in (rowOf(client) ?? {})).toBe(false);
  });
});

describe('message:expired — la ligne passe seule à « expiré » (#7547)', () => {
  test('sans autre événement : la ligne perd son texte et sa carte et se lit « expiré »', () => {
    const client = new QueryClient();
    seed(client, [rowWith(known({ content: 'éphémère', ephemeralDuration: 60 }), { lastMessageTranslations: { en: 'ephemeral' } })]);
    const scheduled: (() => void)[] = [];

    applyMessageExpired(client, { messageId: 'm-new', conversationId: 'c-a' }, (fn) => {
      scheduled.push(fn);
    });

    const row = rowOf(client);
    expect(row?.lastMessage?.content).toBe('');
    expect('lastMessageTranslations' in (row ?? {})).toBe(false);
    expect(previewKindOf(row as Conversation)).toBe('expired');
    /* Le rang ne bouge pas : un message qui expire ne remonte rien. */
    expect(row?.lastMessageAt as unknown).toBe('2026-09-12T10:00:00.000Z');
  });

  test('un AUTRE message qui expire ne touche pas la ligne', () => {
    const client = new QueryClient();
    seed(client, [rowWith(known())]);

    applyMessageExpired(client, { messageId: 'm-autre', conversationId: 'c-a' }, () => undefined);

    expect(rowOf(client)?.lastMessage?.content).toBe('le plus récent');
  });
});

describe('l’envoi — optimiste visible, accusé en retard sans effet (#7547)', () => {
  const deps = (client: QueryClient, fetchImpl: typeof fetch): SendDeps => ({
    source: 'gateway',
    transport: createHttpTransport({ base: '', fetchImpl }),
    queryClient: client,
    outbox: createOutboxStore(),
    online: true,
    now: () => Date.parse('2026-09-12T10:00:00.000Z'),
  });

  test('mon envoi apparaît dans la ligne AVANT tout accusé', async () => {
    const client = new QueryClient();
    seed(client, [conv({})]);
    const never = (() => new Promise<Response>(() => undefined)) as unknown as typeof fetch;

    void performSend({
      conversationId: 'c-a',
      draft: { content: 'je tape et j’envoie', originalLanguage: 'fr' },
      viewerId: 'u-viewer',
      deps: deps(client, never),
    });
    await Promise.resolve();

    const row = rowOf(client);
    expect(row?.lastMessage?.content).toBe('je tape et j’envoie');
    expect(row?.lastMessage?.senderId).toBe('u-viewer');
    expect(row?.lastMessageAt).toBeDefined();
  });

  test('un accusé en retard ne ramène JAMAIS mon ancien message par-dessus un plus récent', async () => {
    const client = new QueryClient();
    seed(client, [conv({})]);
    let release: (r: Response) => void = () => undefined;
    const late = (() => new Promise<Response>((resolve) => {
      release = resolve;
    })) as unknown as typeof fetch;

    const sending = performSend({
      conversationId: 'c-a',
      draft: { content: 'mon ancien', originalLanguage: 'fr' },
      viewerId: 'u-viewer',
      deps: deps(client, late),
    });
    await Promise.resolve();

    applyMessageNew(
      client,
      createOutboxStore(),
      socketMessage({ id: 'm-peer', content: 'la réponse', createdAt: '2026-09-12T10:00:05.000Z' as unknown as Date }),
    );

    release(
      new Response(
        JSON.stringify({
          success: true,
          data: { id: 'm-mine', conversationId: 'c-a', senderId: 'u-viewer', createdAt: '2026-09-12T10:00:01.000Z', deliveredCount: 0, readCount: 0 },
        }),
        { status: 200 },
      ),
    );
    await sending;

    expect(rowOf(client)?.lastMessage?.id).toBe('m-peer');
    expect(rowOf(client)?.lastMessage?.content).toBe('la réponse');
  });
});
