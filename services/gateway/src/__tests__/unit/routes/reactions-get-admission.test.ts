/**
 * `GET /reactions/:messageId` n'admet qu'un lecteur ADMIS — actif, jamais banni.
 *
 * Les deux ÉCRITURES du même fichier l'exigeaient déjà
 * (`where: { userId, conversationId, isActive: true }`, l. 158 et 354) ; la
 * LECTURE décidait sur la liste NON filtrée :
 *
 *     message.conversation.participants.some(m => m.userId === userId)
 *
 * Or quitter (`leave.ts`), être retiré (`participant-removal.ts`), être banni
 * (`participant-ban-core.ts`) et la suppression pour soi posent tous
 * `isActive: false` et GARDENT la ligne. Un membre banni conservait donc l'accès
 * au trombinoscope des réactions — par emoji : le compte, les `participantIds`,
 * et pour chaque réacteur son `displayName`, son `avatar`, son `userId`
 * (`ReactionService.getMessageReactions`) — et apprenait au passage que le
 * message existe toujours. Fail-OPEN, dans le seul sens qui coûte.
 *
 * La garde est posée dans le `where` de la lecture, avec la loi PARTAGÉE du
 * dépôt (`ADMITTED_FILE_READER_WHERE`), que son doc-comment destine exactement à
 * cet usage : « À répandre dans le `where` d'une lecture `Participant` ». Le
 * témoin assert donc sur la REQUÊTE — un double Prisma rend ce qu'on lui dit
 * quel que soit le `where`, donc un témoin posé sur la réponse ne pourrait pas
 * tomber.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockGetMessageReactions = jest.fn<any>();
const mockSendSuccess = jest.fn<any>((reply: any, data: any) => { reply.statusCode = 200; reply._body = data; return reply; });
const mockSendForbidden = jest.fn<any>((reply: any, msg: any) => { reply.statusCode = 403; reply._body = msg; return reply; });
const mockSendNotFound = jest.fn<any>((reply: any, msg: any) => { reply.statusCode = 404; reply._body = msg; return reply; });
const mockSendInternalError = jest.fn<any>((reply: any, msg: any) => { reply.statusCode = 500; reply._body = msg; return reply; });

jest.mock('../../../services/ReactionService', () => ({
  ReactionService: jest.fn<any>().mockImplementation(() => ({
    addReaction: jest.fn(), removeReaction: jest.fn(),
    getMessageReactions: (...a: any[]) => mockGetMessageReactions(...a),
    getParticipantReactions: jest.fn(), getUserReactions: jest.fn(), createUpdateEvent: jest.fn(),
  })),
}));

jest.mock('../../../services/notifications/reactionNotify', () => ({
  notifyReactionAdded: jest.fn(), notifyReactionRemoved: jest.fn(),
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn<any>().mockReturnValue(jest.fn<any>()),
  UnifiedAuthRequest: {},
}));

jest.mock('../../../utils/response', () => ({
  sendSuccess: (...a: any[]) => mockSendSuccess(...a),
  sendBadRequest: jest.fn(),
  sendForbidden: (...a: any[]) => mockSendForbidden(...a),
  sendNotFound: (...a: any[]) => mockSendNotFound(...a),
  sendInternalError: (...a: any[]) => mockSendInternalError(...a),
  sendConflict: jest.fn(),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  reactionSchema: {}, reactionSummarySchema: {}, addReactionRequestSchema: {}, errorResponseSchema: {},
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: { REACTION_ADDED: 'reaction:added', REACTION_REMOVED: 'reaction:removed' },
  ROOMS: { conversation: (id: string) => `conversation:${id}` },
}));

import reactionRoutes from '../../../routes/reactions';
import { ADMITTED_FILE_READER_WHERE } from '../../../services/attachments/fileReaderAdmission';

const USER_ID = '507f1f77bcf86cd799439011';
const MESSAGE_ID = '507f1f77bcf86cd799439022';
const CONV_ID = '507f1f77bcf86cd799439033';
const PARTICIPANT_ID = '507f1f77bcf86cd799439044';

function setup() {
  const routes: Record<string, Record<string, any>> = {};
  const fastify: any = {
    prisma: {
      message: { findUnique: jest.fn<any>(), findFirst: jest.fn<any>() },
      participant: { findFirst: jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID }) },
    },
    notificationService: {},
    log: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    post: jest.fn<any>((p: string, _o: any, h: any) => { (routes['POST'] ??= {})[p] = h; }),
    get: jest.fn<any>((p: string, _o: any, h: any) => { (routes['GET'] ??= {})[p] = h; }),
    delete: jest.fn<any>((p: string, _o: any, h: any) => { (routes['DELETE'] ??= {})[p] = h; }),
    socketIOHandler: { getManager: () => ({ getIO: () => ({ to: () => ({ emit: jest.fn() }) }), enqueueOfflineReactionMutation: jest.fn<any>(async () => {}) }) },
  };
  reactionRoutes(fastify as never);
  const reply: any = { statusCode: 200, _body: undefined, status: jest.fn(), send: jest.fn(), header: jest.fn() };
  return { fastify, reply, handler: routes['GET']['/reactions/:messageId'] };
}

const request = () => ({
  params: { messageId: MESSAGE_ID },
  authContext: { userId: USER_ID, isAnonymous: false, participantId: PARTICIPANT_ID },
});

/** Un message ordinaire : `captureNoticeWithheldFrom` n'a rien à retenir. */
const ordinaryMessage = (participants: unknown[]) => ({
  id: MESSAGE_ID,
  conversationId: CONV_ID,
  senderId: 'p-sender',
  messageType: 'text',
  metadata: null,
  conversation: { participants },
});

describe('GET /reactions/:messageId — la lecture n’admet qu’un lecteur ADMIS', () => {
  beforeEach(() => jest.clearAllMocks());

  it('demande la loi partagée d’admission dans le `where` des participants', async () => {
    const { fastify, reply, handler } = setup();
    fastify.prisma.message.findUnique.mockResolvedValue(
      ordinaryMessage([{ id: PARTICIPANT_ID, userId: USER_ID, isActive: true }])
    );
    mockGetMessageReactions.mockResolvedValue({ messageId: MESSAGE_ID, reactions: [] });

    await handler(request(), reply);

    const [args] = fastify.prisma.message.findUnique.mock.calls[0] as [any];
    expect(args.include.conversation.include.participants).toEqual(
      expect.objectContaining({ where: ADMITTED_FILE_READER_WHERE })
    );
  });

  it('refuse quand la lecture ADMISE ne rend aucune participation du lecteur', async () => {
    const { fastify, reply, handler } = setup();
    // Ce que la base rend une fois la loi appliquée à un banni / parti / retiré :
    // sa ligne existe, mais elle n'est pas ADMISE, donc elle n'est pas là.
    fastify.prisma.message.findUnique.mockResolvedValue(ordinaryMessage([]));

    await handler(request(), reply);

    expect(mockSendForbidden).toHaveBeenCalled();
    expect(reply.statusCode).toBe(403);
    expect(mockGetMessageReactions).not.toHaveBeenCalled();
  });

  it('CONTRÔLE — un membre admis est servi', async () => {
    const { fastify, reply, handler } = setup();
    fastify.prisma.message.findUnique.mockResolvedValue(
      ordinaryMessage([{ id: PARTICIPANT_ID, userId: USER_ID, isActive: true }])
    );
    mockGetMessageReactions.mockResolvedValue({ messageId: MESSAGE_ID, reactions: [] });

    await handler(request(), reply);

    expect(reply.statusCode).toBe(200);
    expect(mockGetMessageReactions).toHaveBeenCalled();
  });
});
