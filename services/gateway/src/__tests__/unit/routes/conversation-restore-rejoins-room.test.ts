/**
 * #16964 — `restore-for-me` d'une conversation remet les sockets du compte
 * dans `conversation:<id>`.
 *
 * Jumelle EXACTE de la jointure par lien (#16946), et le dépôt porte déjà le
 * raisonnement complet à côté : `participant-ban-core.ts` (levée de
 * bannissement) le fait, et son commentaire décrit `restore-for-me` sans le
 * nommer — « the ban pulled every socket of this user out of
 * `conversation:<id>`, and nothing puts them back until they reconnect … the
 * unbanned user is in the worst possible state — `connectedUsers` reports them
 * ONLINE, so every sender skips the offline delivery queue for them, while no
 * live room event reaches them ».
 *
 * La moitié qui RETIRE les sockets est explicite — `delete-for-me.ts` appelle
 * `endConversationMembership`, qui sort TOUTES les sockets du compte. Celle qui
 * les remet n'existait pas : la ligne redevenait active, `conversation:restored`
 * partait sur la room PERSONNELLE, et aucun événement de fil n'atteignait plus
 * l'appareil. PIÈGE ARMÉ au moment du lot (aucun client n'appelle encore cette
 * route ; iOS écoute pourtant déjà `conversation:restored`) — règle du cycle 84 :
 * on ne laisse pas un piège armé au motif que personne n'a encore marché dessus.
 *
 * Le témoin lit ce que le GESTIONNAIRE a reçu, pas ce que la route croit avoir
 * fait, et il porte les deux moitiés : la jointure a lieu sur une restauration
 * EFFECTIVE, et elle n'a PAS lieu quand la route refuse.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const PART_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const AUTH = { authorization: 'Bearer token' };

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(
    () =>
      async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        if (!request.headers['authorization']) {
          await reply.code(401).send({ success: false, error: 'Unauthorized' });
          return;
        }
        (request as unknown as Record<string, unknown>).authContext = {
          type: 'registered',
          userId: USER_ID,
          hasFullAccess: true,
        };
      }
  ),
  UnifiedAuthRequest: {},
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

import userDeletionsRoutes from '../../../routes/user-deletions';

type Joined = { userId: string; conversationId: string };

type Shape = {
  readonly deletedForMe?: Date | null;
  readonly bannedAt?: Date | null;
  readonly isActive?: boolean;
  readonly joinThrows?: boolean;
};

async function buildApp(joins: Joined[], shape: Shape = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', {
    participant: {
      findFirst: jest.fn(async () => ({
        id: PART_ID,
        deletedForMe: shape.deletedForMe === undefined ? new Date('2026-11-01T10:00:00Z') : shape.deletedForMe,
        bannedAt: shape.bannedAt ?? null,
        language: 'fr',
        conversation: { isActive: shape.isActive ?? true, communityId: null },
      })),
      update: jest.fn(async () => ({})),
      findMany: jest.fn(async () => [{ id: PART_ID, userId: USER_ID }]),
    },
    message: { findFirst: jest.fn(async () => null) },
    userConversationPreferences: {
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async () => ({})),
      findMany: jest.fn(async () => []),
    },
  } as unknown);

  app.decorate('socketIOHandler', {
    io: { to: () => ({ emit: () => undefined }) },
    getManager: () => ({
      getIO: () => ({ to: () => ({ emit: () => undefined }) }),
      joinUserToConversationRoom: async (userId: string, conversationId: string) => {
        if (shape.joinThrows) throw new Error('adapter down');
        joins.push({ userId, conversationId });
      },
    }),
  } as unknown);

  await app.register(userDeletionsRoutes);
  await app.ready();
  return app;
}

describe('#16964 — restaurer une conversation remet les sockets dans la room du fil', () => {
  let joins: Joined[];

  beforeEach(() => {
    joins = [];
  });

  it('une restauration EFFECTIVE rejoint `conversation:<id>`', async () => {
    const app = await buildApp(joins);

    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(200);
    expect(joins).toEqual([{ userId: USER_ID, conversationId: CONV_ID }]);

    await app.close();
  });

  it('un REFUS ne rejoint rien — la ligne n’a pas été rendue', async () => {
    const app = await buildApp(joins, { deletedForMe: null });

    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(400);
    expect(joins).toEqual([]);

    await app.close();
  });

  it('une conversation CLOSE ne rejoint rien', async () => {
    const app = await buildApp(joins, { isActive: false });

    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
      headers: AUTH,
    });

    expect(res.statusCode).toBe(400);
    expect(joins).toEqual([]);

    await app.close();
  });

  it('un échec de jointure est journalisé, jamais fatal — la restauration tient', async () => {
    const app = await buildApp(joins, { joinThrows: true });

    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/restore-for-me`,
      headers: AUTH,
    });

    // La ligne EST restaurée en base : une panne de rebranchement ne doit pas
    // rendre 500 sur un geste déjà persisté — même discipline que la levée de
    // bannissement (`participant-ban-core.ts`).
    expect(res.statusCode).toBe(200);

    await app.close();
  });
});
