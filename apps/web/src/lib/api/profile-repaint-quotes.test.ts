import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';
import type { UserUpdatedEventData } from '@meeshy/shared/types/socketio-events/user';
import { composeConversationPreview, renderConversationPreviewText } from '@meeshy/shared/utils/conversation-preview';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';
import { previewInputOf } from '@/lib/view/conversation-preview-input';

import { decodeMessage } from './decode';
import { findCachedThreadMessage, messagesQueryKey } from './messages';
import { createRealtimeConnection, type RealtimeDeps } from './socket';
import { createTypingStore } from './typing-store';
import type { Conversation, Message } from './types';

/**
 * #9372 / #9396 — UN PAIR RENOMMÉ L'EST AUSSI LÀ OÙ IL EST CITÉ, TRANSFÉRÉ, OU
 * AUTEUR DE LA DERNIÈRE LIGNE D'UN GROUPE. Jumelles web de #9371 / #9359.
 *
 * Le web n'a pas eu à graver d'id, contrairement à iOS : `repaintProfile`
 * désigne un utilisateur par la FORME (`id` ou `userId`), et la passerelle
 * sert `userId` sur `replyTo.sender` (REST `messages-list-query.ts`, socket
 * `MeeshySocketIOManager.ts`), sur `forwardedFrom.sender` (REST) et sur
 * `lastMessage.sender` (REST `core-list.ts`, socket `messageNewPayload.ts`).
 * Ces témoins gardent la CHAÎNE entière — charge servie, décodeur (REST
 * `decodeMessage`, socket `rawMessageFromSocket`), `user:updated`, puis la
 * valeur que l'écran lit (`Quote` lit `replyTo.sender.displayName`, la ligne
 * de liste `previewInputOf`). Un décodeur qui jetterait `userId` les ferait
 * tomber. Appariement par id SEULEMENT : un homonyme garde son nom.
 */

function fakeSocket(): SocketClient & { fire(event: string, payload: unknown): void } {
  const handlers = new Map<string, Set<SocketHandler>>();
  let connected = false;
  return {
    get connected() {
      return connected;
    },
    connect: () => {
      connected = true;
    },
    disconnect: () => {
      connected = false;
    },
    on: (event, handler) => {
      const set = handlers.get(event) ?? new Set();
      set.add(handler as SocketHandler);
      handlers.set(event, set);
    },
    off: (event, handler) => {
      handlers.get(event)?.delete(handler as SocketHandler);
    },
    emit: () => undefined,
    fire: (event, payload) => {
      for (const handler of handlers.get(event) ?? []) handler(payload);
    },
  };
}

function connect() {
  const socket = fakeSocket();
  const socketFactory: SocketFactory = () => socket;
  const queryClient = new QueryClient();
  const deps: RealtimeDeps = {
    base: 'https://gate.staging.meeshy.me',
    socketFactory,
    queryClient,
    typing: createTypingStore(),
    conversationStore,
    outbox: createOutboxStore(),
    viewerId: () => 'u-viewer',
    onClearSession: () => undefined,
  };
  createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
  return { socket, queryClient };
}

const BOB = 'u-bob';
const GROUP = 'c-group';

const BOB_RENAMED: UserUpdatedEventData = {
  userId: BOB,
  changes: { displayName: null, firstName: 'Robert', lastName: 'Diallo', username: 'bob_d', avatar: 'bob-new.webp' },
};

const bobAsParticipant = (overrides: Record<string, unknown> = {}) => ({
  id: 'p-bob',
  userId: BOB,
  displayName: 'Bob',
  username: 'bob',
  firstName: 'Bob',
  lastName: '',
  avatar: 'bob-old.webp',
  type: 'user',
  ...overrides,
});

const namesake = () => ({ id: 'p-other-bob', userId: 'u-other-bob', displayName: 'Bob', username: 'bob2', avatar: 'other.webp' });

const restMessage = (partial: Record<string, unknown>) => ({
  conversationId: GROUP,
  senderId: 'p-ada',
  originalLanguage: 'fr',
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  isViewOnce: false,
  viewOnceCount: 0,
  isBlurred: false,
  deliveredCount: 0,
  readCount: 0,
  reactionCount: 0,
  isEncrypted: false,
  translations: [],
  createdAt: '2026-10-05T09:00:00.000Z',
  sender: { id: 'p-ada', userId: 'u-ada', displayName: 'Ada', username: 'ada', avatar: null },
  ...partial,
});

const seedThread = (queryClient: QueryClient, messages: readonly unknown[]) =>
  queryClient.setQueryData(messagesQueryKey(GROUP), {
    pages: [{ messages: messages.map((m) => decodeMessage(m as Message)), hasOlder: false, nextCursor: null }],
    pageParams: [undefined],
  });

const seedGroupList = (queryClient: QueryClient, lastMessage: unknown) =>
  queryClient.setQueryData(['conversations'], {
    pages: [
      {
        conversations: [
          {
            id: GROUP,
            type: 'group',
            title: 'Équipe',
            participants: [bobAsParticipant(), { id: 'p-ada', userId: 'u-ada', displayName: 'Ada', avatar: null }],
            lastMessageAt: '2026-10-05T09:00:00.000Z',
            lastMessage,
          },
        ],
      },
    ],
    pageParams: [null],
  });

type Sender = { readonly displayName?: string; readonly avatar?: string | null; readonly username?: string };
type Quoted = Message & { readonly forwardedFrom?: { readonly sender?: Sender } };

const cached = (queryClient: QueryClient, id: string): Quoted | undefined =>
  findCachedThreadMessage(queryClient, GROUP, id) as Quoted | undefined;

const groupRow = (queryClient: QueryClient): Conversation | undefined =>
  queryClient.getQueryData<{ pages: { conversations: Conversation[] }[] }>(['conversations'])?.pages[0]?.conversations[0];

const previewText = (conversation: Conversation): string =>
  renderConversationPreviewText(
    composeConversationPreview(
      previewInputOf(conversation, { viewerId: 'u-viewer', language: 'fr', preferredLanguages: ['fr'], now: Date.parse('2026-10-05T10:00:00.000Z') }),
    ),
  );

describe('user:updated — la CITATION d’un pair suit son nouveau nom et sa photo (#9372)', () => {
  test('REST : la citation servie garde `replyTo.sender.userId` au décodage, et se repeint au nom composé', () => {
    const { socket, queryClient } = connect();
    seedThread(queryClient, [
      restMessage({ id: 'm-reply', content: 'Oui', replyToId: 'm-q', replyTo: restMessage({ id: 'm-q', content: 'On part ?', sender: bobAsParticipant() }) }),
    ]);

    expect(cached(queryClient, 'm-reply')?.replyTo?.sender?.userId).toBe(BOB);
    socket.fire(SERVER_EVENTS.USER_UPDATED, BOB_RENAMED);

    expect(cached(queryClient, 'm-reply')?.replyTo?.sender).toMatchObject({ displayName: 'Robert Diallo', username: 'bob_d', avatar: 'bob-new.webp' });
  });

  test('socket : la citation d’un `message:new` garde son id d’auteur et se repeint', () => {
    const { socket, queryClient } = connect();
    seedThread(queryClient, []);
    socket.fire(SERVER_EVENTS.MESSAGE_NEW, {
      ...restMessage({ id: 'm-live', content: 'Oui' }),
      replyToId: 'm-q',
      replyTo: { id: 'm-q', conversationId: GROUP, senderId: 'p-bob', content: 'On part ?', originalLanguage: 'fr', messageType: 'text', createdAt: '2026-10-05T08:00:00.000Z', sender: bobAsParticipant() },
    });

    expect(cached(queryClient, 'm-live')?.replyTo?.sender?.userId).toBe(BOB);
    socket.fire(SERVER_EVENTS.USER_UPDATED, BOB_RENAMED);

    expect(cached(queryClient, 'm-live')?.replyTo?.sender).toMatchObject({ displayName: 'Robert Diallo', avatar: 'bob-new.webp' });
  });

  test('la référence de TRANSFERT (`forwardedFrom.sender`) suit aussi', () => {
    const { socket, queryClient } = connect();
    seedThread(queryClient, [
      restMessage({
        id: 'm-fwd',
        content: 'On part ?',
        forwardedFromId: 'm-orig',
        forwardedFrom: { id: 'm-orig', content: 'On part ?', messageType: 'text', createdAt: '2026-10-04T08:00:00.000Z', sender: bobAsParticipant() },
      }),
    ]);

    socket.fire(SERVER_EVENTS.USER_UPDATED, BOB_RENAMED);

    expect(cached(queryClient, 'm-fwd')?.forwardedFrom?.sender).toMatchObject({ displayName: 'Robert Diallo', username: 'bob_d', avatar: 'bob-new.webp' });
  });

  test('appariement par id SEULEMENT : un homonyme cité garde son nom et sa photo', () => {
    const { socket, queryClient } = connect();
    seedThread(queryClient, [restMessage({ id: 'm-reply', content: 'Oui', replyToId: 'm-q', replyTo: restMessage({ id: 'm-q', content: 'Salut', sender: namesake() }) })]);

    socket.fire(SERVER_EVENTS.USER_UPDATED, BOB_RENAMED);

    expect(cached(queryClient, 'm-reply')?.replyTo?.sender).toMatchObject({ displayName: 'Bob', avatar: 'other.webp' });
  });

  test('une photo seule ne renomme pas la citation ; un avatar retiré (null) n’efface rien', () => {
    const { socket, queryClient } = connect();
    seedThread(queryClient, [
      restMessage({ id: 'm-reply', content: 'Oui', replyToId: 'm-q', replyTo: restMessage({ id: 'm-q', content: 'On part ?', sender: bobAsParticipant() }) }),
    ]);

    socket.fire(SERVER_EVENTS.USER_UPDATED, { userId: BOB, changes: { avatar: 'bob-new.webp' } });
    expect(cached(queryClient, 'm-reply')?.replyTo?.sender).toMatchObject({ displayName: 'Bob', avatar: 'bob-new.webp' });
  });
});

describe('user:updated — l’aperçu « Bob : … » d’un GROUPE suit le pair renommé (#9396)', () => {
  test('REST : la dernière ligne servie porte `lastMessage.sender.userId`, et l’auteur affiché devient le nom composé', () => {
    const { socket, queryClient } = connect();
    seedGroupList(queryClient, restMessage({ id: 'm-last', senderId: 'p-bob', content: 'On part ?', sender: bobAsParticipant() }));
    const before = groupRow(queryClient);
    expect(before === undefined ? '' : previewText(before)).toContain('Bob');

    socket.fire(SERVER_EVENTS.USER_UPDATED, BOB_RENAMED);

    const after = groupRow(queryClient);
    expect(after === undefined ? '' : previewText(after)).toContain('Robert Diallo');
  });

  test('socket : la dernière ligne posée par `message:new` se repeint aussi', () => {
    const { socket, queryClient } = connect();
    seedGroupList(queryClient, restMessage({ id: 'm-old', content: 'Avant' }));
    socket.fire(SERVER_EVENTS.MESSAGE_NEW, restMessage({ id: 'm-live', senderId: 'p-bob', content: 'On part ?', createdAt: '2026-10-05T09:30:00.000Z', sender: bobAsParticipant() }));
    const before = groupRow(queryClient);
    expect(before === undefined ? '' : previewText(before)).toContain('Bob');

    socket.fire(SERVER_EVENTS.USER_UPDATED, BOB_RENAMED);

    const after = groupRow(queryClient);
    expect(after === undefined ? '' : previewText(after)).toContain('Robert Diallo');
  });

  test('un homonyme auteur de la dernière ligne garde son nom', () => {
    const { socket, queryClient } = connect();
    seedGroupList(queryClient, restMessage({ id: 'm-last', senderId: 'p-other-bob', content: 'Salut', sender: namesake() }));

    socket.fire(SERVER_EVENTS.USER_UPDATED, BOB_RENAMED);

    const after = groupRow(queryClient);
    expect(after === undefined ? '' : previewText(after)).not.toContain('Robert');
  });
});
