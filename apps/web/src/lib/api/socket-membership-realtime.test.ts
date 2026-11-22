import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { conversationStore } from '@/lib/conversation-store';
import type { SocketClient, SocketFactory, SocketHandler } from '@/lib/net/socket';
import { createOutboxStore } from '@/lib/send/outbox-store';
import { menuConversationOf, menuViewerOf } from '@/lib/view/message-action-scope';
import { deleteOfferOf } from '@/lib/view/message-deletion';

import { CONVERSATIONS_QUERY_KEY, conversationQueryKey } from './conversations';
import { flattenConversationPages, type ConversationsInfiniteData } from './conversations-pages';
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

/**
 * #20302 — ET LA LIGNE DE LISTE S'EN VA.
 *
 * #11415 a posé le puits d'appartenance et prouvé sa moitié qui ATTEINT le
 * pixel : le détail que le fil ouvert relit. L'autre moitié —
 * `patchConversation(… isMember: false)` — n'atteignait RIEN. Relevé des
 * lecteurs d'`isMember` dans `apps/web/src` : la carte d'un lien, le menu d'un
 * message, les deux unités de mention, le menu d'une ligne, le filtre du
 * talkie. **Aucun ne décide qu'une ligne SE REND** — ni `applyFilter`
 * (`lib/lens/filters.ts`) ni `flattenConversationPages` ne portent de prédicat
 * d'appartenance. La ligne restait, avec son aperçu et sa pastille.
 *
 * La passerelle ÉNONCE pourtant le contrat sur ses deux sites d'émission
 * (`participant-ban-core.ts`, `leave.ts`) : « ses appareils gardaient une
 * ligne que `GET /conversations` ne sert plus … Le retrait côté client est
 * idempotent ». iOS (`applyConversationDeleted`) et Android (`purge`)
 * l'honorent tous les deux ; le web était le seul à ne pas le faire.
 *
 * Et rien ne guérissait seul : la liste se rafraîchit par un delta borné par
 * `Conversation.updatedAt`, qu'un départ comme un bannissement laissent
 * intact — ils n'écrivent qu'un `participant.update`. C'est la raison déjà
 * mesurée pour #20227.
 *
 * **Le témoin passe par le VRAI consommateur** — `flattenConversationPages`,
 * le `select` de la liste, donc ce que l'écran rend — jamais par le drapeau :
 * c'est précisément un drapeau vert au-dessus d'un écran faux qui a tenu ce
 * défaut invisible.
 *
 * **Le DÉTAIL n'est pas purgé**, et c'est la décision de #11415 : le fil
 * OUVERT reste ouvert et dégrade son menu, il ne se referme pas sous le
 * lecteur. `applyConversationGone` ne convient donc pas tel quel ; c'est sa
 * moitié « journal de liste » qui est la loi partagée.
 */
describe('#20302 — un départ ou un bannissement qui me nomme retire ma ligne', () => {
  const seedList = (queryClient: QueryClient) => {
    queryClient.setQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY, {
      pages: [
        {
          conversations: ['c-1', 'c-2'].map((id) => ({ id, type: 'group', participants: [] }) as unknown as Conversation),
          pagination: { limit: 30, offset: 0, total: 2, hasMore: false },
          cursorPagination: { limit: 30, hasMore: false, nextCursor: null },
        },
      ],
      pageParams: [undefined],
    });
  };

  /** Ce que la liste REND : son `select`, pas les pages brutes. */
  const rendered = (queryClient: QueryClient): readonly string[] => {
    const data = queryClient.getQueryData<ConversationsInfiniteData>(CONVERSATIONS_QUERY_KEY);
    return data === undefined ? [] : flattenConversationPages(data).map((c) => c.id);
  };

  const parti = { conversationId: 'c-1', participantId: 'p-viewer', userId: VIEWER, displayName: 'Léa', leftAt: '2026-10-24T11:30:00.000Z' };
  const banni = { conversationId: 'c-1', participantId: 'p-viewer', userId: VIEWER, bannedBy: { id: 'u-admin' }, bannedAt: '2026-10-24T11:30:00.000Z' };

  test('témoin : les deux lignes sont rendues avant l’événement', () => {
    const { queryClient, destroy } = connect();
    seedList(queryClient);
    expect(rendered(queryClient)).toEqual(['c-1', 'c-2']);
    destroy();
  });

  for (const [nom, event, payload] of [
    ['quitter depuis un autre appareil', SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT, parti],
    ['être banni', SERVER_EVENTS.CONVERSATION_PARTICIPANT_BANNED, banni],
  ] as const) {
    test(`${nom} : la ligne quitte la liste, le détail reste pour le fil ouvert`, () => {
      const { socket, queryClient, destroy } = connect();
      seedList(queryClient);
      queryClient.setQueryData(conversationQueryKey('c-1'), detail('c-1'));

      socket.fire(event, payload);

      expect(rendered(queryClient)).toEqual(['c-2']);
      // #11415 — le fil ouvert garde son détail et dégrade son menu.
      expect(queryClient.getQueryData<Conversation>(conversationQueryKey('c-1'))).toBeDefined();
      expect(offersDeleteForMe(queryClient, 'c-1')).toBe(false);
      destroy();
    });
  }

  test('le départ d’un AUTRE ne retire aucune ligne', () => {
    const { socket, queryClient, destroy } = connect();
    seedList(queryClient);
    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT, { ...parti, participantId: 'p-other', userId: 'u-other' });
    expect(rendered(queryClient)).toEqual(['c-1', 'c-2']);
    destroy();
  });

  test('une charge illisible ne retire aucune ligne', () => {
    const { socket, queryClient, destroy } = connect();
    seedList(queryClient);
    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT, { conversationId: 'c-1' });
    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_BANNED, null);
    expect(rendered(queryClient)).toEqual(['c-1', 'c-2']);
    destroy();
  });

  /** Le retrait est IDEMPOTENT — c'est ce sur quoi la passerelle compte pour ne pas gater son éventail. */
  test('rejoué, le même départ ne change plus rien', () => {
    const { socket, queryClient, destroy } = connect();
    seedList(queryClient);
    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT, parti);
    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT, parti);
    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_BANNED, banni);
    expect(rendered(queryClient)).toEqual(['c-2']);
    destroy();
  });

  test('détruite, la connexion ne retire plus rien', () => {
    const { socket, queryClient, destroy } = connect();
    seedList(queryClient);
    destroy();
    socket.fire(SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT, parti);
    expect(rendered(queryClient)).toEqual(['c-1', 'c-2']);
  });
});
