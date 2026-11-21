import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';
import { menuConversationOf, menuViewerOf } from '@/lib/view/message-action-scope';
import { deleteOfferOf } from '@/lib/view/message-deletion';

import { conversationQueryKey } from './conversations';
import { createRealtimeConnection, type RealtimeDeps } from './socket';
import type { Conversation, Message } from './types';
import { createTypingStore } from './typing-store';

/**
 * **L'APPARTENANCE DU LECTEUR, DANS LES DEUX SENS** (#11415 puis #20227) — ce
 * fichier garde le BRANCHEMENT des deux directions : retirer l'un des
 * `socket.on` fait tomber son témoin.
 *
 * **LE LECTEUR QUI QUITTE UNE CONVERSATION OUVERTE N'Y EST PLUS MEMBRE** (#11415)
 * — la passerelle adresse `conversation:participant-left` et
 * `conversation:participant-banned` à la salle `user:<id>` du partant. Le
 * détail servi ne connaît que des lignes ACTIVES : la ligne du lecteur n'y
 * passe jamais « inactive », elle disparaît. Sans ce puits, le fil ouvert
 * gardait son détail d'avant et offrait encore « Supprimer pour moi », que la
 * passerelle refuse en 403. Le témoin garde le BRANCHEMENT : retirer le
 * `socket.on` le fait tomber.
 */

const VIEWER = 'u-viewer';
const NOW = Date.parse('2026-10-24T12:00:00.000Z');

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
    viewerId: () => VIEWER,
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
    currentUserRole: 'member',
    participants: [{ id: 'p-viewer', userId: VIEWER, role: 'member', isActive: true }],
  }) as unknown as Conversation;

const othersMessage = { id: 'm-1', senderId: 'p-other', content: 'Bonjour', createdAt: '2026-10-24T11:00:00.000Z', isViewOnce: false, isBlurred: false } as unknown as Message;

const offersDeleteForMe = (queryClient: QueryClient, id: string): boolean => {
  const conversation = queryClient.getQueryData<Conversation>(conversationQueryKey(id));
  const viewer = menuViewerOf({ viewer: { id: VIEWER, isAnonymous: false }, participants: conversation?.participants, conversation, platformRole: 'USER' });
  return deleteOfferOf([othersMessage], { viewer, conversation: menuConversationOf(conversation) }, { now: NOW }).forMe;
};

describe('#11415 — la fin d’appartenance du lecteur atteint le fil ouvert', () => {
  test('témoin : un participant actif se voit offrir « Supprimer pour moi »', () => {
    const { queryClient, destroy } = connect();
    queryClient.setQueryData(conversationQueryKey('c-1'), detail('c-1'));
    expect(offersDeleteForMe(queryClient, 'c-1')).toBe(true);
    destroy();
  });

  test('quitter (ou être retiré) depuis un autre appareil : le détail dit « pas membre », le geste part', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData(conversationQueryKey('c-1'), detail('c-1'));
    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT, { conversationId: 'c-1', participantId: 'p-viewer', userId: VIEWER, displayName: 'Léa', leftAt: '2026-10-24T11:30:00.000Z' });
    expect(queryClient.getQueryData<Conversation>(conversationQueryKey('c-1'))?.isMember).toBe(false);
    expect(offersDeleteForMe(queryClient, 'c-1')).toBe(false);
    destroy();
  });

  test('être banni : même verdict', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData(conversationQueryKey('c-1'), detail('c-1'));
    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_BANNED, { conversationId: 'c-1', participantId: 'p-viewer', userId: VIEWER, bannedBy: { id: 'u-admin' }, bannedAt: '2026-10-24T11:30:00.000Z' });
    expect(offersDeleteForMe(queryClient, 'c-1')).toBe(false);
    destroy();
  });

  test('le départ d’un AUTRE, ou du lecteur ailleurs, ne touche pas cette conversation', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData(conversationQueryKey('c-1'), detail('c-1'));
    queryClient.setQueryData(conversationQueryKey('c-2'), detail('c-2'));
    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT, { conversationId: 'c-1', participantId: 'p-other', userId: 'u-other', displayName: 'Zoé', leftAt: '2026-10-24T11:30:00.000Z' });
    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT, { conversationId: 'c-2', participantId: 'p-viewer', userId: VIEWER, displayName: 'Léa', leftAt: '2026-10-24T11:30:00.000Z' });
    expect(offersDeleteForMe(queryClient, 'c-1')).toBe(true);
    expect(offersDeleteForMe(queryClient, 'c-2')).toBe(false);
    destroy();
  });

  test('une charge illisible n’est pas appliquée', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData(conversationQueryKey('c-1'), detail('c-1'));
    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT, { conversationId: 'c-1' });
    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT, null);
    expect(offersDeleteForMe(queryClient, 'c-1')).toBe(true);
    destroy();
  });

  test('détruite, la connexion n’écoute plus', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData(conversationQueryKey('c-1'), detail('c-1'));
    destroy();
    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT, { conversationId: 'c-1', participantId: 'p-viewer', userId: VIEWER, displayName: 'Léa', leftAt: '2026-10-24T11:30:00.000Z' });
    expect(offersDeleteForMe(queryClient, 'c-1')).toBe(true);
  });
});

/**
 * #20227 — ET LE DÉBANNISSEMENT REND L'APPARTENANCE.
 *
 * La passerelle émet `conversation:participant-unbanned` avec
 * `membershipRestored` et un effectif ABSOLU, et RE-REJOINT la cible à la room
 * de conversation (`participant-ban-core.ts`). Le web n'avait AUCUN applieur :
 * mesuré, zéro occurrence de « unbanned » dans `apps/web/src`, quand iOS et
 * Android appliquent les deux sens.
 *
 * La ligne et le détail gardaient donc `isMember: false` — donc plus de
 * réponse, plus de réaction, plus de « Supprimer pour moi », mentions ignorées
 * — pendant que les messages continuaient d'arriver en direct. Et rien ne
 * guérissait tout seul : la liste se rafraîchit par un delta borné par
 * `Conversation.updatedAt`, qu'un débannissement ne touche pas (il n'écrit
 * qu'un `participant.update`), donc seul le réconcilie complet de 15 minutes
 * la repeignait.
 *
 * Le témoin passe par le VRAI consommateur (`deleteOfferOf`), pas par le
 * drapeau : ce qui compte est que le geste revienne.
 */
describe('#20227 — le débannissement rend l’appartenance au lecteur', () => {
  const banni = { conversationId: 'c-1', participantId: 'p-viewer', userId: VIEWER, bannedBy: { id: 'u-admin' }, bannedAt: '2026-10-24T11:30:00.000Z' };

  test('banni puis débanni : le geste revient', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData(conversationQueryKey('c-1'), detail('c-1'));

    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_BANNED, banni);
    expect(offersDeleteForMe(queryClient, 'c-1')).toBe(false);

    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_UNBANNED, {
      conversationId: 'c-1', participantId: 'p-viewer', userId: VIEWER, membershipRestored: true, memberCount: 3,
    });

    expect(queryClient.getQueryData<Conversation>(conversationQueryKey('c-1'))?.isMember).toBe(true);
    expect(offersDeleteForMe(queryClient, 'c-1')).toBe(true);
    destroy();
  });

  /**
   * « Le bannissement est levé dans tous les cas ; l'appartenance, non » — le
   * site d'émission le dit, et les compteurs suivent CE champ, pas l'événement.
   * Lever le ban d'un ancien membre ne le fait pas rentrer.
   */
  test('levée SANS restauration d’appartenance : le lecteur n’est pas remis dedans', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData(conversationQueryKey('c-1'), detail('c-1'));

    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_BANNED, banni);
    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_UNBANNED, {
      conversationId: 'c-1', participantId: 'p-viewer', userId: VIEWER, membershipRestored: false,
    });

    expect(offersDeleteForMe(queryClient, 'c-1')).toBe(false);
    destroy();
  });

  test('le débannissement d’un AUTRE ne remet pas le lecteur dedans', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData(conversationQueryKey('c-1'), detail('c-1'));

    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_BANNED, banni);
    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_UNBANNED, {
      conversationId: 'c-1', participantId: 'p-other', userId: 'u-other', membershipRestored: true, memberCount: 4,
    });

    expect(offersDeleteForMe(queryClient, 'c-1')).toBe(false);
    destroy();
  });

  test('une charge illisible n’est pas appliquée', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData(conversationQueryKey('c-1'), detail('c-1'));

    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_BANNED, banni);
    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_UNBANNED, { conversationId: 'c-1', membershipRestored: true });
    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_UNBANNED, null);

    expect(offersDeleteForMe(queryClient, 'c-1')).toBe(false);
    destroy();
  });

  test('détruite, la connexion n’écoute plus le débannissement', () => {
    const { socket, queryClient, destroy } = connect();
    queryClient.setQueryData(conversationQueryKey('c-1'), detail('c-1'));
    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_BANNED, banni);
    destroy();
    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_UNBANNED, {
      conversationId: 'c-1', participantId: 'p-viewer', userId: VIEWER, membershipRestored: true, memberCount: 3,
    });
    expect(offersDeleteForMe(queryClient, 'c-1')).toBe(false);
  });
});
