/**
 * Route tests — conversation-encryption routes
 *
 * Covers both routes via Fastify inject:
 *   GET  /conversations/:conversationId/encryption-status
 *   POST /conversations/:conversationId/encryption
 *
 * Key branches:
 *   GET:
 *     - conversation not found → 404
 *     - not anonymous + not a member → 403
 *     - anonymous user → skips membership check
 *     - member found → 200 (isEncrypted=true/false, canTranslate=true/false)
 *     - throws → 500
 *   POST:
 *     - anonymous user → 403
 *     - invalid mode → 400
 *     - conversation not found → 404
 *     - already encrypted → 400
 *     - not a member → 403
 *     - group + no moderator role → 403
 *     - only a platform ADMIN|BIGBOSS member may activate, every mode (#12517)
 *     - mode=e2ee → no server key
 *     - mode=server → getOrCreateConversationKey called
 *     - senderParticipant found → message created
 *     - senderParticipant null → no message
 *     - the notice is broadcast (message:new + conversation:updated), detached
 *       from the response, which survives a failing or hanging emission (#11416)
 *     - throws → 500
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Module-level mock controls ───────────────────────────────────────────────

const mockGetOrCreateConversationKey = jest.fn<any>().mockResolvedValue('server-key-id');

jest.mock('../../../services/EncryptionService', () => ({
  getEncryptionService: jest.fn().mockResolvedValue({
    getOrCreateConversationKey: (...a: unknown[]) => mockGetOrCreateConversationKey(...a),
  }),
}));

// mutable auth context — tests mutate it before inject
let testAuthContext: Record<string, unknown> = {
  isAuthenticated: true,
  isAnonymous: false,
  userId: '507f1f77bcf86cd799439011',
};

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() =>
    async (request: any, _reply: any) => {
      request.authContext = testAuthContext;
    }
  ),
  UnifiedAuthRequest: {},
}));

// validateParams / validateBody are no-ops so tests control params/body freely
jest.mock('../../../validation/helpers.js', () => ({
  validateParams: jest.fn(() => async (_req: any, _reply: any) => {}),
  validateBody: jest.fn(() => async (_req: any, _reply: any) => {}),
}));

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

// ─── Import under test ────────────────────────────────────────────────────────

import encryptionRoutes from '../../../routes/conversation-encryption';

// ─── Constants ───────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_ID = '507f1f77bcf86cd799439012';
const CONV_ID = '507f1f77bcf86cd799439013';
const PARTICIPANT_ID = '507f1f77bcf86cd799439014';
const AUTH = { authorization: 'Bearer valid-token' };

const NOTICE = {
  id: '507f1f77bcf86cd799439015',
  conversationId: CONV_ID,
  senderId: PARTICIPANT_ID,
  messageType: 'system',
  metadata: { kind: 'encryption-enabled', mode: 'e2ee' },
  createdAt: new Date('2026-10-24T10:00:00.000Z'),
};

// ─── Prisma factory ───────────────────────────────────────────────────────────

type ConvShape = {
  encryptionEnabledAt?: Date | null;
  encryptionMode?: string | null;
  encryptionEnabledBy?: string | null;
  participants?: Array<{ userId: string; role?: string; user?: { role: string } | null }>;
  type?: string;
} | null;

function makeConversation(conv: ConvShape) {
  if (!conv) return null;
  return {
    id: CONV_ID,
    encryptionEnabledAt: conv.encryptionEnabledAt ?? null,
    encryptionMode: conv.encryptionMode ?? null,
    encryptionEnabledBy: conv.encryptionEnabledBy ?? null,
    participants: conv.participants ?? [{ userId: USER_ID, role: 'MEMBER' }],
    type: conv.type ?? 'group',
  };
}

function makePrisma(opts: {
  conversation?: ConvShape;
  senderParticipant?: { id: string } | null;
  conversationFindError?: Error | null;
} = {}) {
  const { conversation = {}, senderParticipant = { id: PARTICIPANT_ID }, conversationFindError = null } = opts;
  return {
    conversation: {
      findUnique: conversationFindError
        ? jest.fn().mockRejectedValue(conversationFindError)
        : jest.fn().mockResolvedValue(makeConversation(conversation)),
      update: jest.fn().mockResolvedValue({
        id: CONV_ID,
        encryptionEnabledAt: new Date(),
        encryptionMode: 'e2ee',
        encryptionProtocol: 'signal_v3',
        encryptionEnabledBy: USER_ID,
      }),
    },
    participant: {
      findFirst: jest.fn().mockResolvedValue(senderParticipant),
    },
    message: {
      create: jest.fn().mockResolvedValue(NOTICE),
    },
  };
}

// ─── App builder ─────────────────────────────────────────────────────────────

async function buildApp(
  prismaOpts: Parameters<typeof makePrisma>[0] = {},
  broadcastMessage?: jest.Mock<(message: unknown, conversationId: string) => Promise<void>>,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', makePrisma(prismaOpts) as unknown);
  if (broadcastMessage) {
    app.decorate('socketIOHandler', { getManager: () => ({ broadcastMessage }) } as unknown);
  }
  await app.register(encryptionRoutes);
  await app.ready();
  return app;
}

// ─── GET /conversations/:conversationId/encryption-status ────────────────────

describe('GET /conversations/:conversationId/encryption-status', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    testAuthContext = { isAuthenticated: true, isAnonymous: false, userId: USER_ID };
  });

  it('returns 404 when conversation not found', async () => {
    const app = await buildApp({ conversation: null });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/encryption-status`, headers: AUTH });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns the 404 of an unknown conversation when user is not a member (non-anonymous, #8116)', async () => {
    const app = await buildApp({ conversation: { participants: [{ userId: OTHER_ID }] } });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/encryption-status`, headers: AUTH });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ success: false, error: 'Conversation not found' });
    await app.close();
  });

  it('returns 200 with isEncrypted=false when encryption not enabled', async () => {
    const app = await buildApp({ conversation: { participants: [{ userId: USER_ID }], encryptionEnabledAt: null } });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/encryption-status`, headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.isEncrypted).toBe(false);
    expect(body.data.canTranslate).toBe(false);
    await app.close();
  });

  it('returns 200 with isEncrypted=true and canTranslate=true for server mode', async () => {
    const app = await buildApp({
      conversation: {
        participants: [{ userId: USER_ID }],
        encryptionEnabledAt: new Date(),
        encryptionMode: 'server',
        encryptionEnabledBy: USER_ID,
      },
    });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/encryption-status`, headers: AUTH });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.isEncrypted).toBe(true);
    expect(body.data.canTranslate).toBe(true);
    await app.close();
  });

  it('returns 200 with canTranslate=true for hybrid mode', async () => {
    const app = await buildApp({
      conversation: {
        participants: [{ userId: USER_ID }],
        encryptionEnabledAt: new Date(),
        encryptionMode: 'hybrid',
      },
    });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/encryption-status`, headers: AUTH });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.canTranslate).toBe(true);
    await app.close();
  });

  it('skips membership check for anonymous user and returns 200', async () => {
    testAuthContext = { isAuthenticated: true, isAnonymous: true, userId: USER_ID };
    // participants don't include USER_ID but anonymous check is skipped
    const app = await buildApp({ conversation: { participants: [{ userId: OTHER_ID }] } });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/encryption-status`, headers: AUTH });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 500 on db error', async () => {
    const app = await buildApp({ conversationFindError: new Error('db crash') });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/encryption-status`, headers: AUTH });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── POST /conversations/:conversationId/encryption ──────────────────────────

describe('POST /conversations/:conversationId/encryption', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    testAuthContext = { isAuthenticated: true, isAnonymous: false, userId: USER_ID };
  });

  it('returns 403 for anonymous users', async () => {
    testAuthContext = { isAuthenticated: true, isAnonymous: true, userId: USER_ID };
    const app = await buildApp();
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'e2ee' } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 400 for invalid mode', async () => {
    const app = await buildApp({ conversation: { participants: [{ userId: USER_ID, role: 'admin' }] } });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'invalid' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 404 when conversation not found', async () => {
    const app = await buildApp({ conversation: null });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'e2ee' } });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns 400 when encryption is already enabled', async () => {
    const app = await buildApp({
      conversation: {
        participants: [{ userId: USER_ID, role: 'admin' }],
        encryptionEnabledAt: new Date(),
        encryptionMode: 'e2ee',
      },
    });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'server' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 403 when user is not a member', async () => {
    const app = await buildApp({ conversation: { participants: [{ userId: OTHER_ID, role: 'admin' }] } });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'e2ee' } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 403 for group conversation when member lacks moderator role', async () => {
    const app = await buildApp({
      conversation: { participants: [{ userId: USER_ID, role: 'MEMBER' }], type: 'group' },
    });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'e2ee' } });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it.each([
    ['un ADMIN de plateforme membre d’un groupe', { role: 'member', user: { role: 'ADMIN' } }, 'group'],
    ['un BIGBOSS de plateforme membre d’un groupe', { role: 'member', user: { role: 'BIGBOSS' } }, 'group'],
    ['un ADMIN de plateforme dans un tête-à-tête, rôle en minuscules', { role: 'member', user: { role: 'admin' } }, 'direct'],
    ['un BIGBOSS de plateforme créateur du groupe', { role: 'creator', user: { role: 'BIGBOSS' } }, 'group'],
    ['un MODERATOR de plateforme dans un tête-à-tête', { role: 'member', user: { role: 'MODERATOR' } }, 'direct'],
    ['un MODERATOR de plateforme dans un tête-à-tête, rôle en minuscules', { role: 'member', user: { role: 'moderator' } }, 'direct'],
    ['un MODERATOR de plateforme créateur du groupe', { role: 'creator', user: { role: 'MODERATOR' } }, 'group'],
    ['un MODERATOR de plateforme modérateur du groupe', { role: 'moderator', user: { role: 'Moderator' } }, 'group'],
    ['un AUDIT de plateforme dans un tête-à-tête', { role: 'member', user: { role: 'AUDIT' } }, 'direct'],
    ['un AUDIT de plateforme créateur du groupe, rôle en minuscules', { role: 'creator', user: { role: 'audit' } }, 'group'],
    ['un ANALYST de plateforme dans un tête-à-tête', { role: 'member', user: { role: 'ANALYST' } }, 'direct'],
    ['un ANALYST de plateforme créateur du groupe, rôle en minuscules', { role: 'creator', user: { role: 'analyst' } }, 'group'],
  ])('active le chiffrement pour %s (#12517, #12588)', async (_label, member, type) => {
    const app = await buildApp({ conversation: { participants: [{ userId: USER_ID, ...member }], type } });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'e2ee' } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it.each([
    ['le créateur USER d’un groupe', { role: 'creator', user: { role: 'USER' } }, 'group'],
    ['un administrateur USER du groupe', { role: 'admin', user: { role: 'USER' } }, 'group'],
    ['un modérateur USER du groupe', { role: 'MODERATOR', user: { role: 'USER' } }, 'group'],
    ['un MODERATOR de plateforme simple membre d’un groupe — rang de conversation insuffisant', { role: 'member', user: { role: 'MODERATOR' } }, 'group'],
    ['un AUDIT de plateforme simple membre d’un groupe — rang de conversation insuffisant', { role: 'member', user: { role: 'AUDIT' } }, 'group'],
    ['un ANALYST de plateforme simple membre d’un groupe — rang de conversation insuffisant', { role: 'member', user: { role: 'ANALYST' } }, 'group'],
    ['un USER dans un tête-à-tête', { role: 'member', user: { role: 'USER' } }, 'direct'],
    ['un rôle de plateforme absent dans un tête-à-tête — fermé par défaut', { role: 'member', user: null }, 'direct'],
    ['un rang illisible (owner) — fermé par défaut', { role: 'owner', user: { role: 'USER' } }, 'group'],
  ])('refuse le chiffrement à %s tant que l’E2EE n’est pas opérationnel (#12517)', async (_label, member, type) => {
    const prisma = makePrisma({ conversation: { participants: [{ userId: USER_ID, ...member }], type } });
    const app = Fastify({ logger: false });
    app.decorate('prisma', prisma as unknown);
    await app.register(encryptionRoutes);
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'e2ee' } });
    expect(res.statusCode).toBe(403);
    expect(prisma.conversation.update).not.toHaveBeenCalled();
    await app.close();
  });

  it.each([
    ['e2ee', 'MODERATOR'],
    ['server', 'moderator'],
    ['hybrid', 'Moderator'],
    ['e2ee', 'AUDIT'],
    ['server', 'audit'],
    ['hybrid', 'Audit'],
    ['e2ee', 'ANALYST'],
    ['server', 'analyst'],
    ['hybrid', 'Analyst'],
  ])('un rôle de plateforme ANALYST ou supérieur active le mode %s (rôle %s, #12588)', async (mode, role) => {
    const app = await buildApp({ conversation: { participants: [{ userId: USER_ID, role: 'member', user: { role } }], type: 'direct' } });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it.each(['MODERATOR', 'AUDIT', 'ANALYST', 'ADMIN'])('un %s de plateforme étranger à la conversation reste refusé (#12588)', async (role) => {
    testAuthContext = { isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID, role } };
    const prisma = makePrisma({ conversation: { participants: [{ userId: OTHER_ID, role: 'creator', user: { role: 'USER' } }], type: 'direct' } });
    const app = Fastify({ logger: false });
    app.decorate('prisma', prisma as unknown);
    await app.register(encryptionRoutes);
    await app.ready();
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'e2ee' } });
    expect(res.statusCode).toBe(403);
    expect(prisma.conversation.update).not.toHaveBeenCalled();
    await app.close();
  });

  it.each([
    ['e2ee', 'USER'],
    ['server', 'user'],
    ['hybrid', 'AGENT'],
  ])('la restriction couvre le mode %s pour %s et porte un code lisible (#12517, #12588)', async (mode, role) => {
    const app = await buildApp({ conversation: { participants: [{ userId: USER_ID, role: 'creator', user: { role } }], type: 'group' } });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode } });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, code: 'ENCRYPTION_ACTIVATION_RESTRICTED' });
    await app.close();
  });

  it.each(['e2ee', 'server', 'hybrid'])('la restriction couvre le mode %s et porte un code lisible (#12517)', async (mode) => {
    const app = await buildApp({ conversation: { participants: [{ userId: USER_ID, role: 'creator', user: { role: 'USER' } }], type: 'group' } });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode } });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, code: 'ENCRYPTION_ACTIVATION_RESTRICTED' });
    await app.close();
  });

  it('lit le rôle de plateforme dans la même lecture que la participation', async () => {
    const prisma = makePrisma({ conversation: { participants: [{ userId: USER_ID, role: 'creator' }], type: 'group' } });
    const app = Fastify({ logger: false });
    app.decorate('prisma', prisma as unknown);
    await app.register(encryptionRoutes);
    await app.ready();
    await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'e2ee' } });
    const [args] = (prisma.conversation.findUnique as jest.Mock).mock.calls.at(-1) as [{ select: { participants: { select: Record<string, unknown> } } }];
    expect(args.select.participants.select).toEqual(expect.objectContaining({ role: true, user: { select: { role: true } } }));
    await app.close();
  });

  it('returns 200 for a platform admin in a direct conversation (e2ee, no server key)', async () => {
    const app = await buildApp({
      conversation: { participants: [{ userId: USER_ID, role: 'MEMBER', user: { role: 'ADMIN' } }], type: 'direct' },
      senderParticipant: { id: PARTICIPANT_ID },
    });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'e2ee' } });
    expect(res.statusCode).toBe(200);
    expect(mockGetOrCreateConversationKey).not.toHaveBeenCalled();
    await app.close();
  });

  it('returns 200 for server mode (calls getOrCreateConversationKey)', async () => {
    const app = await buildApp({
      conversation: { participants: [{ userId: USER_ID, role: 'admin', user: { role: 'ADMIN' } }], type: 'group' },
      senderParticipant: { id: PARTICIPANT_ID },
    });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'server' } });
    expect(res.statusCode).toBe(200);
    expect(mockGetOrCreateConversationKey).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('returns 200 for hybrid mode (calls getOrCreateConversationKey)', async () => {
    const app = await buildApp({
      conversation: { participants: [{ userId: USER_ID, role: 'MODERATOR', user: { role: 'BIGBOSS' } }], type: 'group' },
      senderParticipant: { id: PARTICIPANT_ID },
    });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'hybrid' } });
    expect(res.statusCode).toBe(200);
    expect(mockGetOrCreateConversationKey).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("pose une clé localisable sur l'avis système, jamais seulement le texte anglais (#7545)", async () => {
    const app = await buildApp({
      conversation: { participants: [{ userId: USER_ID, role: 'admin', user: { role: 'ADMIN' } }], type: 'group' },
      senderParticipant: { id: PARTICIPANT_ID },
    });
    const create = (app as unknown as { prisma: { message: { create: jest.Mock } } }).prisma.message.create;
    await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'e2ee' } });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ messageType: 'system', metadata: { kind: 'encryption-enabled', mode: 'e2ee' } }),
    }));
    await app.close();
  });

  it('skips system message creation when senderParticipant is null', async () => {
    const app = await buildApp({
      conversation: { participants: [{ userId: USER_ID, role: 'admin', user: { role: 'ADMIN' } }], type: 'group' },
      senderParticipant: null,
    });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'e2ee' } });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('returns 500 on db error', async () => {
    const app = await buildApp({ conversationFindError: new Error('db crash') });
    const res = await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'e2ee' } });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
  describe("diffusion de l'avis aux membres (#11416)", () => {
    const ADMIN_GROUP = {
      conversation: { participants: [{ userId: USER_ID, role: 'admin', user: { role: 'ADMIN' } }], type: 'group' },
      senderParticipant: { id: PARTICIPANT_ID },
    };
    const enable = (app: FastifyInstance) =>
      app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, headers: AUTH, payload: { mode: 'e2ee' } });

    it("diffuse l'avis par le chemin ordinaire des messages (message:new + conversation:updated)", async () => {
      const broadcastMessage = jest.fn<(message: unknown, conversationId: string) => Promise<void>>().mockResolvedValue(undefined);
      const app = await buildApp(ADMIN_GROUP, broadcastMessage);
      const res = await enable(app);
      expect(res.statusCode).toBe(200);
      await new Promise((resolve) => setImmediate(resolve));
      expect(broadcastMessage).toHaveBeenCalledTimes(1);
      expect(broadcastMessage).toHaveBeenCalledWith(NOTICE, CONV_ID);
      await app.close();
    });

    it("fait de l'avis le dernier message du fil : l'horloge avance sur son createdAt", async () => {
      const broadcastMessage = jest.fn<(message: unknown, conversationId: string) => Promise<void>>().mockResolvedValue(undefined);
      const app = await buildApp(ADMIN_GROUP, broadcastMessage);
      const update = (app as unknown as { prisma: { conversation: { update: jest.Mock } } }).prisma.conversation.update;
      await enable(app);
      expect(update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: CONV_ID },
        data: { lastMessageAt: NOTICE.createdAt },
      }));
      await app.close();
    });

    it("pose l'avis comme message système, sa clé localisable et son texte de repli anglais (rétrocompatible)", async () => {
      const app = await buildApp(ADMIN_GROUP, jest.fn<(message: unknown, conversationId: string) => Promise<void>>().mockResolvedValue(undefined));
      const create = (app as unknown as { prisma: { message: { create: jest.Mock } } }).prisma.message.create;
      await enable(app);
      expect(create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          conversationId: CONV_ID,
          senderId: PARTICIPANT_ID,
          messageType: 'system',
          messageSource: 'system',
          originalLanguage: 'en',
          content: expect.stringContaining('End-to-end encryption enabled'),
          metadata: { kind: 'encryption-enabled', mode: 'e2ee' },
        }),
      }));
      await app.close();
    });

    it("une diffusion qui échoue ne fait pas échouer l'activation", async () => {
      const broadcastMessage = jest.fn<(message: unknown, conversationId: string) => Promise<void>>().mockRejectedValue(new Error('socket down'));
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown) => unhandled.push(reason);
      process.on('unhandledRejection', onUnhandled);
      const app = await buildApp(ADMIN_GROUP, broadcastMessage);
      const res = await enable(app);
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));
      process.off('unhandledRejection', onUnhandled);
      expect(res.statusCode).toBe(200);
      expect(broadcastMessage).toHaveBeenCalledTimes(1);
      expect(unhandled).toEqual([]);
      await app.close();
    });

    it("une diffusion qui lève de façon synchrone ne fait pas échouer l'activation", async () => {
      const broadcastMessage = jest.fn<(message: unknown, conversationId: string) => Promise<void>>().mockImplementation(() => {
        throw new Error('encoder crash');
      });
      const app = await buildApp(ADMIN_GROUP, broadcastMessage);
      const res = await enable(app);
      expect(res.statusCode).toBe(200);
      await app.close();
    });

    it("la réponse n'attend pas la diffusion : une émission qui ne finit jamais ne la retient pas", async () => {
      const broadcastMessage = jest.fn<(message: unknown, conversationId: string) => Promise<void>>().mockReturnValue(new Promise<void>(() => undefined));
      const app = await buildApp(ADMIN_GROUP, broadcastMessage);
      const res = await enable(app);
      expect(res.statusCode).toBe(200);
      expect(broadcastMessage).toHaveBeenCalledTimes(1);
      await app.close();
    });

    it("n'écrit ni ne diffuse aucun avis quand l'acteur n'a pas de ligne Participant active", async () => {
      const broadcastMessage = jest.fn<(message: unknown, conversationId: string) => Promise<void>>().mockResolvedValue(undefined);
      const app = await buildApp({ ...ADMIN_GROUP, senderParticipant: null }, broadcastMessage);
      const res = await enable(app);
      expect(res.statusCode).toBe(200);
      expect(broadcastMessage).not.toHaveBeenCalled();
      await app.close();
    });
  });
});
