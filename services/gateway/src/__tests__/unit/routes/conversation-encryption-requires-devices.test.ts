/**
 * ON N'ACTIVE PAS LE BOUT EN BOUT POUR QUELQU'UN QUI NE PEUT PAS LE LIRE (#20073).
 *
 * Un tête-à-tête passé en `e2ee` alors qu'un membre n'a publié aucun appareil
 * chiffré est une conversation MORTE : rien ne peut y partir, et elle ne se
 * quitte pas (#12949). La bascule est donc refusée tant qu'un membre n'a aucun
 * appareil actif — `409 E2EE_PARTICIPANT_WITHOUT_DEVICE`, les membres en cause
 * nommés — et rien n'est écrit ni annoncé.
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

function makeWorld(params: { readonly conversation?: MongoDocument; readonly members?: Member[]; readonly others?: DirectDoc[]; readonly devices?: readonly { userId: string; retiredAt?: Date | null }[] } = {}): World {
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
    e2EEDevice: {
      findMany: jest.fn(async ({ where }: { where: MongoDocument }) =>
        (params.devices ?? []).filter((device) => matchesMongoWhere({ retiredAt: null, ...device }, where)).map((device) => ({ userId: device.userId }))),
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

async function enable(world: World, mode: 'e2ee' | 'server' | 'hybrid' = 'e2ee') {
  const app = await buildApp(world);
  const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, payload: { mode } });
  await app.close();
  return res;
}

const device = (userId: string, retiredAt: Date | null = null) => ({ userId, retiredAt });

describe('le bout en bout ne s’active que si chaque membre peut le lire (#20073)', () => {
  beforeEach(() => as(ALICE));

  it('le pair n’a aucun appareil chiffré : 409 E2EE_PARTICIPANT_WITHOUT_DEVICE, il est nommé, rien n’est écrit ni annoncé', async () => {
    const world = makeWorld({ devices: [device(ALICE)] });
    const res = await enable(world);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ success: false, code: 'E2EE_PARTICIPANT_WITHOUT_DEVICE', withoutDeviceUserIds: [BOB] });
    expect(world.updateMany).not.toHaveBeenCalled();
    expect(world.notices).toEqual([]);
    expect(world.emitted).toEqual([]);
    expect(world.conversation.encryptionMode).toBeUndefined();
  });

  it('un appareil RETIRÉ ne compte pas : même refus', async () => {
    const world = makeWorld({ devices: [device(ALICE), device(BOB, new Date('2026-11-01T00:00:00Z'))] });
    const res = await enable(world);
    expect(res.statusCode).toBe(409);
    expect(res.json().withoutDeviceUserIds).toEqual([BOB]);
  });

  it('personne n’a d’appareil : les deux membres sont nommés', async () => {
    const res = await enable(makeWorld({ devices: [] }));
    expect(res.statusCode).toBe(409);
    expect([...res.json().withoutDeviceUserIds].sort()).toEqual([ALICE, BOB].sort());
  });

  it('chacun a un appareil actif : le bout en bout s’active', async () => {
    const world = makeWorld({ devices: [device(ALICE), device(BOB)] });
    const res = await enable(world);
    expect(res.statusCode).toBe(200);
    expect(world.conversation.encryptionMode).toBe('e2ee');
  });

  it('le chiffrement au repos ne demande aucun appareil', async () => {
    const world = makeWorld({ devices: [] });
    expect((await enable(world, 'server')).statusCode).toBe(200);
  });

  it('un étranger reçoit le 404 et un membre sans le rôle le 403 avant tout mot sur les appareils', async () => {
    const world = makeWorld({ devices: [] });
    as(STRANGER);
    const stranger = await enable(world);
    expect(stranger.statusCode).toBe(404);
    expect(JSON.stringify(stranger.json())).not.toContain('E2EE_PARTICIPANT_WITHOUT_DEVICE');
    as(BOB);
    expect((await enable(world)).statusCode).toBe(403);
  });
});
