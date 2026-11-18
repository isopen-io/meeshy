/**
 * Les ÉCRITURES REST de réaction n'ouvrent qu'à une participation VIVANTE (#19525).
 *
 * `POST /reactions` et `DELETE /reactions/:messageId/:emoji` résolvent le
 * participant de l'appelant quand le contexte d'auth n'en porte pas — ce qui est
 * le cas NOMINAL d'un inscrit : `middleware/auth.ts` ne pose `participantId` que
 * pour un invité de lien. Les deux lookups épelaient `isActive: true` NU au lieu
 * de la loi partagée `PARTICIPATION_VIVANTE` (active ET `bannedAt` nul ou absent).
 *
 * ─── Pourquoi ce fichier existe, et c'est une leçon du lot ─────────────────
 *
 * La suite historique `reactions-routes.test.ts` porte DEUX assertions de
 * projection : une sur le POST, une sur le GET. **Le DELETE n'en avait aucune**,
 * et le trou était structurel : son `makeAuthContext()` donne par DÉFAUT un
 * `participantId` à un contexte `registered` — une forme que la production ne
 * produit jamais — si bien que ses quatorze témoins de DELETE n'entrent JAMAIS
 * dans la branche de résolution. Mesuré : remettre ce seul site au défaut
 * laissait 892 témoins de réaction et 329 témoins de sécurité VERTS.
 *
 * C'est « un double mente aussi par ce qu'il ACCEPTE » (cycle 112) appliqué au
 * contexte d'AUTH, et c'est l'audit adversarial du lot qui l'a relevé — après
 * que le lot se soit attribué la leçon inverse sur un autre de ses sites.
 *
 * Les témoins vivent ICI et non là-bas parce que `reactions-routes.test.ts` est
 * à 1 250 lignes, hors budget : on extrait avant d'ajouter.
 *
 * Deux témoins par porte, aucun ne subsumant l'autre : la PROJECTION voit le
 * `where`, le COMPORTEMENT voit ce que la route FAIT du verdict — et il passe
 * par un double qui honore le `where`, sans quoi il resterait vert sur une porte
 * aveugle.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockAddReaction = jest.fn<any>();
const mockRemoveReaction = jest.fn<any>();
const mockSendSuccess = jest.fn<any>((reply: any, data: any, opts?: any) => {
  reply.statusCode = opts?.statusCode ?? 200;
  reply._body = data;
  return reply;
});
const mockSendForbidden = jest.fn<any>((reply: any, msg: any) => {
  reply.statusCode = 403;
  reply._body = msg;
  return reply;
});
const mockSendNotFound = jest.fn<any>((reply: any, msg: any) => {
  reply.statusCode = 404;
  reply._body = msg;
  return reply;
});

jest.mock('../../../services/ReactionService', () => ({
  ReactionService: jest.fn<any>().mockImplementation(() => ({
    addReaction: (...a: any[]) => mockAddReaction(...a),
    removeReaction: (...a: any[]) => mockRemoveReaction(...a),
    getMessageReactions: jest.fn(),
    getParticipantReactions: jest.fn(),
    getUserReactions: jest.fn(),
    createUpdateEvent: jest.fn<any>(async () => ({ messageId: 'm' })),
  })),
}));

jest.mock('../../../services/notifications/reactionNotify', () => ({
  notifyReactionAdded: jest.fn(),
  notifyReactionRemoved: jest.fn(),
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
  sendInternalError: jest.fn(),
  sendConflict: jest.fn(),
}));

// Les schémas PARTAGÉS ne sont PAS bouchonnés — un bouchon de schéma de RÉPONSE
// désarme fast-json-stringify, et le cliquet `response-schema-stub-ratchet` le
// gèle pour la dette héritée sans l'autoriser aux suites neuves.

import reactionRoutes from '../../../routes/reactions';
import { PARTICIPATION_VIVANTE } from '../../../routes/conversations/utils/access-control';
import { findFirstIn } from '../../helpers/mongo-where';

const USER_ID = '507f1f77bcf86cd799439011';
const MESSAGE_ID = '507f1f77bcf86cd799439022';
const CONV_ID = '507f1f77bcf86cd799439033';
const PARTICIPANT_ID = '507f1f77bcf86cd799439044';

type MembershipRow = {
  readonly id: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly isActive: boolean;
  /** `undefined` = colonne ABSENTE, l'état de tout participant jamais banni. */
  readonly bannedAt?: Date | null;
};

const bannedButActive: MembershipRow = {
  id: PARTICIPANT_ID,
  userId: USER_ID,
  conversationId: CONV_ID,
  isActive: true,
  bannedAt: new Date('2026-11-01T00:00:00.000Z'),
};

const living: MembershipRow = {
  id: PARTICIPANT_ID,
  userId: USER_ID,
  conversationId: CONV_ID,
  isActive: true,
};

/**
 * Le double honore son `where` par la sémantique PARTAGÉE du dépôt
 * (`matchesMongoWhere`), qui connaît `isSet` et traite une clé ABSENTE comme
 * absente — jamais comme nulle.
 */
const honouring = (row: MembershipRow) => jest.fn<any>(findFirstIn([row as Record<string, unknown>]));

function setup(findFirst: jest.Mock<any>) {
  const routes: Record<string, Record<string, any>> = {};
  const fastify: any = {
    prisma: {
      message: {
        findUnique: jest.fn<any>().mockResolvedValue({ id: MESSAGE_ID, conversationId: CONV_ID, senderId: 'p-sender' }),
        findFirst: jest.fn<any>(),
      },
      participant: { findFirst },
      reaction: { findFirst: jest.fn<any>(), findMany: jest.fn<any>().mockResolvedValue([]) },
    },
    notificationService: {},
    log: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    post: jest.fn<any>((p: string, _o: any, h: any) => { (routes['POST'] ??= {})[p] = h; }),
    get: jest.fn<any>((p: string, _o: any, h: any) => { (routes['GET'] ??= {})[p] = h; }),
    delete: jest.fn<any>((p: string, _o: any, h: any) => { (routes['DELETE'] ??= {})[p] = h; }),
    socketIOHandler: {
      getManager: () => ({
        getIO: () => ({ to: () => ({ emit: jest.fn() }) }),
        enqueueOfflineReactionMutation: jest.fn<any>(async () => {}),
      }),
    },
  };
  reactionRoutes(fastify as never);
  const reply: any = { statusCode: 200, _body: undefined, status: jest.fn(), send: jest.fn(), header: jest.fn() };
  return {
    fastify,
    reply,
    post: routes['POST']['/reactions'],
    remove: routes['DELETE']['/reactions/:messageId/:emoji'],
  };
}

/**
 * Le contexte d'un INSCRIT, tel que la production le compose : **sans
 * `participantId`**. C'est ce qui fait entrer la route dans sa branche de
 * résolution — et c'est précisément ce que le défaut par défaut de la suite
 * voisine masquait.
 */
const registeredRequest = (extra: Record<string, unknown> = {}) => ({
  params: { messageId: MESSAGE_ID, emoji: '👍' },
  body: { messageId: MESSAGE_ID, emoji: '👍' },
  authContext: { type: 'registered', isAnonymous: false, userId: USER_ID, hasFullAccess: true },
  ...extra,
});

describe('les écritures REST de réaction exigent une participation VIVANTE (#19525)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddReaction.mockResolvedValue({ reaction: { id: 'r1', emoji: '👍' } });
    mockRemoveReaction.mockResolvedValue(true);
  });

  describe('POST /reactions', () => {
    it('la PROJECTION — le `where` porte la loi', async () => {
      const findFirst = honouring(living);
      const { post, reply } = setup(findFirst);

      await post(registeredRequest(), reply);

      expect(findFirst).toHaveBeenCalledWith({
        where: { userId: USER_ID, conversationId: CONV_ID, ...PARTICIPATION_VIVANTE },
        select: { id: true },
      });
    });

    it("le COMPORTEMENT — un membre ACTIF et BANNI est refusé, et rien n'est persisté", async () => {
      const { post, reply } = setup(honouring(bannedButActive));

      await post(registeredRequest(), reply);

      expect(reply.statusCode).toBe(403);
      expect(mockAddReaction).not.toHaveBeenCalled();
    });

    it('CONTRÔLE — un membre vivant est servi', async () => {
      const { post, reply } = setup(honouring(living));

      await post(registeredRequest(), reply);

      // L'EFFET, jamais le statut : « `statusCode` n'est pas une observation de
      // la charge utile » (§ CLAUDE.md). Le refus, lui, EST un statut — c'est
      // pourquoi les témoins de refus ci-dessus assertent bien 403.
      expect(mockAddReaction).toHaveBeenCalledWith(expect.objectContaining({ participantId: PARTICIPANT_ID }));
    });
  });

  /**
   * La porte que RIEN ne tenait. Les trois témoins ci-dessous sont la réparation
   * du constat bloquant de l'audit adversarial.
   */
  describe('DELETE /reactions/:messageId/:emoji', () => {
    it('la PROJECTION — le `where` porte la loi', async () => {
      const findFirst = honouring(living);
      const { remove, reply } = setup(findFirst);

      await remove(registeredRequest(), reply);

      expect(findFirst).toHaveBeenCalledWith({
        where: { userId: USER_ID, conversationId: CONV_ID, ...PARTICIPATION_VIVANTE },
        select: { id: true },
      });
    });

    it('le COMPORTEMENT — un membre ACTIF et BANNI est refusé, et rien ne se retire', async () => {
      const { remove, reply } = setup(honouring(bannedButActive));

      await remove(registeredRequest(), reply);

      expect(reply.statusCode).toBe(403);
      expect(mockRemoveReaction).not.toHaveBeenCalled();
    });

    it('CONTRÔLE — un membre vivant retire bien sa réaction', async () => {
      const { remove, reply } = setup(honouring(living));

      await remove(registeredRequest(), reply);

      expect(mockRemoveReaction).toHaveBeenCalledWith(expect.objectContaining({ participantId: PARTICIPANT_ID }));
    });
  });

  /**
   * L'AUTRE moitié de la loi, aux deux portes : un membre SORTI
   * (`isActive: false`) est refusé autant qu'un banni. Sans ces deux témoins,
   * une loi amputée de `isActive` laissait toute la suite verte.
   */
  describe('la seconde moitié de la loi — le membre SORTI', () => {
    it('refuse le POST', async () => {
      const { post, reply } = setup(honouring({ ...living, isActive: false }));

      await post(registeredRequest(), reply);

      expect(reply.statusCode).toBe(403);
      expect(mockAddReaction).not.toHaveBeenCalled();
    });

    it('refuse le DELETE', async () => {
      const { remove, reply } = setup(honouring({ ...living, isActive: false }));

      await remove(registeredRequest(), reply);

      expect(reply.statusCode).toBe(403);
      expect(mockRemoveReaction).not.toHaveBeenCalled();
    });
  });
});
