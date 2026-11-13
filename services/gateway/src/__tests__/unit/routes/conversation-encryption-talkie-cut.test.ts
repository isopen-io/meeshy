/**
 * #14490 — l'activation du bout en bout d'un tête-à-tête COUPE le talkie de la
 * paire à l'instant, par la route qui écrit le régime : la coupure partagée est
 * posée dans les deux sens, comme celle d'un blocage. Le chiffrement au repos
 * (`server`, `hybrid`) laisse le talkie passer, et une activation refusée ne
 * coupe rien.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';
import { findConversationsIn, type DirectDoc } from '../../helpers/direct-pair-world';

const cutStore = new Map<string, string>();
const cutWrite = { fail: false };

jest.mock('../../../services/talkie/talkieCut', () => {
  const actual = jest.requireActual('../../../services/talkie/talkieCut') as Record<string, unknown>;
  return {
    ...actual,
    talkieCutDepsOf: () => ({
      cache: {
        get: async (key: string) => cutStore.get(key) ?? null,
        set: async (key: string, value: string) => {
          if (cutWrite.fail) throw new Error('redis down');
          cutStore.set(key, value);
          return true;
        },
      },
      relay: null,
      now: () => Date.parse('2026-11-13T10:00:00Z'),
    }),
  };
});

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
const CONV_ID = '507f1f77bcf86cd799439013';
const SEALED_DM = '507f1f77bcf86cd7994390e2';

type Member = { userId: string; role: string; isActive: boolean; user: { role: string } | null };
const member = (userId: string): Member => ({ userId, role: 'member', isActive: true, user: { role: 'USER' } });

function makeWorld(params: { readonly conversation?: MongoDocument; readonly members?: Member[]; readonly others?: DirectDoc[] } = {}) {
  const members = params.members ?? [{ ...member(ALICE), user: { role: 'ANALYST' } }, member(BOB)];
  const conversation: MongoDocument = { id: CONV_ID, type: 'direct', ...(params.conversation ?? {}) };
  const others = findConversationsIn(params.others ?? []);
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
              participants: members.filter((row) => row.isActive),
            }),
      findMany: jest.fn(async (args: any) => others.findMany(args)),
      updateMany: jest.fn(async ({ where, data }: { where: MongoDocument; data: MongoDocument }) => {
        if (!matchesMongoWhere(conversation, where)) return { count: 0 };
        Object.assign(conversation, data);
        return { count: 1 };
      }),
      update: jest.fn(async () => ({ id: CONV_ID })),
    },
    participant: {
      findFirst: jest.fn(async () => ({ id: 'p-alice', displayName: 'Alice' })),
    },
    message: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'n0', createdAt: new Date('2026-11-13T10:00:00Z'), ...data })),
    },
  };
  return { conversation, prisma };
}

async function enable(world: ReturnType<typeof makeWorld>, mode: 'e2ee' | 'server' | 'hybrid') {
  const app: FastifyInstance = Fastify({ logger: false });
  app.decorate('prisma', world.prisma as unknown);
  const io = { to: () => ({ emit: () => undefined }) };
  app.decorate('socketIOHandler', { getManager: () => ({ broadcastMessage: jest.fn(async () => undefined), getIO: () => io }) } as unknown);
  await app.register(encryptionRoutes);
  await app.ready();
  const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, payload: { mode } });
  await app.close();
  return res;
}

const cutKey = (from: string, to: string) => `talkie:cut:${from}:${to}`;

describe('#14490 — activer le bout en bout coupe le talkie de la paire', () => {
  beforeEach(() => {
    cutStore.clear();
    cutWrite.fail = false;
    testAuthContext = { isAuthenticated: true, isAnonymous: false, userId: ALICE };
  });

  it('tête-à-tête en clair → e2ee : la coupure est posée dans les deux sens, à l’instant de la bascule', async () => {
    const res = await enable(makeWorld(), 'e2ee');

    expect(res.statusCode).toBe(200);
    expect(cutStore.get(cutKey(ALICE, BOB))).toBe(String(Date.parse('2026-11-13T10:00:00Z')));
    expect(cutStore.get(cutKey(BOB, ALICE))).toBe(String(Date.parse('2026-11-13T10:00:00Z')));
  });

  it('server → e2ee coupe aussi : le serveur lisait encore la voix', async () => {
    const world = makeWorld({ conversation: { encryptionMode: 'server', encryptionProtocol: 'aes-256-gcm', encryptionEnabledAt: new Date('2026-11-01T08:00:00Z'), encryptionEnabledBy: ALICE, encryptionEpoch: 1 } });
    const res = await enable(world, 'e2ee');

    expect(res.statusCode).toBe(200);
    expect([...cutStore.keys()].sort()).toEqual([cutKey(ALICE, BOB), cutKey(BOB, ALICE)].sort());
  });

  it.each(['server', 'hybrid'] as const)('le chiffrement au repos (%s) ne coupe pas le talkie', async (mode) => {
    const res = await enable(makeWorld(), mode);

    expect(res.statusCode).toBe(200);
    expect(cutStore.size).toBe(0);
  });

  it('une activation refusée (la paire a déjà un tête-à-tête chiffré) ne coupe rien', async () => {
    const world = makeWorld({ others: [{ id: SEALED_DM, type: 'direct', encryptionMode: 'e2ee', participants: [{ userId: ALICE, isActive: true }, { userId: BOB, isActive: true }] }] });
    const res = await enable(world, 'e2ee');

    expect(res.statusCode).toBe(409);
    expect(cutStore.size).toBe(0);
  });

  it('une écriture de coupure qui échoue ne défait pas la bascule déjà écrite (le rejugement prend le relais)', async () => {
    cutWrite.fail = true;
    const world = makeWorld();
    const res = await enable(world, 'e2ee');

    expect(res.statusCode).toBe(200);
    expect(world.conversation.encryptionMode).toBe('e2ee');
  });

  it('aucune paire d’un tiers n’est visée : une coupure antérieure de Carol reste telle quelle, aucune n’est ajoutée', async () => {
    cutStore.set(cutKey(CAROL, ALICE), '1');
    await enable(makeWorld(), 'e2ee');

    expect(cutStore.get(cutKey(CAROL, ALICE))).toBe('1');
    expect([...cutStore.keys()].filter((key) => key.includes(CAROL))).toEqual([cutKey(CAROL, ALICE)]);
    expect(cutStore.size).toBe(3);
  });
});
