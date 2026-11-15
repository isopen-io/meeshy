/**
 * Le rang souverain agit sans motif écrit (spec 2026-10-04 § 4) — sur les
 * gestes de CONVERSATION : lecture des messages, configuration, rang d'un
 * membre, retrait d'un membre.
 *
 * Trois témoins par geste, les trois de la spec :
 * - BIGBOSS sans motif → le geste a lieu ET sa ligne d'audit est écrite ;
 * - ADMIN sans motif → 400, le message d'AJV d'hier, rien n'est écrit ;
 * - BIGBOSS avec un motif court non vide → 400 (un motif fourni est validé).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));
jest.mock('../../../../utils/logger', () => ({ logError: jest.fn(), logInfo: jest.fn() }));

const ADMIN_ID = '507f1f77bcf86cd799439001';
const CONV_ID = '507f1f77bcf86cd799439aaa';
const MEMBER_ID = '507f1f77bcf86cd799439bbb';
type AnyRecord = Record<string, unknown>;

const MEMBRE = { id: 'pt-member', userId: MEMBER_ID, isActive: true, role: 'member', displayName: 'Bob' };

function ligneConversation(surcharge: AnyRecord = {}): AnyRecord {
  return {
    id: CONV_ID, identifier: 'mshy_team', title: 'Team', description: null, type: 'group', avatar: null,
    banner: null, isActive: true, closedAt: null, communityId: null, createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'), lastMessageAt: new Date('2026-01-03'), defaultWriteRole: 'everyone',
    isAnnouncementChannel: false, slowModeSeconds: 0, autoTranslateEnabled: true, encryptionMode: null,
    _count: { participants: 2 }, conversationMessageStats: null, participants: [MEMBRE], closedBy: null,
    ...surcharge,
  };
}

function fauxPrisma() {
  return {
    conversation: {
      findUnique: jest.fn(async () => ligneConversation()),
      findFirst: jest.fn(async () => null),
      update: jest.fn(async (args: { data: AnyRecord }) => ligneConversation(args.data)),
    },
    message: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
    user: { findUnique: jest.fn(async () => ({ role: 'USER' })) },
    conversationShareLink: { updateMany: jest.fn(async () => ({ count: 0 })) },
    participant: {
      findFirst: jest.fn(async () => MEMBRE),
      findUnique: jest.fn(async () => ({ ...MEMBRE, user: null })),
      findMany: jest.fn(async () => []),
      update: jest.fn(async (args: { data: AnyRecord }) => ({ ...MEMBRE, ...args.data })),
    },
    adminAuditLog: { create: jest.fn(async (args: { data: AnyRecord }) => ({ id: 'audit-1', ...args.data })) },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
}
type FauxPrisma = ReturnType<typeof fauxPrisma>;

async function monter(role: string): Promise<{ app: FastifyInstance; prisma: FauxPrisma }> {
  const prisma = fauxPrisma();
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as unknown as FastifyInstance['prisma']);
  app.decorate('socketIOHandler', { getManager: () => null } as unknown as FastifyInstance['socketIOHandler']);
  app.decorate('authenticate', async (request: FastifyRequest) => {
    (request as unknown as AnyRecord).authContext = {
      type: 'registered', isAuthenticated: true, isAnonymous: false, userId: ADMIN_ID,
      registeredUser: { id: ADMIN_ID, role }, hasFullAccess: true,
    };
  });
  const { registerConversationSettingsSovereignRoutes } = await import('../../../../routes/admin/conversation-settings-sovereign');
  const { registerConversationMessagesSovereignRoute } = await import('../../../../routes/admin/conversation-messages-sovereign');
  await app.register(async (scope) => {
    registerConversationSettingsSovereignRoutes(scope);
    registerConversationMessagesSovereignRoute(scope);
  }, { prefix: '/api/v1' });
  await app.ready();
  return { app, prisma };
}

type Geste = { nom: string; method: 'GET' | 'PATCH' | 'POST'; url: (reason?: string) => string; payload?: (reason?: string) => AnyRecord; action: string };

const avecMotif = (r?: string): AnyRecord => (r === undefined ? {} : { reason: r });

const GESTES: Geste[] = [
  {
    nom: 'lecture des messages',
    method: 'GET',
    url: (r) => `/api/v1/admin/conversations/${CONV_ID}/messages${r === undefined ? '' : `?reason=${encodeURIComponent(r)}`}`,
    action: 'ADMIN_CONVERSATION_MESSAGES_VIEWED',
  },
  {
    nom: 'configuration',
    method: 'PATCH',
    url: () => `/api/v1/admin/conversations/${CONV_ID}`,
    payload: (r) => ({ title: 'Nouveau', ...avecMotif(r) }),
    action: 'ADMIN_CONVERSATION_UPDATED',
  },
  {
    nom: "rang d'un membre",
    method: 'PATCH',
    url: () => `/api/v1/admin/conversations/${CONV_ID}/participants/${MEMBER_ID}`,
    payload: (r) => ({ role: 'moderator', ...avecMotif(r) }),
    action: 'ADMIN_CONVERSATION_MEMBER_ROLE_CHANGED',
  },
  {
    nom: "retrait d'un membre",
    method: 'POST',
    url: () => `/api/v1/admin/conversations/${CONV_ID}/participants/${MEMBER_ID}/remove`,
    payload: (r) => avecMotif(r),
    action: 'ADMIN_CONVERSATION_MEMBER_REMOVED',
  },
];

const jouer = (app: FastifyInstance, geste: Geste, reason?: string) =>
  app.inject({ method: geste.method, url: geste.url(reason), ...(geste.payload ? { payload: geste.payload(reason) } : {}) });

for (const geste of GESTES) {
  describe(`motif du rang souverain — ${geste.nom}`, () => {
    it('BIGBOSS sans motif : le geste a lieu et laisse sa ligne d’audit, sans motif', async () => {
      const { app, prisma } = await monter('BIGBOSS');
      const res = await jouer(app, geste);
      expect(res.statusCode).toBe(200);
      const ligne = prisma.adminAuditLog.create.mock.calls.map((c) => (c[0] as { data: AnyRecord }).data)
        .find((d) => d.action === geste.action);
      expect(ligne).toBeDefined();
      expect(ligne?.metadata).toBeUndefined();
      await app.close();
    });

    it('ADMIN sans motif : 400 comme hier, rien n’est écrit', async () => {
      const { app, prisma } = await monter('ADMIN');
      const res = await jouer(app, geste);
      expect(res.statusCode).toBe(400);
      const source = geste.method === 'GET' ? 'querystring' : 'body';
      expect(res.json().message).toBe(`${source} must have required property 'reason'`);
      expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
      expect(prisma.participant.update).not.toHaveBeenCalled();
      expect(prisma.conversation.update).not.toHaveBeenCalled();
      await app.close();
    });

    it('BIGBOSS avec un motif court : 400 — un motif fourni est validé', async () => {
      const { app, prisma } = await monter('BIGBOSS');
      const res = await jouer(app, geste, 'court');
      expect(res.statusCode).toBe(400);
      expect(prisma.adminAuditLog.create).not.toHaveBeenCalled();
      await app.close();
    });

    it('ADMIN avec un motif valide : le geste a lieu et le motif est consigné', async () => {
      const { app, prisma } = await monter('ADMIN');
      const res = await jouer(app, geste, 'instruction du signalement 42');
      expect(res.statusCode).toBe(200);
      const ligne = prisma.adminAuditLog.create.mock.calls.map((c) => (c[0] as { data: AnyRecord }).data)
        .find((d) => d.action === geste.action);
      expect(JSON.parse(String(ligne?.metadata))).toEqual({ reason: 'instruction du signalement 42' });
      await app.close();
    });
  });
}
