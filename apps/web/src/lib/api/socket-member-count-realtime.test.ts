import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';

import { CONVERSATIONS_QUERY_KEY, conversationQueryKey, findCachedConversation } from './conversations';
import type { ConversationsInfiniteData } from './conversations-pages';
import { createRealtimeConnection, type RealtimeDeps } from './socket';
import type { Conversation } from './types';
import { createTypingStore } from './typing-store';

/**
 * **L'EFFECTIF D'UN GROUPE SUIT LES ARRIVÉES ET LES DÉPARTS** (#18914, WEB-14)
 * — `conversation:participant-joined` / `-left` / `-banned` d'un autre membre
 * n'étaient écoutés que par la feuille de détails ouverte : « 12 membres »
 * restait affiché sur la ligne et dans l'en-tête du fil. La charge porte
 * l'effectif ACTIF, ABSOLU — « à POSER, pas à incrémenter »
 * (`socketio-events/participant.ts`) — et son plafond d'affichage ; l'incrément
 * n'est que le repli d'une passerelle qui ne les sert pas encore.
 */

const VIEWER = 'u-viewer';

function fakeSocket(): SocketClient & { fire(event: string, payload: unknown): void } {
  const handlers = new Map<string, Set<SocketHandler>>();
  const state = { connected: false };
  return {
    get connected() {
      return state.connected;
    },
    connect: () => {
      state.connected = true;
    },
    disconnect: () => {
      state.connected = false;
    },
    on: (event, handler) => {
      handlers.set(event, (handlers.get(event) ?? new Set()).add(handler as SocketHandler));
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

const group = (partial: Partial<Conversation> = {}): Conversation =>
  ({ id: 'c-a', type: 'group', status: 'active', visibility: 'private', isActive: true, memberCount: 3, participants: [], createdAt: new Date(), updatedAt: new Date(), ...partial }) as Conversation;

function connectedWith(conversation: Conversation) {
  const socket = fakeSocket();
  const socketFactory: SocketFactory = () => socket;
  const queryClient = new QueryClient();
  queryClient.setQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY, {
    pages: [{ conversations: [conversation], pagination: { limit: 30, offset: 0, total: 1, hasMore: false }, cursorPagination: { limit: 30, hasMore: false, nextCursor: null } }],
    pageParams: [undefined],
  });
  queryClient.setQueryData(conversationQueryKey('c-a'), conversation);
  const deps: RealtimeDeps = {
    base: 'https://gate.staging.meeshy.me',
    socketFactory,
    queryClient,
    typing: createTypingStore(),
    conversationStore,
    outbox: createOutboxStore(),
    viewerId: () => VIEWER,
    onClearSession: () => undefined,
  };
  const connection = createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
  return { socket, queryClient, destroy: connection.destroy };
}

const row = (queryClient: QueryClient): Conversation | undefined => findCachedConversation(queryClient, 'c-a');
const detail = (queryClient: QueryClient): Conversation | undefined => queryClient.getQueryData<Conversation>(conversationQueryKey('c-a'));

const joined = (extra: Readonly<Record<string, unknown>> = {}) => ({ conversationId: 'c-a', userId: 'u-zoe', displayName: 'Zoé', joinedAt: '2026-11-17T10:00:00.000Z', ...extra });
const left = (extra: Readonly<Record<string, unknown>> = {}) => ({ conversationId: 'c-a', participantId: 'p-zoe', userId: 'u-zoe', displayName: 'Zoé', leftAt: '2026-11-17T10:00:00.000Z', ...extra });
const banned = (extra: Readonly<Record<string, unknown>> = {}) => ({ conversationId: 'c-a', participantId: 'p-zoe', userId: 'u-zoe', bannedBy: { id: 'u-admin' }, bannedAt: '2026-11-17T10:00:00.000Z', ...extra });

describe('l’effectif SERVI est posé, jamais incrémenté (WEB-14)', () => {
  test('`participant-joined { memberCount: 7 }` pose 7 sur la ligne et la fiche', () => {
    const { socket, queryClient, destroy } = connectedWith(group({ memberCount: 3 }));

    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_JOINED, joined({ memberCount: 7 }));

    expect(row(queryClient)?.memberCount).toBe(7);
    expect(detail(queryClient)?.memberCount).toBe(7);
    destroy();
  });

  test('`participant-left` et `participant-banned` posent l’effectif servi', () => {
    const { socket, queryClient, destroy } = connectedWith(group({ memberCount: 9 }));

    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT, left({ memberCount: 8 }));
    expect(row(queryClient)?.memberCount).toBe(8);

    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_BANNED, banned({ memberCount: 6 }));
    expect(row(queryClient)?.memberCount).toBe(6);
    expect(detail(queryClient)?.memberCount).toBe(6);
    destroy();
  });

  test('le plafond d’affichage voyage AVEC l’effectif : posé quand servi, retiré quand l’effectif est exact', () => {
    const { socket, queryClient, destroy } = connectedWith(group({ memberCount: 150 }));

    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_JOINED, joined({ memberCount: 199, memberCountCapped: true }));
    expect(row(queryClient)?.memberCountCapped).toBe(true);

    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT, left({ memberCount: 198 }));
    expect(row(queryClient)?.memberCount).toBe(198);
    expect(Object.keys(row(queryClient) ?? {})).not.toContain('memberCountCapped');
    destroy();
  });
});

describe('le repli d’une passerelle qui ne sert pas l’effectif', () => {
  test('une arrivée ajoute un membre, un départ en retire un', () => {
    const { socket, queryClient, destroy } = connectedWith(group({ memberCount: 3 }));

    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_JOINED, joined());
    expect(row(queryClient)?.memberCount).toBe(4);

    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT, left());
    expect(row(queryClient)?.memberCount).toBe(3);
    destroy();
  });

  test('bannir un ancien membre (`membershipEnded: false`) ne retire personne', () => {
    const { socket, queryClient, destroy } = connectedWith(group({ memberCount: 3 }));

    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_BANNED, banned({ membershipEnded: false }));

    expect(row(queryClient)?.memberCount).toBe(3);
    destroy();
  });

  test('une charge sans conversation ne touche rien', () => {
    const { socket, queryClient, destroy } = connectedWith(group({ memberCount: 3 }));

    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_JOINED, { userId: 'u-zoe', memberCount: 50 });

    expect(row(queryClient)?.memberCount).toBe(3);
    destroy();
  });
});
