/**
 * #20717 — LA SALLE D'UNE PUBLICATION NE S'OUVRE PLUS À QUI UN BLOCAGE SÉPARE
 * DE SON AUTEUR, ET LE DÉCOMPTE DE SES RÉACTIONS NON PLUS.
 *
 * Ces deux témoins vivent dans un fichier à eux, et ce n'est pas un choix de
 * rangement : `PostReactionHandler.test.ts` est HORS BUDGET depuis longtemps
 * (dette héritée figée à 1482 lignes par `gateway-test-file-size-budget`), et
 * le dépôt interdit d'ajouter à un fichier hors budget — « on extrait d'abord,
 * on ajoute ensuite ». Le lot #20717 y avait ajouté ses deux témoins et fait
 * rougir le cliquet ; les voici chez eux.
 *
 * ─── CE QU'ILS PROUVENT, ET QUE LE TÉMOIN UNITAIRE NE PEUT PAS ───────────
 *
 * `postConsumptionSeparation.test.ts` prouve que `canUserConsumePost` REFUSE un
 * lecteur séparé. Il ne prouve pas que `post:join` le CONSULTE. C'est la
 * question « qui AFFICHE ce que le résolveur élit ? » (cycle 122) posée à une
 * garde : un correctif dont la valeur n'atteint aucun appelant n'a fermé
 * aucune porte.
 *
 * Le rang `PUBLIC` est le SEUL où ces témoins peuvent tomber : sur `FRIENDS` ou
 * `ONLY`, l'amitié rompue ou la liste refuseraient déjà le lecteur, et
 * l'assertion passerait sans rien dire de la séparation (leçon 261).
 *
 * Le refus est INDISTINCT (« Post not found ») : il ne révèle pas le blocage,
 * exactement comme l'absence et la suppression.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../../../services/PostReactionService', () => ({ PostReactionService: jest.fn() }));
jest.mock('../../../services/notifications/NotificationService', () => ({ NotificationService: jest.fn() }));
jest.mock('../../../validation/socket-event-schemas', () => ({
  SocketPostReactionAddSchema: { safeParse: jest.fn() },
  SocketPostReactionRemoveSchema: { safeParse: jest.fn() },
  SocketPostRoomActionSchema: { safeParse: jest.fn() },
  SocketPostReactionRequestSyncSchema: { safeParse: jest.fn() },
}));
jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn(),
  isValidationFailure: jest.fn((r: { success: boolean }) => !r.success),
}));
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn().mockReturnValue({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

const mockCheckLimit = jest.fn<() => Promise<boolean>>();
jest.mock('../../../utils/socket-rate-limiter', () => ({
  SocketRateLimiter: jest.fn().mockImplementation(() => ({ checkLimit: mockCheckLimit, destroy: jest.fn() })),
  SOCKET_RATE_LIMITS: { MESSAGE_SEND: { maxRequests: 20, windowMs: 60000, keyPrefix: 'socket:message:send' } },
}));

import { PostReactionHandler } from '../../../socketio/handlers/PostReactionHandler';
import { validateSocketEvent } from '../../../middleware/validation';

const POST_ID = '507f1f77bcf86cd799439022';
const USER_ID = '507f1f77bcf86cd799439033';
const AUTHOR_ID = '507f1f77bcf86cd799439044';
const SOCKET_ID = 'socket-abc-123';

const mockValidate = validateSocketEvent as unknown as jest.Mock;

const createMockSocket = () => ({ id: SOCKET_ID, emit: jest.fn(), join: jest.fn(), leave: jest.fn() });

/**
 * Le double répond sur la clause `where.OR` d'`isBlockedBetween` plutôt que par
 * une valeur fixe : un double qui dirait « bloqué » quoi qu'on lui demande
 * resterait vert sous une mutation qui interroge la MAUVAISE paire
 * (`[post.id]` au lieu de `[post.authorId]`, par exemple). Lire la clause est
 * ce qui rend ces témoins capables de distinguer « la garde est posée » de
 * « la garde est posée sur le bon sujet ».
 */
const createMockPrisma = (separatedFromAuthor: boolean) => ({
  post: {
    findUnique: jest.fn<any>().mockResolvedValue(null),
    findFirst: jest.fn<any>().mockResolvedValue({
      id: POST_ID,
      authorId: AUTHOR_ID,
      visibility: 'PUBLIC',
      visibilityUserIds: [],
      isQuote: false,
      repostOfId: null,
      originalRepostOfId: null,
    }),
  },
  postComment: { findFirst: jest.fn<any>().mockResolvedValue(null) },
  user: {
    findFirst: jest.fn<any>(async ({ where }: any) => {
      const pair = (where.OR as ReadonlyArray<{ id: string; blockedUserIds: { has: string } }>);
      const namesTheAuthor = pair.some((c) => c.id === AUTHOR_ID || c.blockedUserIds.has === AUTHOR_ID);
      const namesTheReader = pair.some((c) => c.id === USER_ID || c.blockedUserIds.has === USER_ID);
      return separatedFromAuthor && namesTheAuthor && namesTheReader ? { id: AUTHOR_ID } : null;
    }),
    findMany: jest.fn<any>().mockResolvedValue([]),
    findUnique: jest.fn<any>().mockResolvedValue({ blockedUserIds: [] }),
  },
  userRelation: { findUnique: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
  friendRequest: { findFirst: jest.fn<any>().mockResolvedValue(null) },
  communityMember: { findMany: jest.fn<any>().mockResolvedValue([]), findFirst: jest.fn<any>().mockResolvedValue(null) },
  participant: { findMany: jest.fn<any>().mockResolvedValue([]), findFirst: jest.fn<any>().mockResolvedValue(null) },
}) as any;

const build = (separatedFromAuthor: boolean) => {
  const prisma = createMockPrisma(separatedFromAuthor);
  const reactionService = { getPostReactions: jest.fn<any>().mockResolvedValue({ reactions: [] }) } as any;
  const connectedUsers = new Map([[USER_ID, { id: USER_ID, socketId: SOCKET_ID, isAnonymous: false, language: 'fr' }]]);
  const handler = new PostReactionHandler({
    io: { to: jest.fn().mockReturnValue({ emit: jest.fn() }), emit: jest.fn() } as any,
    prisma,
    notificationService: { createPostLikeNotification: jest.fn() } as any,
    postReactionService: reactionService,
    connectedUsers: connectedUsers as any,
    socketToUser: new Map([[SOCKET_ID, USER_ID]]),
    socialEvents: { broadcastPostLiked: jest.fn(), broadcastPostUnliked: jest.fn(), activitySeparation: jest.fn(async () => [] as string[]) } as any,
  });
  return { handler, prisma, reactionService };
};

describe('#20717 — `post:join` et la séparation par blocage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCheckLimit.mockResolvedValue(true);
    mockValidate.mockReturnValue({ success: true, data: { postId: POST_ID } });
  });

  it('test_handleJoinPost_publicPost_readerSeparatedByBlock_forbidden', async () => {
    const { handler } = build(true);
    const socket = createMockSocket();
    const callback = jest.fn();

    await handler.handleJoinPost(socket as any, { postId: POST_ID }, callback);

    expect(socket.join).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith({ success: false, error: 'Post not found' });
  });

  /** Contrôle positif : sans lui, un refus universel passerait pour la règle. */
  it('test_handleJoinPost_publicPost_noBlock_joinsRoom', async () => {
    const { handler } = build(false);
    const socket = createMockSocket();
    const callback = jest.fn();

    await handler.handleJoinPost(socket as any, { postId: POST_ID }, callback);

    expect(socket.join).toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith({ success: true });
  });

  /**
   * La MÊME porte garde la synchronisation des réactions : sans elle, il
   * suffisait de DEMANDER l'état au lieu de s'abonner.
   */
  it('test_handleRequestSync_publicPost_readerSeparatedByBlock_forbidden', async () => {
    const { handler, reactionService } = build(true);
    const socket = createMockSocket();
    const callback = jest.fn();

    await handler.handleRequestSync(socket as any, { postId: POST_ID }, callback);

    expect(reactionService.getPostReactions).not.toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith({ success: false, error: 'Post not found' });
  });

  it('test_handleRequestSync_publicPost_noBlock_servesAggregation', async () => {
    const { handler, reactionService } = build(false);
    const socket = createMockSocket();
    const callback = jest.fn();

    await handler.handleRequestSync(socket as any, { postId: POST_ID }, callback);

    expect(reactionService.getPostReactions).toHaveBeenCalled();
    expect(callback).toHaveBeenCalledWith({ success: true, data: { reactions: [] } });
  });
});
