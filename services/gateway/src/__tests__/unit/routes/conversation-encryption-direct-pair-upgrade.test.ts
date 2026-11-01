/**
 * UNE PAIRE A AU PLUS UN TÊTE-À-TÊTE CHIFFRÉ DE BOUT EN BOUT (#12966).
 *
 * Un tête-à-tête lisible par le serveur peut toujours devenir `e2ee` — sauf si
 * la paire en a déjà un : le second chiffré rend `409
 * E2EE_DIRECT_ALREADY_END_TO_END`, lisible, avec le tête-à-tête chiffré à
 * rouvrir, et rien n'est écrit ni annoncé. Le chiffrement au repos (`server`,
 * `hybrid`) reste libre : il ne fait pas d'un tête-à-tête un `e2ee`. Les gardes
 * gardent leur ordre (#12563) : un étranger reçoit le 404, un membre sans le
 * rôle le 403, avant tout mot sur l'autre tête-à-tête.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';
import { findConversationsIn, type DirectDoc } from '../../helpers/direct-pair-world';

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
const SEALED_DM = '507f1f77bcf86cd7994390e2';

type Member = { userId: string; role: string; isActive: boolean; user: { role: string } | null };

const analyst = (userId: string): Member => ({ userId, role: 'member', isActive: true, user: { role: 'ANALYST' } });
const user = (userId: string, isActive = true): Member => ({ userId, role: 'member', isActive, user: { role: 'USER' } });

type World = {
  readonly conversation: MongoDocument;
  readonly emitted: unknown[];
  readonly notices: unknown[];
  readonly updateMany: jest.Mock;
  readonly prisma: Record<string, unknown>;
};

function makeWorld(params: { readonly conversation?: MongoDocument; readonly members?: Member[]; readonly others?: DirectDoc[] } = {}): World {
  const members = params.members ?? [analyst(ALICE), user(BOB)];
  const conversation: MongoDocument = { id: CONV_ID, type: 'direct', ...(params.conversation ?? {}) };
  const others = findConversationsIn(params.others ?? []);
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
              participants: members.filter((member) => member.isActive),
            }),
      findMany: jest.fn(async (args: any) => others.findMany(args)),
      updateMany,
      update: jest.fn(async () => ({ id: CONV_ID })),
    },
    participant: {
      findFirst: jest.fn(async ({ where }: { where: { userId: string } }) => (where.userId === ALICE ? { id: 'p-alice', displayName: 'Alice' } : null)),
    },
    message: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const notice = { id: `n${notices.length}`, createdAt: new Date('2026-10-25T10:00:00Z'), ...data };
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

const sealedDirectOf = (members: Array<{ userId: string; isActive: boolean }>, fields: MongoDocument = { encryptionMode: 'e2ee' }): DirectDoc => ({
  id: SEALED_DM,
  type: 'direct',
  participants: members,
  ...fields,
});

const ALICE_AND_BOB = [{ userId: ALICE, isActive: true }, { userId: BOB, isActive: true }];

async function enable(world: World, mode: 'e2ee' | 'server' | 'hybrid' = 'e2ee') {
  const app = await buildApp(world);
  const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, payload: { mode } });
  await app.close();
  return res;
}

describe('AUDIT — un tête-à-tête server (le défaut de toute création) ne contourne pas #12966', () => {
  beforeEach(() => as(ALICE));

  it('server → e2ee alors que la paire a déjà un tête-à-tête e2ee : 409, rien d’écrit', async () => {
    const world = makeWorld({
      conversation: { encryptionMode: 'server', encryptionProtocol: 'aes-256-gcm', encryptionEnabledAt: new Date('2026-11-01T08:00:00Z'), encryptionEnabledBy: ALICE, encryptionEpoch: 1 },
      others: [sealedDirectOf(ALICE_AND_BOB)],
    });
    const res = await enable(world, 'e2ee');
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('E2EE_DIRECT_ALREADY_END_TO_END');
    expect(world.conversation.encryptionMode).toBe('server');
  });
});
