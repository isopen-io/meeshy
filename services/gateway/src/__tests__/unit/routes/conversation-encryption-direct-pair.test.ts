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

describe('un second tête-à-tête chiffré de bout en bout pour la même paire est refusé (#12966)', () => {
  beforeEach(() => as(ALICE));

  it.each([['e2ee'], ['E2EE']])('la paire a déjà un tête-à-tête %s : 409 lisible, le chiffré nommé, rien d’écrit ni d’annoncé', async (mode) => {
    const world = makeWorld({ others: [sealedDirectOf(ALICE_AND_BOB, { encryptionMode: mode })] });
    const res = await enable(world);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({
      success: false,
      code: 'E2EE_DIRECT_ALREADY_END_TO_END',
      existingConversationId: SEALED_DM,
    });
    expect(res.json().error).toMatch(/already/i);
    expect(world.updateMany).not.toHaveBeenCalled();
    expect(world.notices).toHaveLength(0);
    expect(world.emitted).toHaveLength(0);
    expect(world.conversation.encryptionMode).toBeUndefined();
  });

  it('un autre tête-à-tête de la paire d’un mode que le serveur ne lit pas (inconnu) compte comme le chiffré : même refus', async () => {
    const world = makeWorld({ others: [sealedDirectOf(ALICE_AND_BOB, { encryptionMode: 'quantum' })] });
    const res = await enable(world);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('E2EE_DIRECT_ALREADY_END_TO_END');
  });

  it('l’autre tête-à-tête de la paire est lisible : le chiffrement s’active', async () => {
    const world = makeWorld({ others: [sealedDirectOf(ALICE_AND_BOB, {})] });
    const res = await enable(world);
    expect(res.statusCode).toBe(200);
    expect(world.conversation.encryptionMode).toBe('e2ee');
  });

  it('un GROUPE chiffré avec les mêmes personnes ne compte pas', async () => {
    const world = makeWorld({ others: [{ ...sealedDirectOf(ALICE_AND_BOB), type: 'group' }] });
    expect((await enable(world)).statusCode).toBe(200);
  });

  it('un tête-à-tête chiffré que le pair a quitté n’est plus celui de la paire', async () => {
    const world = makeWorld({ others: [sealedDirectOf([{ userId: ALICE, isActive: true }, { userId: BOB, isActive: false }])] });
    expect((await enable(world)).statusCode).toBe(200);
  });

  it('le tête-à-tête chiffré d’une AUTRE paire ne compte pas', async () => {
    const world = makeWorld({ others: [sealedDirectOf([{ userId: ALICE, isActive: true }, { userId: CAROL, isActive: true }])] });
    expect((await enable(world)).statusCode).toBe(200);
  });

  it.each([['server' as const], ['hybrid' as const]])('le chiffrement au repos %s reste libre à côté du chiffré de bout en bout', async (mode) => {
    const world = makeWorld({ others: [sealedDirectOf(ALICE_AND_BOB)] });
    const res = await enable(world, mode);
    expect(res.statusCode).toBe(200);
    expect(world.conversation.encryptionMode).toBe(mode);
  });

  it('un groupe ne connaît pas la règle de la paire', async () => {
    const world = makeWorld({ conversation: { type: 'group' }, members: [{ ...analyst(ALICE), role: 'moderator' }, user(BOB)], others: [sealedDirectOf(ALICE_AND_BOB)] });
    expect((await enable(world)).statusCode).toBe(200);
  });

  it('un étranger reçoit le 404, un membre sans le rôle le 403 — jamais un mot sur l’autre tête-à-tête', async () => {
    const world = makeWorld({ others: [sealedDirectOf(ALICE_AND_BOB)] });
    as(STRANGER);
    const stranger = await enable(world);
    expect(stranger.statusCode).toBe(404);
    expect(JSON.stringify(stranger.json())).not.toContain(SEALED_DM);
    as(BOB);
    const plainUser = await enable(world);
    expect(plainUser.statusCode).toBe(403);
    expect(JSON.stringify(plainUser.json())).not.toContain(SEALED_DM);
  });
});

describe('un tête-à-tête ne se chiffre de bout en bout qu’entre deux personnes (#12966)', () => {
  beforeEach(() => as(ALICE));

  it('trois membres actifs : 409 E2EE_DIRECT_NOT_A_PAIR, rien d’écrit — la règle de la paire ne se contourne pas par un tiers', async () => {
    const world = makeWorld({ members: [analyst(ALICE), user(BOB), user(CAROL)], others: [sealedDirectOf(ALICE_AND_BOB)] });
    const res = await enable(world);
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ success: false, code: 'E2EE_DIRECT_NOT_A_PAIR' });
    expect(world.updateMany).not.toHaveBeenCalled();
  });

  it('un invité sans compte actif à côté des deux : pas une paire, même refus', async () => {
    const world = makeWorld({ members: [analyst(ALICE), user(BOB), { userId: null as unknown as string, role: 'member', isActive: true, user: null }] });
    const res = await enable(world);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('E2EE_DIRECT_NOT_A_PAIR');
  });

  it('seul membre actif restant : même refus', async () => {
    const world = makeWorld({ members: [analyst(ALICE), user(BOB, false)] });
    const res = await enable(world);
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('E2EE_DIRECT_NOT_A_PAIR');
  });

  it('le chiffrement au repos ne demande pas de paire', async () => {
    const world = makeWorld({ members: [analyst(ALICE), user(BOB), user(CAROL)] });
    expect((await enable(world, 'server')).statusCode).toBe(200);
  });
});

describe('le statut ne propose pas un chiffrement qui serait refusé (#12966)', () => {
  beforeEach(() => as(ALICE));

  const status = async (world: World) => {
    const app = await buildApp(world);
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/encryption-status` });
    await app.close();
    return res;
  };

  it('la paire a déjà un tête-à-tête chiffré : rien à activer ici, et le chiffré est nommé', async () => {
    const res = await status(makeWorld({ others: [sealedDirectOf(ALICE_AND_BOB)] }));
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ canToggleEncryption: false, pairEndToEndConversationId: SEALED_DM });
  });

  it('sinon, rien ne change : activable, aucun chiffré nommé', async () => {
    const res = await status(makeWorld({ others: [sealedDirectOf(ALICE_AND_BOB, {})] }));
    expect(res.json().data).toMatchObject({ canToggleEncryption: true, pairEndToEndConversationId: null });
  });

  it('un étranger reçoit le 404 sans le chiffré de la paire', async () => {
    as(STRANGER);
    const res = await status(makeWorld({ others: [sealedDirectOf(ALICE_AND_BOB)] }));
    expect(res.statusCode).toBe(404);
    expect(JSON.stringify(res.json())).not.toContain(SEALED_DM);
  });
});
