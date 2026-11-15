/**
 * Témoin #10852 — un `messageId` qui n'est pas un ObjectId est refusé en 400,
 * jamais en 500.
 *
 * Production, 7 jours avant le 2026-10-16 : 213 `POST /api/v1/reactions` en
 * 500, tous de la même adresse, tous sur des ids de FIXTURE (`msg-swap`,
 * `msg-mine`, `msg-react`). La route passait l'id tel quel à
 * `prisma.message.findUnique`, et Prisma lève `P2023 Malformed ObjectID` :
 * l'erreur retombait sur le `sendInternalError` du bas. Un 500 est TRANSITOIRE
 * pour l'outbox iOS, qui réessaie avec backoff — d'où des centaines de
 * relances pour une poignée de gestes. Un 400 est un rejet PERMANENT : l'outbox
 * l'écarte au premier essai, y compris chez un client déjà publié.
 *
 * Le stub Prisma reproduit le comportement de production : il LÈVE sur un id
 * mal formé. Les témoins portent sur le code servi ET sur l'absence de toute
 * lecture ou écriture.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

const mockAddReaction = jest.fn<any>();
const mockRemoveReaction = jest.fn<any>();
const mockGetMessageReactions = jest.fn<any>();
const mockCreateUpdateEvent = jest.fn<any>().mockResolvedValue({});

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (req: any) => {
    req.authContext = {
      type: 'jwt',
      isAnonymous: false,
      userId: '68f2a81417a557e8ce4ddfc1',
      participantId: undefined,
    };
  },
  UnifiedAuthRequest: {},
}));

jest.mock('../../../services/ReactionService', () => ({
  ...(jest.requireActual('../../../services/ReactionService') as object),
  ReactionService: jest.fn<any>().mockImplementation(() => ({
    addReaction: (...args: any[]) => mockAddReaction(...args),
    removeReaction: (...args: any[]) => mockRemoveReaction(...args),
    getMessageReactions: (...args: any[]) => mockGetMessageReactions(...args),
    createUpdateEvent: (...args: any[]) => mockCreateUpdateEvent(...args),
  })),
}));

jest.mock('../../../services/notifications/reactionNotify', () => ({
  notifyReactionAdded: jest.fn<any>().mockResolvedValue(undefined),
  notifyReactionRemoved: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.mock('../../../socketio/broadcastReactionMutation', () => ({
  broadcastReactionMutation: jest.fn<any>().mockResolvedValue(undefined),
}));

import reactionRoutes from '../../../routes/reactions';

const MESSAGE_ID = '507f1f77bcf86cd799439011';
const CONVERSATION_ID = '507f1f77bcf86cd799439022';
const PARTICIPANT_ID = '507f1f77bcf86cd799439033';
const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

const prismaRejectingMalformedIds = () => {
  const findUnique = jest.fn<any>(async ({ where }: { where: { id: string } }) => {
    if (!OBJECT_ID.test(where.id)) {
      throw Object.assign(
        new Error(`Inconsistent column data: Malformed ObjectID: invalid character 'm' was found at index 0 in the provided hex string: "${where.id}".`),
        { code: 'P2023' }
      );
    }
    return { conversationId: CONVERSATION_ID };
  });
  const findFirst = jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID });
  return { message: { findUnique }, participant: { findFirst } };
};

async function buildApp(prisma: ReturnType<typeof prismaRejectingMalformedIds>): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.decorate('socketIOHandler', { getManager: () => ({}) } as never);
  app.decorate('notificationService', {} as never);
  await app.register(reactionRoutes);
  await app.ready();
  return app;
}

describe('#10852 — un messageId qui n\'est pas un ObjectId est refusé en 400, sans toucher la base', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof prismaRejectingMalformedIds>;

  beforeEach(async () => {
    mockAddReaction.mockReset();
    mockRemoveReaction.mockReset();
    mockGetMessageReactions.mockReset();
    prisma = prismaRejectingMalformedIds();
    app = await buildApp(prisma);
  });

  afterEach(async () => {
    await app.close();
  });

  it.each(['msg-swap', 'msg-mine', 'msg-react'])(
    'POST /reactions avec l\'id de production « %s » rend 400 et n\'écrit rien',
    async (messageId) => {
      const res = await app.inject({
        method: 'POST',
        url: '/reactions',
        payload: { messageId, emoji: '👍' },
      });

      expect(res.statusCode).toBe(400);
      expect(prisma.message.findUnique).not.toHaveBeenCalled();
      expect(mockAddReaction).not.toHaveBeenCalled();
    }
  );

  it('DELETE /reactions/:messageId/:emoji avec un id mal formé rend 400 et ne retire rien', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/reactions/msg-swap/${encodeURIComponent('👍')}`,
    });

    expect(res.statusCode).toBe(400);
    expect(prisma.message.findUnique).not.toHaveBeenCalled();
    expect(mockRemoveReaction).not.toHaveBeenCalled();
  });

  it('GET /reactions/:messageId avec un id mal formé rend 400 et ne lit rien', async () => {
    const res = await app.inject({ method: 'GET', url: '/reactions/msg-swap' });

    expect(res.statusCode).toBe(400);
    expect(prisma.message.findUnique).not.toHaveBeenCalled();
    expect(mockGetMessageReactions).not.toHaveBeenCalled();
  });

  it('un ajout VALIDE rend 201, sert la réaction écrite, et l\'écrit sur le bon message', async () => {
    mockAddReaction.mockResolvedValue({
      reaction: {
        id: '507f1f77bcf86cd799439044',
        messageId: MESSAGE_ID,
        participantId: PARTICIPANT_ID,
        emoji: '👍',
        createdAt: new Date('2026-10-16T21:49:04.582Z'),
        updatedAt: new Date('2026-10-16T21:49:04.582Z'),
      },
      unchanged: false,
    });

    const res = await app.inject({
      method: 'POST',
      url: '/reactions',
      payload: { messageId: MESSAGE_ID, emoji: '👍' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ messageId: MESSAGE_ID, emoji: '👍' });
    expect(mockAddReaction).toHaveBeenCalledWith({
      messageId: MESSAGE_ID,
      emoji: '👍',
      participantId: PARTICIPANT_ID,
    });
  });
});
