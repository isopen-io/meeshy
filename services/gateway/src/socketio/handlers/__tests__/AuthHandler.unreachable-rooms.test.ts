/**
 * #16687 — une socket dont la room de conversation n'a PAS pu être rejointe ne
 * doit plus être comptée joignable par la file hors ligne.
 *
 * `enqueueForOfflineParticipants` décidait d'enfiler sur un seul test
 * (`connectedUsers.has(queueKey)`), et `AuthHandler` inscrivait la socket
 * INCONDITIONNELLEMENT, y compris après l'échec définitif des jonctions :
 * l'échec n'était que journalisé. La socket était donc vue joignable alors que
 * le `io.to(ROOMS.conversation(...))` ne l'atteignait pas davantage — message
 * perdu, et sans recours, puisque rien n'avait été écrit dans la file.
 *
 * Ce qui change n'est PAS l'inscription — `connectedUsers` et `socketToUser`
 * portent aussi la présence, `user:status` et le nettoyage à la déconnexion, si
 * bien que la retenir troquerait un défaut contre trois. C'est la QUESTION
 * posée : plus « cette clé a-t-elle une socket ? » mais « cette socket est-elle
 * joignable pour CETTE conversation ? ». `SocketUser.unreachableConversations`
 * porte la réponse.
 *
 * Les témoins vivent ICI et non dans `AuthHandler.test.ts` : ce fichier-là est
 * hors budget de taille (dette gelée à 1 645 lignes), et le dépôt interdit
 * d'ajouter à un fichier hors budget — on extrait d'abord, on ajoute ensuite.
 * Les deux témoins qui GELAIENT le défaut y restent, leur justification fausse
 * corrigée sur place, à taille constante.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AuthHandler } from '../AuthHandler';
import { LIVE_SID, liveSession } from '../../../services/auth/__tests__/live-session-double';
import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { StatusService } from '../../../services/StatusService';
import jwt from 'jsonwebtoken';

const createMockSocket = (overrides: Record<string, unknown> = {}): Socket => ({
  id: 'socket-123',
  handshake: { auth: {}, headers: {} },
  emit: jest.fn(),
  join: jest.fn(),
  leave: jest.fn(),
  on: jest.fn(),
  disconnect: jest.fn(),
  ...overrides,
} as unknown as Socket);

const createMockPrisma = (): PrismaClient => ({
  user: { findUnique: jest.fn(), update: jest.fn<any>().mockResolvedValue(undefined) },
  participant: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn<any>().mockResolvedValue([]),
  },
  userSession: { findFirst: jest.fn(async () => liveSession()) },
  callParticipant: { findMany: jest.fn<any>().mockResolvedValue([]) },
} as unknown as PrismaClient);

describe('AuthHandler — joignabilité par conversation (#16687)', () => {
  let authHandler: AuthHandler;
  let mockPrisma: PrismaClient;
  let connectedUsers: Map<string, any>;

  beforeEach(() => {
    process.env.JWT_SECRET = 'test-secret-key-for-unit-tests';
    mockPrisma = createMockPrisma();
    connectedUsers = new Map();
    authHandler = new AuthHandler({
      prisma: mockPrisma,
      statusService: {
        updateLastSeen: jest.fn(), noteHeartbeat: jest.fn(),
        markConnected: jest.fn(), markDisconnected: jest.fn(),
      } as unknown as StatusService,
      maintenanceService: {
        updateUserOnlineStatus: jest.fn<any>().mockResolvedValue(undefined),
        updateAnonymousOnlineStatus: jest.fn<any>().mockResolvedValue(undefined),
      },
      callService: { leaveCall: jest.fn<any>().mockResolvedValue(undefined) },
      connectedUsers,
      socketToUser: new Map(),
      userSockets: new Map(),
    } as any);
    jest.spyOn(jwt, 'verify').mockReturnValue({ sid: LIVE_SID, userId: 'aaaaaaaaaaaaaaaaaaaa0123' } as any);
  });

  afterEach(() => { jest.restoreAllMocks(); });

  const registered = async (join: jest.Mock, conversationIds = ['conv-aaa']) => {
    jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue({
      id: 'aaaaaaaaaaaaaaaaaaaa0123', systemLanguage: 'en',
      regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null,
    } as any);
    jest.spyOn((mockPrisma as any).participant, 'findMany').mockResolvedValue(
      conversationIds.map((conversationId) => ({ conversationId })) as any,
    );
    await authHandler.handleTokenAuthentication(
      createMockSocket({ handshake: { auth: { token: 'valid-jwt-token' } }, join }),
    );
  };

  const marker = () => [...connectedUsers.values()][0]?.unreachableConversations;

  it('porte_le_marqueur_quand_la_room_echoue_definitivement', async () => {
    await registered(jest.fn<any>().mockRejectedValue(new Error('adapter down')));

    // Toujours inscrite — c'est ce qui porte la présence et le nettoyage.
    expect(connectedUsers.size).toBe(1);
    expect(marker()).toEqual(new Set(['conv-aaa']));
  });

  /**
   * Le cas NOMINAL, et il n'est pas décoratif : sans lui, le témoin ci-dessus
   * ne distingue pas « marque toujours » de « marque juste ».
   */
  it('ne_laisse_aucun_marqueur_quand_la_jonction_reussit', async () => {
    await registered(jest.fn<any>().mockResolvedValue(undefined));

    expect(connectedUsers.size).toBe(1);
    expect(marker()).toBeUndefined();
  });

  /**
   * Un inscrit joint TOUTES ses conversations d'un coup : l'échec est PARTIEL
   * par construction, et le marqueur ne doit nommer que les rooms échouées —
   * marquer tout le compte priverait de temps réel les conversations saines.
   */
  it('ne_marque_que_les_conversations_dont_la_room_a_echoue', async () => {
    const join = jest.fn<any>().mockImplementation(async (room: string) => {
      if (room === 'conversation:conv-rouge') throw new Error('adapter down');
    });

    await registered(join, ['conv-verte', 'conv-rouge']);

    expect(marker()).toEqual(new Set(['conv-rouge']));
  });

  /**
   * #16687 a fermé l'échec d'une JONCTION et laissé ouvert, juste à côté,
   * l'échec de la LECTURE qui la précède — le seul `throw` que le `try` de
   * `_joinUserConversations` puisse attraper, `Promise.allSettled` ne rejetant
   * pas. Son `catch` rendait `[]`, et `[]` AFFIRME « aucune room n'a échoué »
   * quand la vérité est « je n'ai rejoint AUCUNE room, je ne sais même pas
   * lesquelles ». La socket entrait donc dans `connectedUsers` sans aucun
   * marqueur, dans zéro room de conversation : la file la tenait pour
   * joignable et n'enfilait RIEN, pendant que `io.to(ROOMS.conversation(...))`
   * n'atteignait personne. Pour TOUTE la vie de cette socket, et sans recours
   * — ce qui n'a pas été enfilé n'existe nulle part, donc la reconnexion
   * suivante n'a rien à rejouer.
   *
   * La jumelle porte la leçon mot pour mot (`participant-superset.ts`) :
   * « Elle rend `undefined` — jamais `[]` — quand elle tombe. Les deux formes
   * se lisent pareil au site d'appel et ne disent pas la même chose : `[]`
   * AFFIRME …, `undefined` avoue qu'on ne sait pas. »
   *
   * Un ensemble de rooms ne peut pas dire « toutes, dont je ne connais pas la
   * liste » : c'est `allConversationRoomsUnreachable` qui le dit, et la file
   * le lit comme injoignable pour n'importe quelle conversation.
   */
  it('avoue_son_ignorance_quand_la_LECTURE_des_conversations_tombe', async () => {
    jest.spyOn(mockPrisma.user, 'findUnique').mockResolvedValue({
      id: 'aaaaaaaaaaaaaaaaaaaa0123', systemLanguage: 'en',
      regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null,
    } as any);
    jest
      .spyOn((mockPrisma as any).participant, 'findMany')
      .mockRejectedValue(new Error('mongo down'));

    const join = jest.fn<any>().mockResolvedValue(undefined);
    await authHandler.handleTokenAuthentication(
      createMockSocket({ handshake: { auth: { token: 'valid-jwt-token' } }, join }),
    );

    // Toujours inscrite, pour la même raison que #16687 : c'est elle qui porte
    // la présence et le nettoyage à la déconnexion.
    expect(connectedUsers.size).toBe(1);
    // Aucune room de conversation n'a été rejointe — la lecture est tombée
    // AVANT la jonction.
    expect(join.mock.calls.filter(([room]) => String(room).startsWith('conversation:'))).toEqual([]);
    // Et la socket le DIT, au lieu d'affirmer que tout va bien.
    expect([...connectedUsers.values()][0]?.allConversationRoomsUnreachable).toBe(true);
  });

  it('ne_pretend_pas_tout_injoignable_quand_la_lecture_reussit', async () => {
    await registered(jest.fn<any>().mockResolvedValue(undefined));

    expect([...connectedUsers.values()][0]?.allConversationRoomsUnreachable).toBeUndefined();
  });

  /**
   * L'invité de lien n'a qu'UNE conversation : « une room échouée » vaut la
   * TOTALITÉ de sa livraison temps réel, et la file est son seul recours.
   */
  it('marque_aussi_la_porte_invitee', async () => {
    jest.spyOn((mockPrisma as any).participant, 'findFirst').mockResolvedValue({
      id: 'anon-123', isActive: true, displayName: 'Anonymous',
      language: 'en', conversationId: 'conv-guest',
    } as any);

    await authHandler.handleTokenAuthentication(createMockSocket({
      handshake: { auth: { sessionToken: 'anon-session-123' } },
      join: jest.fn<any>().mockRejectedValue(new Error('adapter down')),
    }));

    expect(connectedUsers.has('anon-123')).toBe(true);
    expect(connectedUsers.get('anon-123').unreachableConversations).toEqual(new Set(['conv-guest']));
  });
});
