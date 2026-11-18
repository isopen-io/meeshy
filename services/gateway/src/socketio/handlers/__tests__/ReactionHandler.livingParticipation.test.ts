/**
 * La porte des réactions de MESSAGE exige une participation VIVANTE (#19525).
 *
 * `_resolveParticipantId` est la porte UNIQUE des trois surfaces de réaction —
 * `reaction:add`, `reaction:remove` et `reaction:request-sync`. Elle épelait
 * `isActive: true` NU, quand la loi du dépôt est `PARTICIPATION_VIVANTE` :
 * active **et** `bannedAt` nul ou absent (`routes/conversations/utils/access-control.ts`,
 * #7389). Sa jumelle, la réaction de PIÈCE JOINTE, applique la loi par
 * `resolveParticipant` (`socketio/utils/participant-resolver.ts`).
 *
 * ─── DEUX témoins par porte, et aucun ne subsume l'autre ──────────────────
 *
 * Le CLAUDE.md du service l'écrit : « un mock Prisma rend ce qu'on lui dit quel
 * que soit le `select` », donc un témoin de COMPORTEMENT passe au vert sur une
 * porte aveugle, et un témoin de PROJECTION ne dit rien de ce que le handler
 * FAIT du verdict. Les deux sont donc ici :
 *
 *   · le COMPORTEMENT, par un double qui REFUSE ce que le vrai client refuse
 *     (`strictFindFirst`) — la forme adoptée au cycle 112 pour la file de
 *     rejeu : « un double de test ment aussi par ce qu'il ACCEPTE » ;
 *   · la PROJECTION, qui assert sur la REQUÊTE, et qui seule voit un `where`
 *     que personne n'honore en test.
 *
 * ─── La précondition, construite explicitement ────────────────────────────
 *
 * Une ligne `isActive: true, bannedAt ≠ null` existe en base : bannir pendant
 * qu'une ligne est INACTIVE n'écrit que `bannedAt` (`conversationBanState.ts`),
 * et `restore-for-me` rallumait `isActive` avant #10436. Le producteur est
 * fermé, aucune migration n'a repris les lignes existantes
 * (`socketio/__tests__/conversation-audience-living-participation.ts`).
 *
 * **Un témoin posé sur une ligne SAINE ne peut pas tomber** : la loi et le
 * filtre nu y rendent le même verdict. Chaque témoin construit donc la
 * divergence — c'est la règle du cycle 175 (« une précondition de défaut
 * s'écrit AVANT le témoin »).
 *
 * ─── Et chaque refus est assert sur sa RAISON, jamais sur `success: false` ─
 *
 * Mesuré en écrivant ces témoins : `handleReactionSync` prend le `messageId`
 * NU, pas un objet. Appelée avec `{ messageId }`, elle refusait sur
 * `isValidObjectId` — donc le témoin PASSAIT avant le correctif, pour une
 * raison qui n'est pas la sienne. Un `objectContaining({ success: false })`
 * accepte les deux issues et n'atteste rien (§ CLAUDE.md, « un témoin qui
 * accepte les deux issues n'atteste rien ») : chaque refus nomme donc
 * `'Could not resolve participant'`.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ReactionHandler } from '../ReactionHandler';
import { PARTICIPATION_VIVANTE } from '../../../routes/conversations/utils/access-control';
import type { Socket } from 'socket.io';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ─── Mocks ───────────────────────────────────────────────────────────────────
//
// Le contrat RÉEL, dont on ne remplace que les entrées épinglées — jamais une
// table partielle, qui rendrait `undefined` la première constante que le
// handler se met à lire (§ CLAUDE.md, cycles 91/93/104).

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  ...(jest.requireActual('@meeshy/shared/types/socketio-events') as object),
  SERVER_EVENTS: {
    REACTION_ADDED: 'reaction:added',
    REACTION_REMOVED: 'reaction:removed',
    ERROR: 'error',
  },
  ROOMS: {
    conversation: (id: string) => `conversation:${id}`,
  },
}));

jest.mock('../../../utils/logger-enhanced', () => {
  const sharedLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
  return { enhancedLogger: { child: () => sharedLogger } };
});

jest.mock('../../../middleware/validation', () => ({
  validateSocketEvent: jest.fn((_schema: unknown, data: unknown) => ({ success: true, data })),
}));

jest.mock('../../../services/notifications/reactionNotify', () => ({
  notifyReactionAdded: jest.fn().mockResolvedValue(undefined),
  notifyReactionRemoved: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../utils/socket-rate-limiter', () => ({
  getSocketRateLimiter: () => ({
    checkLimit: jest.fn().mockResolvedValue(true),
    getRateLimitInfo: jest.fn().mockReturnValue({ resetIn: 30000 }),
  }),
  SOCKET_RATE_LIMITS: {
    REACTION_ADD: { maxRequests: 30, windowMs: 60000, keyPrefix: 'socket:reaction:add' },
    REACTION_REMOVE: { maxRequests: 30, windowMs: 60000, keyPrefix: 'socket:reaction:remove' },
    REACTION_SYNC: { maxRequests: 120, windowMs: 60000, keyPrefix: 'socket:reaction:sync' },
  },
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const SOCKET_ID = 'socket-abc';
const USER_ID = 'user-123';
const MESSAGE_ID = '507f191e810c19729de860ea';
const CONV_ID = '507f191e810c19729de860eb';
const PARTICIPANT_ID = '507f191e810c19729de860ec';
const ANON_PARTICIPANT_ID = '507f191e810c19729de860ed';

type MembershipRow = {
  readonly id: string;
  readonly userId?: string;
  readonly conversationId: string;
  readonly isActive: boolean;
  /** `undefined` = colonne ABSENTE du document, l'état de l'immense majorité. */
  readonly bannedAt?: Date | null;
};

/** La ligne du défaut : ACTIVE et BANNIE — celle que le filtre nu laisse passer. */
const bannedButActive = (overrides: Partial<MembershipRow> = {}): MembershipRow => ({
  id: PARTICIPANT_ID,
  userId: USER_ID,
  conversationId: CONV_ID,
  isActive: true,
  bannedAt: new Date('2026-11-01T00:00:00.000Z'),
  ...overrides,
});

/** La ligne nominale : active, jamais bannie, donc colonne ABSENTE. */
const living = (overrides: Partial<MembershipRow> = {}): MembershipRow => ({
  id: PARTICIPANT_ID,
  userId: USER_ID,
  conversationId: CONV_ID,
  isActive: true,
  ...overrides,
});

/**
 * Un double de `participant.findFirst` qui REFUSE ce que le vrai client refuse.
 *
 * Il n'invente rien : il applique les trois égalités scalaires du `where` et la
 * disjonction `OR` que `unsetOrNull` produit. Un double permissif rendrait la
 * ligne quel que soit le `where` — et c'est exactement ce qui laisse un témoin
 * de comportement passer au vert sur une porte aveugle.
 */
const strictFindFirst = (row: MembershipRow) =>
  jest.fn<any>(async (args: any) => {
    const where = args?.where ?? {};
    const scalars: readonly [string, unknown][] = Object.entries(where).filter(([key]) => key !== 'OR');
    for (const [key, expected] of scalars) {
      if ((row as Record<string, unknown>)[key] !== expected) return null;
    }
    const branches: readonly Record<string, any>[] = where.OR ?? [];
    if (branches.length > 0) {
      const satisfied = branches.some((branch) =>
        Object.entries(branch).every(([field, predicate]) => {
          const value = (row as Record<string, unknown>)[field];
          if (predicate === null) return value === null;
          if (predicate && typeof predicate === 'object' && 'isSet' in predicate) {
            return (predicate as { isSet: boolean }).isSet === (value !== undefined);
          }
          return value === predicate;
        }),
      );
      if (!satisfied) return null;
    }
    return { id: row.id };
  });

function makeSocket(): Socket {
  return {
    id: SOCKET_ID,
    emit: jest.fn<any>(),
    to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }),
  } as unknown as Socket;
}

function buildHandler(options: {
  readonly findFirst: ReturnType<typeof strictFindFirst> | jest.Mock<any>;
  readonly anonymous?: boolean;
}) {
  const prisma = {
    message: { findUnique: jest.fn<any>().mockResolvedValue({ conversationId: CONV_ID }) },
    participant: { findFirst: options.findFirst, findMany: jest.fn<any>().mockResolvedValue([]) },
    conversation: { findUnique: jest.fn<any>().mockResolvedValue({ id: CONV_ID, identifier: CONV_ID }) },
  } as unknown as PrismaClient;

  const reactionService = {
    addReaction: jest.fn<any>().mockResolvedValue({ reaction: { id: 'reaction-1', emoji: '👍' } }),
    removeReaction: jest.fn<any>().mockResolvedValue(true),
    getMessageReactions: jest.fn<any>().mockResolvedValue([]),
    createUpdateEvent: jest.fn<any>().mockResolvedValue({ messageId: MESSAGE_ID }),
  };

  const connectedUsers = new Map<string, any>();
  connectedUsers.set(
    USER_ID,
    options.anonymous === true
      ? { id: USER_ID, socketId: SOCKET_ID, isAnonymous: true, participantId: ANON_PARTICIPANT_ID, language: 'en' }
      : { id: USER_ID, socketId: SOCKET_ID, isAnonymous: false, language: 'en' },
  );
  const socketToUser = new Map<string, string>([[SOCKET_ID, USER_ID]]);

  const handler = new ReactionHandler({
    io: { to: jest.fn<any>().mockReturnValue({ emit: jest.fn() }) } as any,
    prisma,
    notificationService: { sendNotification: jest.fn<any>() } as any,
    reactionService: reactionService as any,
    connectedUsers,
    socketToUser,
  });

  return { handler, prisma, reactionService };
}

// ─── Témoins ─────────────────────────────────────────────────────────────────

describe("la porte des réactions de message n'ouvre qu'à une participation VIVANTE (#19525)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('le COMPORTEMENT — un membre ACTIF et BANNI est refusé', () => {
    it("refuse reaction:add et ne persiste rien", async () => {
      const { handler, reactionService } = buildHandler({ findFirst: strictFindFirst(bannedButActive()) });
      const callback = jest.fn<any>();

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Could not resolve participant' });
      expect(reactionService.addReaction).not.toHaveBeenCalled();
    });

    it('refuse reaction:remove', async () => {
      const { handler, reactionService } = buildHandler({ findFirst: strictFindFirst(bannedButActive()) });
      const callback = jest.fn<any>();

      await handler.handleReactionRemove(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Could not resolve participant' });
      expect(reactionService.removeReaction).not.toHaveBeenCalled();
    });

    /**
     * La surface de LECTURE, et elle passe par la MÊME porte : `getMessageReactions`
     * rend le trombinoscope des réacteurs par emoji — une lecture que le
     * bannissement retire à toutes les autres portes du dépôt.
     */
    it('refuse reaction:request-sync, qui rend le trombinoscope des réacteurs', async () => {
      const { handler, reactionService } = buildHandler({ findFirst: strictFindFirst(bannedButActive()) });
      const callback = jest.fn<any>();

      await handler.handleReactionSync(makeSocket(), MESSAGE_ID, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Could not resolve participant' });
      expect(reactionService.getMessageReactions).not.toHaveBeenCalled();
    });

    it("refuse l'invité de lien ACTIF et BANNI", async () => {
      const { handler, reactionService } = buildHandler({
        anonymous: true,
        findFirst: strictFindFirst(bannedButActive({ id: ANON_PARTICIPANT_ID, userId: undefined })),
      });
      const callback = jest.fn<any>();

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(callback).toHaveBeenCalledWith({ success: false, error: 'Could not resolve participant' });
      expect(reactionService.addReaction).not.toHaveBeenCalled();
    });
  });

  describe('la PROJECTION — le `where` porte la loi, jamais une copie de son contenu', () => {
    it('sur la branche INSCRITE', async () => {
      const findFirst = jest.fn<any>().mockResolvedValue({ id: PARTICIPANT_ID });
      const { handler } = buildHandler({ findFirst });

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, jest.fn<any>());

      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER_ID, conversationId: CONV_ID, ...PARTICIPATION_VIVANTE },
        }),
      );
    });

    it("sur la branche INVITÉE", async () => {
      const findFirst = jest.fn<any>().mockResolvedValue({ id: ANON_PARTICIPANT_ID });
      const { handler } = buildHandler({ findFirst, anonymous: true });

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, jest.fn<any>());

      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ANON_PARTICIPANT_ID, conversationId: CONV_ID, ...PARTICIPATION_VIVANTE },
        }),
      );
    });
  });

  /**
   * La NON-RÉGRESSION, et elle compte autant : `bannedAt` est ABSENT du document
   * de tout participant jamais banni, et un `bannedAt: null` nu aurait fermé la
   * conversation à toute la population (`utils/prisma-unset.ts`).
   */
  describe("la non-régression — une ligne jamais bannie n'a pas de colonne `bannedAt`", () => {
    it('laisse réagir un membre vivant', async () => {
      const { handler, reactionService } = buildHandler({ findFirst: strictFindFirst(living()) });
      const callback = jest.fn<any>();

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, callback);

      expect(reactionService.addReaction).toHaveBeenCalledWith(
        expect.objectContaining({ participantId: PARTICIPANT_ID }),
      );
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('laisse réagir un membre DÉBANNI, dont la colonne est remise à `null`', async () => {
      const { handler, reactionService } = buildHandler({ findFirst: strictFindFirst(living({ bannedAt: null })) });

      await handler.handleReactionAdd(makeSocket(), { messageId: MESSAGE_ID, emoji: '👍' }, jest.fn<any>());

      expect(reactionService.addReaction).toHaveBeenCalled();
    });
  });
});
