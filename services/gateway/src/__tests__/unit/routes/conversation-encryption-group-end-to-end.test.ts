/**
 * UN GROUPE NE MONTE PAS EN BOUT EN BOUT TANT QU'AUCUN CLIENT NE LE CHIFFRE (#16113).
 *
 * iOS et Android ne scellent un message que pour UN correspondant (Sesame,
 * tête-à-tête) et le web ne détient aucune clé : un groupe `e2ee` serait muet
 * à jamais, puisque le bout en bout ne se quitte pas (#12949). La création le
 * refusait déjà (400 `ENCRYPTION_MODE_UNSUPPORTED`) ; la bascule
 * `POST /conversations/:id/encryption` le refuse avec le même code, lisible
 * par un ancien client (#9223), sans rien écrire ni annoncer. Les gardes
 * gardent leur ordre (#12563) : 404 pour un étranger, 403 pour un membre sans
 * le rang, avant tout mot sur le mode. Un groupe DÉJÀ `e2ee` n'est ni touché
 * ni rétrogradé.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';

jest.mock('../../../services/EncryptionService', () => ({
  getEncryptionService: jest.fn().mockResolvedValue({
    activationKeyId: jest.fn().mockResolvedValue('server-key-id'),
  }),
}));

let testAuthContext: Record<string, unknown> = {};

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (request: any) => {
    request.authContext = testAuthContext;
  }),
  UnifiedAuthRequest: {},
}));

jest.mock('../../../validation/helpers.js', () => ({
  validateParams: jest.fn(() => async () => {}),
  validateBody: jest.fn(() => async () => {}),
}));

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

import encryptionRoutes from '../../../routes/conversation-encryption';

const ALICE = '507f1f77bcf86cd799439011';
const BOB = '507f1f77bcf86cd799439012';
const CAROL = '507f1f77bcf86cd799439015';
const STRANGER = '507f1f77bcf86cd799439019';
const CONV_ID = '507f1f77bcf86cd799439013';

type Member = { userId: string; role: string; isActive: boolean; user: { role: string } | null };

const moderatorAnalyst = (userId: string): Member => ({ userId, role: 'moderator', isActive: true, user: { role: 'ANALYST' } });
const memberAnalyst = (userId: string): Member => ({ userId, role: 'member', isActive: true, user: { role: 'ANALYST' } });
const user = (userId: string): Member => ({ userId, role: 'member', isActive: true, user: { role: 'USER' } });

type World = {
  readonly conversation: MongoDocument;
  readonly emitted: unknown[];
  readonly notices: unknown[];
  readonly updateMany: jest.Mock;
  readonly prisma: Record<string, unknown>;
};

function makeWorld(params: { readonly conversation?: MongoDocument; readonly members?: Member[] } = {}): World {
  const members = params.members ?? [moderatorAnalyst(ALICE), user(BOB), user(CAROL)];
  const conversation: MongoDocument = { id: CONV_ID, type: 'group', ...(params.conversation ?? {}) };
  const notices: unknown[] = [];
  const updateMany = jest.fn(async ({ where, data }: { where: MongoDocument; data: MongoDocument }) => {
    if (!matchesMongoWhere(conversation, where)) return { count: 0 };
    Object.assign(conversation, data);
    return { count: 1 };
  });
  const prisma = {
    conversation: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
        where.id !== CONV_ID
          ? null
          : {
              id: conversation.id,
              type: conversation.type,
              encryptionMode: conversation.encryptionMode ?? null,
              encryptionEnabledAt: conversation.encryptionEnabledAt ?? null,
              encryptionEnabledBy: conversation.encryptionEnabledBy ?? null,
              encryptionEpoch: conversation.encryptionEpoch,
              serverEncryptionKeyId: conversation.serverEncryptionKeyId ?? null,
              participants: members.filter((member) => member.isActive),
            }),
      findMany: jest.fn(async () => []),
      updateMany,
      update: jest.fn(async () => ({ id: CONV_ID })),
    },
    participant: {
      findFirst: jest.fn(async () => ({ id: 'p-alice', displayName: 'Alice' })),
    },
    message: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const notice = { id: `n${notices.length}`, createdAt: new Date('2026-11-04T10:00:00Z'), ...data };
        notices.push(notice);
        return notice;
      }),
    },
  };
  return { conversation, emitted: [], notices, updateMany, prisma };
}

async function buildApp(world: World): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', world.prisma as unknown);
  const io = { to: (room: string) => ({ emit: (event: string, payload: unknown) => world.emitted.push({ room, event, payload }) }) };
  app.decorate('socketIOHandler', { getManager: () => ({ broadcastMessage: jest.fn(async () => undefined), getIO: () => io }) } as unknown);
  await app.register(encryptionRoutes);
  await app.ready();
  return app;
}

const as = (userId: string) => {
  testAuthContext = { isAuthenticated: true, isAnonymous: false, userId };
};

async function enable(world: World, mode: 'e2ee' | 'server' | 'hybrid' = 'e2ee') {
  const app = await buildApp(world);
  const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, payload: { mode } });
  await app.close();
  return res;
}

const expectNothingWritten = (world: World) => {
  expect(world.updateMany).not.toHaveBeenCalled();
  expect(world.notices).toHaveLength(0);
  expect(world.emitted).toHaveLength(0);
};

describe('#16113 — la passerelle refuse le bout en bout hors tête-à-tête', () => {
  beforeEach(() => as(ALICE));

  it.each([
    ['sans mode', {}],
    ['server', { encryptionMode: 'server', encryptionEnabledAt: new Date('2026-11-01T00:00:00Z'), encryptionEpoch: 1 }],
    ['hybrid', { encryptionMode: 'hybrid', encryptionEnabledAt: new Date('2026-11-01T00:00:00Z'), encryptionEpoch: 1 }],
  ])('un groupe %s : 400 ENCRYPTION_MODE_UNSUPPORTED lisible, rien n’est écrit ni annoncé', async (_label, fields) => {
    const world = makeWorld({ conversation: fields });

    const res = await enable(world, 'e2ee');

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('ENCRYPTION_MODE_UNSUPPORTED');
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
    expect(world.conversation.encryptionMode ?? null).toBe((fields as MongoDocument).encryptionMode ?? null);
    expectNothingWritten(world);
  });

  it.each(['public', 'global', 'broadcast', 'community'])('une conversation %s est refusée de même', async (type) => {
    const world = makeWorld({ conversation: { type, encryptionMode: 'server', encryptionEnabledAt: new Date(), encryptionEpoch: 1 } });

    const res = await enable(world, 'e2ee');

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('ENCRYPTION_MODE_UNSUPPORTED');
    expectNothingWritten(world);
  });

  it('le chiffrement au repos d’un groupe reste libre : server → hybrid passe', async () => {
    const world = makeWorld({ conversation: { encryptionMode: 'server', encryptionEnabledAt: new Date('2026-11-01T00:00:00Z'), encryptionEpoch: 1 } });

    const res = await enable(world, 'hybrid');

    expect(res.statusCode).toBe(200);
    expect(world.conversation.encryptionMode).toBe('hybrid');
  });

  it('un tête-à-tête monte toujours en bout en bout', async () => {
    const world = makeWorld({
      conversation: { type: 'direct', encryptionMode: 'server', encryptionEnabledAt: new Date('2026-11-01T00:00:00Z'), encryptionEpoch: 1 },
      members: [memberAnalyst(ALICE), user(BOB)],
    });

    const res = await enable(world, 'e2ee');

    expect(res.statusCode).toBe(200);
    expect(world.conversation.encryptionMode).toBe('e2ee');
  });

  it('les gardes gardent leur ordre : un étranger reçoit le 404, un membre sans le rang le 403', async () => {
    as(STRANGER);
    const strangerWorld = makeWorld();
    expect((await enable(strangerWorld, 'e2ee')).statusCode).toBe(404);
    expectNothingWritten(strangerWorld);

    as(BOB);
    const memberWorld = makeWorld({ members: [moderatorAnalyst(ALICE), memberAnalyst(BOB), user(CAROL)] });
    const refused = await enable(memberWorld, 'e2ee');
    expect(refused.statusCode).toBe(403);
    expect(refused.json().code).not.toBe('ENCRYPTION_MODE_UNSUPPORTED');
    expectNothingWritten(memberWorld);
  });

  describe('un groupe DÉJÀ chiffré de bout en bout n’est ni touché ni rétrogradé (#12949)', () => {
    const sealed = { encryptionMode: 'e2ee', encryptionEnabledAt: new Date('2026-10-01T00:00:00Z'), encryptionEpoch: 2 };

    it('redemander le bout en bout : déjà activé, rien n’est écrit', async () => {
      const world = makeWorld({ conversation: { ...sealed } });

      const res = await enable(world, 'e2ee');

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('ENCRYPTION_ALREADY_ENABLED');
      expect(world.conversation.encryptionMode).toBe('e2ee');
      expectNothingWritten(world);
    });

    it('demander un mode au repos : 409 E2EE_IRREVERSIBLE, il reste e2ee', async () => {
      const world = makeWorld({ conversation: { ...sealed } });

      const res = await enable(world, 'server');

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('E2EE_IRREVERSIBLE');
      expect(world.conversation.encryptionMode).toBe('e2ee');
      expectNothingWritten(world);
    });
  });
});
