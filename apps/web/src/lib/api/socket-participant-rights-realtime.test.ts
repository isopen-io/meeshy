import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';
import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';
import { menuConversationOf, menuViewerOf, webRepliesToMessage } from '@/lib/view/message-action-scope';

import { conversationQueryKey } from './conversations';
import { createRealtimeConnection, type RealtimeDeps } from './socket';
import type { Conversation, Message } from './types';
import { createTypingStore } from './typing-store';

/**
 * **UN DROIT RÉVOQUÉ EN DIRECT S'APPLIQUE SUR LE WEB** (#20228) — la passerelle
 * émet `participant:rights-updated` à la room de conversation ET à la room
 * personnelle du sujet depuis #3898 ; iOS et Android l'appliquent à la fiche
 * ouverte. Mesuré le 2026-11-21, le web n'avait AUCUN consommateur (zéro
 * occurrence de `rights-updated` dans `apps/web/src`), donc un visiteur dont
 * l'hôte venait de retirer `canSendMessages` gardait son composeur et ses
 * gestes d'écriture jusqu'au prochain montage du détail — puis recevait un
 * refus du serveur.
 *
 * Les témoins passent par le VRAI consommateur (`messageActionsFor` via
 * `menuViewerOf`), pas par le champ : ce qui compte est que le GESTE disparaisse
 * — « suivre la donnée jusqu'au PIXEL » (cycle 123).
 */

const GUEST = 'p-guest';
const NOW = Date.parse('2026-11-21T12:00:00.000Z');

const ALL_RIGHTS = {
  canSendMessages: true,
  canSendFiles: true,
  canSendImages: true,
  canSendVideos: true,
  canSendAudios: true,
  canSendLocations: true,
  canSendLinks: true,
  canViewHistory: true,
} as const;

/** La charge de la ROOM de conversation : les sept droits d'émission, `canViewHistory` ABSENT (#4009). */
const roomRights = (overrides: Partial<Record<keyof typeof ALL_RIGHTS, boolean>> = {}) => {
  const { canViewHistory: _reservedToHosts, ...sendRights } = { ...ALL_RIGHTS, ...overrides };
  return sendRights;
};

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

function connect(): { readonly socket: ReturnType<typeof fakeSocket>; readonly queryClient: QueryClient; readonly destroy: () => void } {
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
    viewerId: () => GUEST,
    onClearSession: () => undefined,
  };
  const connection = createRealtimeConnection({ token: 't', sessionToken: 's' }, deps);
  return { socket, queryClient, destroy: connection.destroy };
}

const detail = (id: string): Conversation =>
  ({
    id,
    type: 'group',
    encryptionMode: null,
    isActive: true,
    isMember: true,
    currentUserRole: 'member',
    participants: [
      { id: GUEST, type: 'anonymous', role: 'member', isActive: true, permissions: { ...ALL_RIGHTS } },
      { id: 'p-other', type: 'anonymous', role: 'member', isActive: true, permissions: { ...ALL_RIGHTS } },
    ],
  }) as unknown as Conversation;

const othersMessage = {
  id: 'm-1',
  senderId: 'p-other',
  content: 'Bonjour',
  createdAt: '2026-11-21T11:00:00.000Z',
  isViewOnce: false,
  isBlurred: false,
} as unknown as Message;

/** LE GESTE, pas le champ : répondre à un message exige `canSendMessages` (`viewerCanWrite`). */
const offersReply = (queryClient: QueryClient, id: string): boolean => {
  const conversation = queryClient.getQueryData<Conversation>(conversationQueryKey(id));
  const viewer = menuViewerOf({ viewer: { id: GUEST, isAnonymous: true }, participants: conversation?.participants, conversation, platformRole: null });
  return webRepliesToMessage(othersMessage, { viewer, conversation: menuConversationOf(conversation) }, { now: NOW });
};

const permissionsOf = (queryClient: QueryClient, id: string, participantId: string) =>
  queryClient
    .getQueryData<Conversation>(conversationQueryKey(id))
    ?.participants.find((p) => p.id === participantId)?.permissions as Record<string, boolean> | undefined;

describe('#20228 — un droit révoqué en direct s’applique sur le web', () => {
  test('témoin : un visiteur qui peut écrire se voit offrir « Répondre »', () => {
    const { queryClient, destroy } = connect();
    queryClient.setQueryData(conversationQueryKey('c-1'), detail('c-1'));
    expect(offersReply(queryClient, 'c-1')).toBe(true);
    destroy();
  });

  test('l’hôte retire « écrire des messages » : le geste part, fil ouvert', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData(conversationQueryKey('c-1'), detail('c-1'));

    socket.fire(SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED, {
      conversationId: 'c-1',
      participantId: GUEST,
      updatedBy: 'u-admin',
      rights: roomRights({ canSendMessages: false }),
    });

    expect(permissionsOf(queryClient, 'c-1', GUEST)?.canSendMessages).toBe(false);
    expect(offersReply(queryClient, 'c-1')).toBe(false);
    destroy();
  });

  test('un droit rendu revient : le geste revient avec lui', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData(conversationQueryKey('c-1'), detail('c-1'));

    socket.fire(SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED, { conversationId: 'c-1', participantId: GUEST, updatedBy: 'u-admin', rights: roomRights({ canSendMessages: false }) });
    socket.fire(SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED, { conversationId: 'c-1', participantId: GUEST, updatedBy: 'u-admin', rights: roomRights() });

    expect(offersReply(queryClient, 'c-1')).toBe(true);
    destroy();
  });

  /**
   * La charge de la ROOM retire `canViewHistory` (#4009) : la clé est ABSENTE,
   * jamais `false`. Une recopie inconditionnelle de `rights` EFFACERAIT l'octroi
   * que la ligne porte — un droit non NOMMÉ n'affirme rien.
   */
  test('la charge réduite de la room n’efface pas « voir l’historique »', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData(conversationQueryKey('c-1'), detail('c-1'));

    socket.fire(SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED, { conversationId: 'c-1', participantId: GUEST, updatedBy: 'u-admin', rights: roomRights({ canSendImages: false }) });

    const permissions = permissionsOf(queryClient, 'c-1', GUEST);
    expect(permissions?.canSendImages).toBe(false);
    expect(permissions?.canViewHistory).toBe(true);
    destroy();
  });

  /** La charge COMPLÈTE — celle de la room personnelle et des autres hôtes — le dit, elle : `false` retire. */
  test('la charge complète d’un hôte retire « voir l’historique »', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData(conversationQueryKey('c-1'), detail('c-1'));

    socket.fire(SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED, {
      conversationId: 'c-1',
      participantId: GUEST,
      updatedBy: 'u-admin',
      rights: { ...ALL_RIGHTS, canViewHistory: false },
      historyVisibleFrom: null,
    });

    expect(permissionsOf(queryClient, 'c-1', GUEST)?.canViewHistory).toBe(false);
    destroy();
  });

  test('les droits d’un AUTRE participant se posent sur SA ligne, et le lecteur garde les siens', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData(conversationQueryKey('c-1'), detail('c-1'));

    socket.fire(SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED, { conversationId: 'c-1', participantId: 'p-other', updatedBy: 'u-admin', rights: roomRights({ canSendMessages: false }) });

    expect(permissionsOf(queryClient, 'c-1', 'p-other')?.canSendMessages).toBe(false);
    expect(offersReply(queryClient, 'c-1')).toBe(true);
    destroy();
  });

  test('une AUTRE conversation n’est pas touchée', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData(conversationQueryKey('c-1'), detail('c-1'));
    queryClient.setQueryData(conversationQueryKey('c-2'), detail('c-2'));

    socket.fire(SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED, { conversationId: 'c-2', participantId: GUEST, updatedBy: 'u-admin', rights: roomRights({ canSendMessages: false }) });

    expect(offersReply(queryClient, 'c-1')).toBe(true);
    expect(offersReply(queryClient, 'c-2')).toBe(false);
    destroy();
  });

  test('une charge illisible n’est pas appliquée', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData(conversationQueryKey('c-1'), detail('c-1'));

    socket.fire(SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED, null);
    socket.fire(SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED, { conversationId: 'c-1', rights: roomRights({ canSendMessages: false }) });
    socket.fire(SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED, { conversationId: 'c-1', participantId: GUEST, rights: 'nope' });
    socket.fire(SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED, { conversationId: 'c-1', participantId: GUEST, rights: { canSendMessages: 'non' } });

    expect(offersReply(queryClient, 'c-1')).toBe(true);
    destroy();
  });

  /** Au-delà du plafond du détail (100), la ligne n'est pas servie : rien à dire, rien à fabriquer. */
  test('un participant absent du détail ne fabrique aucune ligne — et n’écrit pas le cache', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData(conversationQueryKey('c-1'), detail('c-1'));
    const before = queryClient.getQueryData<Conversation>(conversationQueryKey('c-1'));

    socket.fire(SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED, { conversationId: 'c-1', participantId: 'p-unknown', updatedBy: 'u-admin', rights: roomRights({ canSendMessages: false }) });

    /* La MÊME référence : rien n'a été fabriqué, donc le partage structurel de TanStack rend l'objet d'avant — aucun abonné du détail ne se re-rend. */
    expect(queryClient.getQueryData<Conversation>(conversationQueryKey('c-1'))).toBe(before);
    expect(offersReply(queryClient, 'c-1')).toBe(true);
    destroy();
  });

  test('détruite, la connexion n’écoute plus', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData(conversationQueryKey('c-1'), detail('c-1'));
    destroy();

    socket.fire(SERVER_EVENTS.PARTICIPANT_RIGHTS_UPDATED, { conversationId: 'c-1', participantId: GUEST, updatedBy: 'u-admin', rights: roomRights({ canSendMessages: false }) });

    expect(offersReply(queryClient, 'c-1')).toBe(true);
  });
});
