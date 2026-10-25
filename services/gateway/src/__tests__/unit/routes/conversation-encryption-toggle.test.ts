/**
 * Le régime de chiffrement d'une conversation (#12522, #12949) : activer, par
 * une écriture conditionnelle sur l'époque du régime (#12521), l'appartenance
 * jugée avant toute information sur la conversation (#12563). Une conversation
 * chiffrée de bout en bout ne repasse JAMAIS en clair (décision porteur du
 * 2026-10-25, #12949) ; seul le chiffrement au repos (server, hybrid) se quitte.
 *
 * Le double Prisma tient UN document de conversation en mémoire et évalue les
 * `where` avec la sémantique MongoDB (`matchesMongoWhere` : un champ absent
 * n'est pas un champ nul). Un document jamais basculé n'a PAS
 * `encryptionEpoch` — c'est le cas de toutes les conversations existantes.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';

jest.mock('../../../services/EncryptionService', () => ({
  getEncryptionService: jest.fn().mockResolvedValue({
    getOrCreateConversationKey: jest.fn().mockResolvedValue('server-key-id'),
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
const STRANGER = '507f1f77bcf86cd799439019';
const CONV_ID = '507f1f77bcf86cd799439013';
const UNKNOWN_CONV_ID = '507f1f77bcf86cd7994390ff';
const ALICE_PARTICIPANT = '507f1f77bcf86cd799439014';

type Member = { userId: string; role: string; user: { role: string } | null };

type World = {
  readonly conversation: MongoDocument;
  readonly members: Member[];
  readonly notices: Array<Record<string, unknown>>;
  readonly emitted: Array<{ room: string; event: string; payload: unknown }>;
  readonly prisma: Record<string, unknown>;
  barrier: number;
};

const ANALYST_ALICE: Member = { userId: ALICE, role: 'member', user: { role: 'ANALYST' } };
const USER_BOB: Member = { userId: BOB, role: 'member', user: { role: 'USER' } };

function makeWorld(conversation: MongoDocument, members: Member[] = [ANALYST_ALICE, USER_BOB]): World {
  const world: World = { conversation: { id: CONV_ID, type: 'direct', ...conversation }, members, notices: [], emitted: [], prisma: {}, barrier: 0 };
  const waiters: Array<() => void> = [];
  const pick = (row: MongoDocument): MongoDocument => ({
    id: row.id,
    type: row.type,
    encryptionMode: row.encryptionMode ?? null,
    encryptionEnabledAt: row.encryptionEnabledAt ?? null,
    encryptionEnabledBy: row.encryptionEnabledBy ?? null,
    encryptionEpoch: row.encryptionEpoch,
    participants: world.members,
  });
  Object.assign(world.prisma, {
    conversation: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        if (where.id !== CONV_ID) return null;
        const snapshot = pick({ ...world.conversation });
        if (world.barrier > 1) {
          world.barrier -= 1;
          await new Promise<void>((resolve) => waiters.push(resolve));
        } else {
          waiters.splice(0).forEach((resolve) => resolve());
        }
        return snapshot;
      }),
      updateMany: jest.fn(async ({ where, data }: { where: MongoDocument; data: MongoDocument }) => {
        if (!matchesMongoWhere(world.conversation, where)) return { count: 0 };
        Object.assign(world.conversation, data);
        return { count: 1 };
      }),
      update: jest.fn(async () => ({ id: CONV_ID })),
      // #12966 — la paire n'a pas d'autre tête-à-tête.
      findMany: jest.fn(async () => []),
    },
    participant: {
      findFirst: jest.fn(async ({ where }: { where: { userId: string } }) =>
        where.userId === ALICE ? { id: ALICE_PARTICIPANT, displayName: 'Alice' } : null),
    },
    message: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const notice = { id: `n${world.notices.length}`, createdAt: new Date('2026-10-25T10:00:00Z'), ...data };
        world.notices.push(notice);
        return notice;
      }),
    },
  });
  return world;
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

const enable = (app: FastifyInstance, conversationId = CONV_ID) =>
  app.inject({ method: 'POST', url: `/conversations/${conversationId}/encryption`, payload: { mode: 'e2ee' } });
const disable = (app: FastifyInstance, conversationId = CONV_ID) =>
  app.inject({ method: 'DELETE', url: `/conversations/${conversationId}/encryption` });
const status = (app: FastifyInstance) => app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/encryption-status` });

const ENABLED = { encryptionMode: 'e2ee', encryptionProtocol: 'signal_v3', encryptionEnabledAt: new Date('2026-10-24T08:00:00Z'), encryptionEnabledBy: ALICE };

describe('une conversation chiffrée de bout en bout ne repasse jamais en clair (#12949)', () => {
  beforeEach(() => as(ALICE));

  it.each([
    ['jamais basculée', { ...ENABLED }],
    ['à l’époque 3', { ...ENABLED, encryptionEpoch: 3 }],
    ['au mode écrit en capitales par un ancien client', { ...ENABLED, encryptionMode: 'E2EE' }],
  ])('désactiver une conversation e2ee %s : 409 E2EE_IRREVERSIBLE, rien n’est écrit, rien n’est annoncé', async (_label, regime) => {
    const world = makeWorld(regime);
    const before = { ...world.conversation };
    const app = await buildApp(world);

    const res = await disable(app);
    await new Promise((resolve) => setImmediate(resolve));

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ success: false, code: 'E2EE_IRREVERSIBLE' });
    expect(res.json().error).toMatch(/new conversation/i);
    expect(world.conversation).toEqual(before);
    expect(world.notices).toEqual([]);
    expect(world.emitted).toEqual([]);
    await app.close();
  });

  it('un USER membre reçoit d’abord le 403 de la politique, comme avant : rien de nouveau n’est appris', async () => {
    as(BOB);
    const world = makeWorld({ ...ENABLED });
    const app = await buildApp(world);

    const res = await disable(app);

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'ENCRYPTION_ACTIVATION_RESTRICTED' });
    expect(world.conversation.encryptionMode).toBe('e2ee');
    await app.close();
  });

  it.each(['server', 'hybrid'])('reposer le mode %s sur une conversation e2ee : 409 E2EE_IRREVERSIBLE, le régime ne bouge pas', async (mode) => {
    const world = makeWorld({ ...ENABLED, encryptionEpoch: 2 });
    const app = await buildApp(world);

    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, payload: { mode } });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'E2EE_IRREVERSIBLE' });
    expect(world.conversation).toMatchObject({ encryptionMode: 'e2ee', encryptionEpoch: 2 });
    await app.close();
  });

  it('un régime à mode inconnu ne se désactive pas non plus : seul server ou hybrid se quitte', async () => {
    const world = makeWorld({ encryptionMode: 'signal', encryptionEnabledAt: new Date('2026-01-01T00:00:00Z') });
    const app = await buildApp(world);

    const res = await disable(app);

    expect(res.statusCode).toBe(409);
    expect(world.conversation.encryptionMode).toBe('signal');
    await app.close();
  });

  it('une activation sans mode mais datée (anomalie) reste fermée : elle ne se désactive pas', async () => {
    const world = makeWorld({ encryptionEnabledAt: new Date('2026-01-01T00:00:00Z') });
    const app = await buildApp(world);

    const res = await disable(app);

    expect(res.statusCode).toBe(409);
    expect(world.conversation.encryptionEnabledAt).toEqual(new Date('2026-01-01T00:00:00Z'));
    await app.close();
  });
});

describe('le chiffrement au repos (server, hybrid) se désactive encore (#12522)', () => {
  beforeEach(() => as(ALICE));

  const SERVER = { ...ENABLED, encryptionMode: 'server', encryptionProtocol: 'aes-256-gcm', serverEncryptionKeyId: 'k1' };

  it('désactive une conversation server jamais basculée : régime en clair, époque 1, clé serveur intacte', async () => {
    const world = makeWorld({ ...SERVER });
    const app = await buildApp(world);

    const res = await disable(app);

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ isEncrypted: false, mode: null, enabledAt: null, epoch: 1, canDisableEncryption: false });
    expect(world.conversation).toMatchObject({ encryptionMode: null, encryptionEnabledAt: null, encryptionEpoch: 1, serverEncryptionKeyId: 'k1' });
    await app.close();
  });

  it('laisse dans le fil une ligne système nommant son auteur, et prévient chaque membre actif', async () => {
    const world = makeWorld({ ...SERVER, encryptionMode: 'hybrid', encryptionEpoch: 3 });
    const app = await buildApp(world);

    await disable(app);
    await new Promise((resolve) => setImmediate(resolve));

    expect(world.notices).toEqual([
      expect.objectContaining({
        conversationId: CONV_ID,
        senderId: ALICE_PARTICIPANT,
        messageType: 'system',
        content: expect.stringContaining('Alice a désactivé le chiffrement de cette conversation'),
        metadata: { kind: 'encryption-disabled', previousMode: 'hybrid', epoch: 4, actor: { participantId: ALICE_PARTICIPANT, displayName: 'Alice' } },
      }),
    ]);
    const changes = world.emitted.filter((entry) => entry.event === 'conversation:encryption-changed');
    expect(changes.map((entry) => entry.room).sort()).toEqual([`user:${ALICE}`, `user:${BOB}`]);
    expect(changes[0].payload).toMatchObject({ isEncrypted: false, mode: null, epoch: 4 });
    await app.close();
  });

  it('refuse 400 ENCRYPTION_NOT_ENABLED une conversation déjà en clair, sans rien écrire', async () => {
    const world = makeWorld({});
    const app = await buildApp(world);

    const res = await disable(app);

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ success: false, code: 'ENCRYPTION_NOT_ENABLED' });
    expect(world.notices).toEqual([]);
    expect(world.conversation.encryptionEpoch).toBeUndefined();
    await app.close();
  });

  it('refuse à un ANALYST simple membre d’un groupe : le rang de conversation reste exigé', async () => {
    const world = makeWorld({ ...SERVER, type: 'group' });
    const app = await buildApp(world);

    const res = await disable(app);

    expect(res.statusCode).toBe(403);
    expect(world.conversation.encryptionMode).toBe('server');
    await app.close();
  });

  it('passe ensuite au bout en bout : époque 2, et la conversation ne se désactive plus', async () => {
    const world = makeWorld({ ...SERVER });
    const app = await buildApp(world);

    await disable(app);
    const res = await enable(app);
    const again = await disable(app);

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ isEncrypted: true, mode: 'e2ee', epoch: 2, canDisableEncryption: false, canToggleEncryption: false });
    expect(again.statusCode).toBe(409);
    expect(world.notices.map((notice) => (notice.metadata as { kind: string }).kind)).toEqual(['encryption-disabled', 'encryption-enabled']);
    await app.close();
  });

  it('l’avis d’activation nomme aussi son auteur et son époque', async () => {
    const world = makeWorld({});
    const app = await buildApp(world);

    await enable(app);

    expect(world.notices[0].metadata).toEqual({
      kind: 'encryption-enabled',
      mode: 'e2ee',
      epoch: 1,
      actor: { participantId: ALICE_PARTICIPANT, displayName: 'Alice' },
    });
    expect(world.emitted.find((entry) => entry.event === 'conversation:encryption-changed')?.payload).toMatchObject({ isEncrypted: true, mode: 'e2ee', epoch: 1 });
    await app.close();
  });
});

describe('la bascule est atomique (#12521)', () => {
  beforeEach(() => as(ALICE));

  it('deux activations concurrentes : une seule aboutit, l’autre rend 409 E2EE_REGIME_CHANGED', async () => {
    const world = makeWorld({});
    world.barrier = 2;
    const app = await buildApp(world);

    const results = await Promise.all([enable(app), enable(app)]);

    expect(results.map((res) => res.statusCode).sort()).toEqual([200, 409]);
    expect(results.find((res) => res.statusCode === 409)?.json()).toMatchObject({ success: false, code: 'E2EE_REGIME_CHANGED' });
    expect(world.conversation.encryptionEpoch).toBe(1);
    expect(world.notices).toHaveLength(1);
    await app.close();
  });

  it('deux désactivations concurrentes d’une conversation server ne posent qu’une bascule', async () => {
    const world = makeWorld({ ...ENABLED, encryptionMode: 'server', encryptionEpoch: 5 });
    world.barrier = 2;
    const app = await buildApp(world);

    const results = await Promise.all([disable(app), disable(app)]);

    expect(results.map((res) => res.statusCode).sort()).toEqual([200, 409]);
    expect(world.conversation.encryptionEpoch).toBe(6);
    await app.close();
  });
});

describe('un étranger n’apprend rien de la conversation (#12563)', () => {
  it.each([
    ['activer', enable],
    ['désactiver', disable],
  ])('%s : même 404 qu’une conversation inexistante, qu’elle soit chiffrée ou non', async (_label, act) => {
    as(STRANGER);
    const encrypted = await buildApp(makeWorld({ ...ENABLED }));
    const clear = await buildApp(makeWorld({}));

    const answers = await Promise.all([act(encrypted), act(clear), act(clear, UNKNOWN_CONV_ID)]);

    expect(answers.map((res) => res.statusCode)).toEqual([404, 404, 404]);
    expect(new Set(answers.map((res) => res.body)).size).toBe(1);
    await encrypted.close();
    await clear.close();
  });

  it('un USER membre d’une conversation déjà chiffrée reçoit le 403 de la politique, jamais « déjà activé »', async () => {
    as(BOB);
    const app = await buildApp(makeWorld({ ...ENABLED }));

    const res = await enable(app);

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'ENCRYPTION_ACTIVATION_RESTRICTED' });
    await app.close();
  });

  it('un ANALYST membre d’une conversation déjà chiffrée reçoit 400 ENCRYPTION_ALREADY_ENABLED', async () => {
    as(ALICE);
    const app = await buildApp(makeWorld({ ...ENABLED }));

    const res = await enable(app);

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'ENCRYPTION_ALREADY_ENABLED' });
    await app.close();
  });
});

describe('encryption-status sert l’époque et le droit de basculer (spec § 5.3)', () => {
  it.each([
    ['un ANALYST membre d’un tête-à-tête', ALICE, 'direct', true],
    ['un USER membre d’un tête-à-tête', BOB, 'direct', false],
    ['un ANALYST simple membre d’un groupe', ALICE, 'group', false],
  ])('%s, conversation en clair : le droit d’activer suit la politique', async (_label, userId, type, expected) => {
    as(userId as string);
    const app = await buildApp(makeWorld({ type, encryptionEpoch: 2 }));

    const res = await status(app);

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ isEncrypted: false, epoch: 2, canToggleEncryption: expected, canDisableEncryption: false });
    await app.close();
  });

  it.each([
    ['un ANALYST membre d’un tête-à-tête', ALICE, 'direct'],
    ['un USER membre d’un tête-à-tête', BOB, 'direct'],
    ['un ANALYST membre d’un groupe', ALICE, 'group'],
  ])('%s, conversation e2ee : ni basculer ni désactiver, jamais (#12949)', async (_label, userId, type) => {
    as(userId as string);
    const app = await buildApp(makeWorld({ ...ENABLED, type, encryptionEpoch: 7 }));

    const res = await status(app);

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ isEncrypted: true, mode: 'e2ee', epoch: 7, canToggleEncryption: false, canDisableEncryption: false });
    await app.close();
  });

  it('un ANALYST membre d’un tête-à-tête server peut le désactiver', async () => {
    as(ALICE);
    const app = await buildApp(makeWorld({ ...ENABLED, encryptionMode: 'server' }));

    const res = await status(app);

    expect(res.json().data).toMatchObject({ mode: 'server', canToggleEncryption: true, canDisableEncryption: true });
    await app.close();
  });

  it('un document jamais basculé est servi à l’époque 0', async () => {
    as(ALICE);
    const app = await buildApp(makeWorld({}));

    const res = await status(app);

    expect(res.json().data).toMatchObject({ isEncrypted: false, epoch: 0 });
    await app.close();
  });
});
