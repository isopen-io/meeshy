/**
 * admin-user-conversations.test.ts
 *
 * Tests the admin "user fiche" sub-resources added to userAdminRoutes:
 *   GET /admin/users/:userId/conversations
 *   GET /admin/users/:userId/media
 *   GET /admin/users/:userId/reports
 *   GET /admin/users/:userId/reported-messages
 *   GET /admin/conversations/:conversationId/messages
 *
 * Covers permission gating, 404 on unknown user, and the response shape
 * (pagination + membership flattening / media merge / report+message join).
 * `GET /admin/conversations/:conversationId/messages` is SOVEREIGN (#4333
 * c.3, BIGBOSS + written reason + AdminAuditLog + deletedAt/content gates) —
 * see `conversation-messages-sovereign.ts` for the route itself.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const ADMIN_ID = '507f1f77bcf86cd799439001';
const TARGET_ID = '507f1f77bcf86cd799439777';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

type AnyRecord = Record<string, unknown>;
type PrismaOpts = {
  userExists?: boolean;
  conversations?: AnyRecord[];
  total?: number;
  postMedia?: AnyRecord[];
  postMediaCount?: number;
  attachments?: AnyRecord[];
  attachmentsCount?: number;
  reports?: AnyRecord[];
  reportsCount?: number;
  participants?: AnyRecord[];
  participantsCount?: number;
  messages?: AnyRecord[];
  messagesCount?: number;
  conversationExists?: boolean;
};

function createMockPrisma(opts: PrismaOpts) {
  return {
    user: {
      findUnique: jest.fn(async () => (opts.userExists === false ? null : { id: TARGET_ID })),
    },
    conversation: {
      findMany: jest.fn(async () => opts.conversations ?? []),
      count: jest.fn(async () => opts.total ?? (opts.conversations?.length ?? 0)),
      findUnique: jest.fn(async () => (opts.conversationExists === false ? null : { id: 'conv-1' })),
    },
    postMedia: {
      findMany: jest.fn(async () => opts.postMedia ?? []),
      count: jest.fn(async () => opts.postMediaCount ?? (opts.postMedia?.length ?? 0)),
    },
    messageAttachment: {
      findMany: jest.fn(async () => opts.attachments ?? []),
      count: jest.fn(async () => opts.attachmentsCount ?? (opts.attachments?.length ?? 0)),
    },
    report: {
      findMany: jest.fn(async () => opts.reports ?? []),
      count: jest.fn(async () => opts.reportsCount ?? (opts.reports?.length ?? 0)),
    },
    participant: {
      findMany: jest.fn(async () => opts.participants ?? []),
      count: jest.fn(async () => opts.participantsCount ?? (opts.participants?.length ?? 0)),
    },
    // Le double HONORE `where.deletedAt` — leçon 300 : « quand une décision
    // d'autorisation/de contenu vit dans un `where`, le faux Prisma doit
    // appliquer ce `where`, sinon la garde est hors de portée du témoin ».
    // Aucun autre appelant de `message.findMany` dans ce fichier ne pose
    // `deletedAt: null` (vérifié : `reported-messages` filtre par
    // `senderId`/`id` seuls) — le filtre est donc un NO-OP pour eux.
    message: {
      findMany: jest.fn(async (args?: { where?: AnyRecord }) => {
        const rows = opts.messages ?? [];
        if (args?.where?.deletedAt === null) {
          return rows.filter((m) => !m.deletedAt);
        }
        return rows;
      }),
      count: jest.fn(async () => opts.messagesCount ?? (opts.messages?.length ?? 0)),
    },
    adminAuditLog: {
      create: jest.fn(async (args: { data: AnyRecord }) => ({ id: 'audit-1', ...args.data })),
    },
  } as unknown as PrismaClient;
}

async function buildApp(prisma: PrismaClient, role: string | null): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  (app as unknown as { prisma: PrismaClient }).prisma = prisma;

  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = role
      ? {
          type: 'registered',
          isAuthenticated: true,
          isAnonymous: false,
          userId: ADMIN_ID,
          registeredUser: { id: ADMIN_ID, role },
          hasFullAccess: true,
        }
      : { isAuthenticated: false, isAnonymous: false };
  });

  const { userAdminRoutes } = await import('../../../routes/admin/users');
  await app.register(userAdminRoutes, { prefix: '/api/v1' });
  await app.ready();
  return app;
}

describe('GET /admin/users/:userId/conversations', () => {
  it('returns 403 for a role without canViewUsers (USER)', async () => {
    const app = await buildApp(createMockPrisma({}), 'USER');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/users/${TARGET_ID}/conversations`,
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 404 when the target user does not exist', async () => {
    const app = await buildApp(createMockPrisma({ userExists: false }), 'ADMIN');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/users/${TARGET_ID}/conversations`,
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns paginated conversations with the target user membership flattened', async () => {
    const prisma = createMockPrisma({
      conversations: [
        {
          id: 'c1',
          identifier: 'mshy_one',
          title: 'Team',
          type: 'group',
          avatar: null,
          isActive: true,
          _count: { participants: 4 },
          communityId: null,
          createdAt: new Date('2026-01-01').toISOString(),
          lastMessageAt: new Date('2026-06-01').toISOString(),
          participants: [
            { id: 'pt-target', userId: TARGET_ID, type: 'user', displayName: 'Target', avatar: null, role: 'moderator', joinedAt: new Date('2026-01-02').toISOString(), isActive: true, nickname: null, user: { id: TARGET_ID, username: 'target', displayName: 'Target', avatar: null } },
            { id: 'pt-other', userId: 'other-user', type: 'user', displayName: 'Other', avatar: null, role: 'member', joinedAt: new Date('2026-01-03').toISOString(), isActive: true, nickname: null, user: { id: 'other-user', username: 'other', displayName: 'Other', avatar: null } },
          ],
        },
      ],
      total: 7,
    });
    const app = await buildApp(prisma, 'ADMIN');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/users/${TARGET_ID}/conversations?offset=0&limit=20`,
      headers: { authorization: 'Bearer x' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].membership).toMatchObject({ userId: TARGET_ID, role: 'moderator' });
    // Effectif compté par la base. La colonne `Conversation.memberCount` que
    // cette route lisait n'est écrite nulle part dans le gateway : l'écran
    // admin annonçait « 0 membres » sur toute conversation créée depuis la
    // migration héritée.
    expect(body.data[0].memberCount).toBe(4);
    // participants are now surfaced (preview for direct display / group modal)
    expect(body.data[0].participants).toHaveLength(2);
    expect(body.pagination).toMatchObject({ total: 7, offset: 0, limit: 20, hasMore: true });
    await app.close();
  });
});

/**
 * #7845 D — tri, filtres et métadonnées de la liste des conversations d'un
 * membre. Le double honore ce qu'on lui passe au sens où chaque témoin lit
 * l'ARGUMENT reçu par Prisma : un tri qui n'atteint pas `orderBy` est un
 * contrôle sans effet (loi 4), et c'est ce que ces témoins regardent.
 */
describe('GET /admin/users/:userId/conversations — tri, filtres, métadonnées (#7845 D)', () => {
  const url = (qs = '') => `/api/v1/admin/users/${TARGET_ID}/conversations${qs}`;
  type FindManyArgs = { where: AnyRecord; orderBy: AnyRecord; select?: AnyRecord; skip?: number; take?: number };
  const argsOf = (fn: unknown): FindManyArgs =>
    (fn as jest.Mock).mock.calls[0]?.[0] as FindManyArgs;

  const conversationRow = (overrides: AnyRecord = {}): AnyRecord => ({
    id: 'c1',
    identifier: 'mshy_one',
    title: 'Team',
    description: 'Le groupe',
    type: 'group',
    avatar: null,
    banner: 'b.jpg',
    isActive: true,
    closedAt: null,
    communityId: null,
    createdAt: new Date('2026-01-01').toISOString(),
    updatedAt: new Date('2026-02-01').toISOString(),
    lastMessageAt: new Date('2026-06-01').toISOString(),
    defaultWriteRole: 'everyone',
    isAnnouncementChannel: false,
    slowModeSeconds: 30,
    autoTranslateEnabled: true,
    encryptionMode: null,
    _count: { participants: 9 },
    conversationMessageStats: { totalMessages: 120 },
    participants: [],
    ...overrides,
  });

  it('porte sort=title&order=asc jusqu\'à orderBy', async () => {
    const prisma = createMockPrisma({ conversations: [] });
    const app = await buildApp(prisma, 'ADMIN');
    const res = await app.inject({ method: 'GET', url: url('?sort=title&order=asc') });
    expect(res.statusCode).toBe(200);
    expect(argsOf(prisma.conversation.findMany).orderBy).toEqual({ title: 'asc' });
    await app.close();
  });

  it('trie par défaut sur lastMessageAt desc', async () => {
    const prisma = createMockPrisma({ conversations: [] });
    const app = await buildApp(prisma, 'ADMIN');
    await app.inject({ method: 'GET', url: url() });
    expect(argsOf(prisma.conversation.findMany).orderBy).toEqual({ lastMessageAt: 'desc' });
    await app.close();
  });

  it('refuse sort=memberCount (400) — la colonne est morte, trier dessus trierait des zéros', async () => {
    const prisma = createMockPrisma({});
    const app = await buildApp(prisma, 'ADMIN');
    const res = await app.inject({ method: 'GET', url: url('?sort=memberCount') });
    expect(res.statusCode).toBe(400);
    expect(prisma.conversation.findMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse order=up (400)', async () => {
    const app = await buildApp(createMockPrisma({}), 'ADMIN');
    const res = await app.inject({ method: 'GET', url: url('?order=up') });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('refuse un rôle de membre inconnu (400)', async () => {
    const app = await buildApp(createMockPrisma({}), 'ADMIN');
    const res = await app.inject({ method: 'GET', url: url('?role=owner') });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('trie par arrivée du membre en passant par participant.findMany', async () => {
    const prisma = createMockPrisma({
      participants: [
        { id: 'pt-t', userId: TARGET_ID, role: 'member', joinedAt: new Date('2026-03-01').toISOString(), nickname: 'Tito', isActive: true, displayName: 'T', conversation: conversationRow() },
      ],
      participantsCount: 1,
    });
    const app = await buildApp(prisma, 'ADMIN');
    const res = await app.inject({ method: 'GET', url: url('?sort=joinedAt&order=asc') });
    expect(res.statusCode).toBe(200);
    const args = argsOf(prisma.participant.findMany);
    expect(args.orderBy).toEqual({ joinedAt: 'asc' });
    expect(args.where).toMatchObject({ userId: TARGET_ID, isActive: true });
    expect(prisma.conversation.findMany).not.toHaveBeenCalled();
    const body = res.json();
    expect(body.data[0]).toMatchObject({ id: 'c1', membership: { role: 'member', nickname: 'Tito' } });
    expect(body.pagination).toMatchObject({ total: 1 });
    await app.close();
  });

  it('filtre par titre OU identifiant, insensible à la casse — jamais par contenu', async () => {
    const prisma = createMockPrisma({ conversations: [] });
    const app = await buildApp(prisma, 'ADMIN');
    await app.inject({ method: 'GET', url: url('?search=team') });
    expect(argsOf(prisma.conversation.findMany).where.OR).toEqual([
      { title: { contains: 'team', mode: 'insensitive' } },
      { identifier: { contains: 'team', mode: 'insensitive' } },
    ]);
    await app.close();
  });

  it('filtre par rôle du membre et par activité', async () => {
    const prisma = createMockPrisma({ conversations: [] });
    const app = await buildApp(prisma, 'ADMIN');
    await app.inject({ method: 'GET', url: url('?role=admin&isActive=false') });
    const { where } = argsOf(prisma.conversation.findMany);
    expect(where.isActive).toBe(false);
    expect(where.participants).toEqual({ some: { userId: TARGET_ID, isActive: true, role: { in: ['admin', 'ADMIN'] } } });
    await app.close();
  });

  it('sert la ligne du membre même au-delà des six premiers participants', async () => {
    const preview = Array.from({ length: 6 }, (_, i) => ({ id: `pt-${i}`, userId: `other-${i}`, role: 'member', isActive: true, user: null }));
    const prisma = createMockPrisma({
      conversations: [conversationRow({ participants: preview })],
      participants: [{ id: 'pt-t', userId: TARGET_ID, conversationId: 'c1', role: 'moderator', joinedAt: new Date('2026-04-01').toISOString(), nickname: null, isActive: true, displayName: 'T' }],
    });
    const app = await buildApp(prisma, 'ADMIN');
    const res = await app.inject({ method: 'GET', url: url() });
    expect(res.json().data[0].membership).toMatchObject({ userId: TARGET_ID, role: 'moderator' });
    expect(argsOf(prisma.participant.findMany).where).toMatchObject({ userId: TARGET_ID, conversationId: { in: ['c1'] } });
    await app.close();
  });

  it('sert messageCount à null sans ligne de statistiques, et le compte quand elle existe', async () => {
    const prisma = createMockPrisma({
      conversations: [conversationRow({ id: 'c1' }), conversationRow({ id: 'c2', conversationMessageStats: null })],
    });
    const app = await buildApp(prisma, 'ADMIN');
    const res = await app.inject({ method: 'GET', url: url() });
    const [avec, sans] = res.json().data;
    expect(avec.messageCount).toBe(120);
    expect(sans.messageCount).toBeNull();
    expect(avec.memberCount).toBe(9);
    expect(avec).not.toHaveProperty('conversationMessageStats');
    expect(avec).not.toHaveProperty('_count');
    await app.close();
  });

  it('sert les réglages et les métadonnées de la conversation', async () => {
    const prisma = createMockPrisma({ conversations: [conversationRow()] });
    const app = await buildApp(prisma, 'ADMIN');
    const res = await app.inject({ method: 'GET', url: url() });
    expect(res.json().data[0]).toMatchObject({
      description: 'Le groupe',
      banner: 'b.jpg',
      closedAt: null,
      updatedAt: new Date('2026-02-01').toISOString(),
      settings: {
        defaultWriteRole: 'everyone',
        isAnnouncementChannel: false,
        slowModeSeconds: 30,
        autoTranslateEnabled: true,
        encryptionMode: null,
      },
    });
    await app.close();
  });
});

describe('GET /admin/conversations/:conversationId/participants', () => {
  it('returns 404 when the conversation does not exist', async () => {
    const app = await buildApp(createMockPrisma({ conversationExists: false }), 'ADMIN');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/conversations/conv-1/participants',
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns the paginated members of a conversation', async () => {
    const prisma = createMockPrisma({
      participants: [
        { id: 'pt1', userId: 'u1', type: 'user', displayName: 'Alice', avatar: null, role: 'admin', isActive: true, isOnline: false, joinedAt: new Date('2026-01-01').toISOString(), nickname: null, user: { id: 'u1', username: 'alice', displayName: 'Alice', avatar: null } },
      ],
      participantsCount: 12,
    });
    const app = await buildApp(prisma, 'ADMIN');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/conversations/conv-1/participants?offset=0&limit=30',
      headers: { authorization: 'Bearer x' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: 'pt1', role: 'admin' });
    expect(body.pagination).toMatchObject({ total: 12, hasMore: true });
    await app.close();
  });

  it('returns 403 for a role without canViewUsers (USER)', async () => {
    const app = await buildApp(createMockPrisma({}), 'USER');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/conversations/conv-1/participants',
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  // Directive produit 2026-08-25 : « les utilisateurs avec le rôle ADMIN et
  // supérieur peuvent constamment avoir l'état de présence » — MODERATOR
  // passe `requireUserViewAccess` (canViewUsers) mais n'a plus canViewPresence.
  it('masks isOnline for a role with canViewUsers but no canViewPresence (MODERATOR)', async () => {
    const prisma = createMockPrisma({
      participants: [
        { id: 'pt1', userId: 'u1', type: 'user', displayName: 'Alice', avatar: null, role: 'admin', isActive: true, isOnline: true, joinedAt: new Date('2026-01-01').toISOString(), nickname: null, user: { id: 'u1', username: 'alice', displayName: 'Alice', avatar: null } },
      ],
      participantsCount: 1,
    });
    const app = await buildApp(prisma, 'MODERATOR');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/conversations/conv-1/participants',
      headers: { authorization: 'Bearer x' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data[0].isOnline).toBe(false);
    // Le reste du participant n'est pas emporté par le masquage.
    expect(body.data[0]).toMatchObject({ id: 'pt1', role: 'admin', displayName: 'Alice' });
    await app.close();
  });

  it('serves the real isOnline for a role with canViewPresence (ADMIN)', async () => {
    const prisma = createMockPrisma({
      participants: [
        { id: 'pt1', userId: 'u1', type: 'user', displayName: 'Alice', avatar: null, role: 'admin', isActive: true, isOnline: true, joinedAt: new Date('2026-01-01').toISOString(), nickname: null, user: { id: 'u1', username: 'alice', displayName: 'Alice', avatar: null } },
      ],
      participantsCount: 1,
    });
    const app = await buildApp(prisma, 'ADMIN');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/conversations/conv-1/participants',
      headers: { authorization: 'Bearer x' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data[0].isOnline).toBe(true);
    await app.close();
  });
});

describe('GET /admin/users/:userId/media', () => {
  it('merges post media and message attachments, newest first, with a normalized shape', async () => {
    const prisma = createMockPrisma({
      postMedia: [
        { id: 'pm1', originalName: 'a.jpg', mimeType: 'image/jpeg', fileUrl: 'u1', thumbnailUrl: 't1', fileSize: 100, width: 10, height: 10, duration: null, createdAt: new Date('2026-06-02').toISOString(), postId: 'post1' },
      ],
      postMediaCount: 1,
      attachments: [
        { id: 'att1', originalName: 'b.mp4', mimeType: 'video/mp4', fileUrl: 'u2', thumbnailUrl: null, fileSize: 200, width: null, height: null, duration: 5000, createdAt: new Date('2026-06-03').toISOString(), messageId: 'msg1' },
      ],
      attachmentsCount: 1,
    });
    const app = await buildApp(prisma, 'ADMIN');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/users/${TARGET_ID}/media?offset=0&limit=20`,
      headers: { authorization: 'Bearer x' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pagination.total).toBe(2);
    expect(body.data).toHaveLength(2);
    // newest first → the attachment (2026-06-03) before the post media (2026-06-02)
    expect(body.data[0]).toMatchObject({ id: 'att1', source: 'message', contextId: 'msg1' });
    expect(body.data[1]).toMatchObject({ id: 'pm1', source: 'post', contextId: 'post1' });
    // raw foreign keys must not leak (normalized to contextId)
    expect(body.data[0].messageId).toBeUndefined();
    expect(body.data[1].postId).toBeUndefined();
    await app.close();
  });
});

describe('GET /admin/users/:userId/reports', () => {
  it('returns the reports filed by the user (paginated)', async () => {
    const prisma = createMockPrisma({
      reports: [
        { id: 'r1', reportedType: 'message', reportedEntityId: 'm9', reportType: 'spam', reason: 'unsolicited', status: 'pending', actionTaken: null, createdAt: new Date('2026-06-01').toISOString(), resolvedAt: null },
      ],
      reportsCount: 3,
    });
    const app = await buildApp(prisma, 'ADMIN');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/users/${TARGET_ID}/reports?offset=0&limit=20`,
      headers: { authorization: 'Bearer x' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: 'r1', reportType: 'spam', status: 'pending' });
    expect(body.pagination).toMatchObject({ total: 3, hasMore: true });
    await app.close();
  });
});

describe('GET /admin/users/:userId/reported-messages', () => {
  it('returns an empty page when the user has no participants', async () => {
    const app = await buildApp(createMockPrisma({ participants: [] }), 'ADMIN');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/users/${TARGET_ID}/reported-messages`,
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toEqual([]);
    expect(body.pagination.total).toBe(0);
    await app.close();
  });

  it('joins reports on the user messages with the message content', async () => {
    const prisma = createMockPrisma({
      participants: [{ id: 'p1' }],
      messages: [{ id: 'm1', content: 'bad message', conversationId: 'c1', messageType: 'text', createdAt: new Date('2026-05-01').toISOString(), deletedAt: null }],
      reports: [{ id: 'r1', reportedEntityId: 'm1', reportType: 'harassment', reason: 'abuse', status: 'under_review', reporterId: null, reporterName: 'Anon', createdAt: new Date('2026-06-01').toISOString(), resolvedAt: null }],
      reportsCount: 1,
    });
    const app = await buildApp(prisma, 'ADMIN');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/users/${TARGET_ID}/reported-messages`,
      headers: { authorization: 'Bearer x' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: 'r1', reportType: 'harassment' });
    expect(body.data[0].message).toMatchObject({ id: 'm1', content: 'bad message' });
    await app.close();
  });
});

/**
 * #4333 c.3 — troisième geste souverain, frère de `PUT /admin/agent/llm` et
 * `DELETE /admin/agent/reset`. Servait auparavant le contenu INTÉGRAL de
 * n'importe quelle conversation privée sous `canViewUsers` (donc ADMIN,
 * MODERATOR, AUDIT) : `requireSovereign()` restreint désormais à BIGBOSS —
 * ADMIN, qui passait avant, est le témoin qui prouve la montée de garde.
 */
describe('GET /admin/conversations/:conversationId/messages', () => {
  const REASON = 'Enquête sur un signalement de harcèlement (#9142)';

  /**
   * LE SEUIL A CHANGÉ — directive porteur du 2026-09-16 : « permettre aussi
   * aux ADMIN de pouvoir accéder à ces informations pour le moment ».
   *
   * Cette route était le TROISIÈME geste S6 de #4157 c.2 (BIGBOSS seul). Elle
   * exige désormais la permission `canManageConversations` ET le rang
   * d'administration (BIGBOSS ou ADMIN). Ce qui n'a PAS bougé : le motif écrit
   * et la trace — voir les témoins plus bas, inchangés.
   */
  it('sert un ADMIN — directive porteur du 2026-09-16', async () => {
    const app = await buildApp(createMockPrisma({ messages: [], messagesCount: 0 }), 'ADMIN');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/conversations/conv-1/messages?reason=${encodeURIComponent(REASON)}`,
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('refuse un MODERATOR — il PORTE canManageConversations, il n\'a pas le RANG', async () => {
    // Le seul témoin qui distingue une garde de RANG d'une garde de
    // PERMISSION : MODERATOR porte la permission dans la matrice centrale.
    const app = await buildApp(createMockPrisma({}), 'MODERATOR');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/conversations/conv-1/messages?reason=${encodeURIComponent(REASON)}`,
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('refuse un AUDIT — ni permission ni rang', async () => {
    const app = await buildApp(createMockPrisma({}), 'AUDIT');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/conversations/conv-1/messages?reason=${encodeURIComponent(REASON)}`,
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('refuse USER (non-régression du seuil précédent)', async () => {
    const app = await buildApp(createMockPrisma({}), 'USER');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/conversations/conv-1/messages?reason=${encodeURIComponent(REASON)}`,
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('refuse BIGBOSS sans motif — 400 au SCHÉMA, avant Prisma', async () => {
    const app = await buildApp(createMockPrisma({}), 'BIGBOSS');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/conversations/conv-1/messages',
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('refuse BIGBOSS avec un motif trop court (< 10 caractères)', async () => {
    const app = await buildApp(createMockPrisma({}), 'BIGBOSS');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/conversations/conv-1/messages?reason=trop+bref',
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('returns 404 when the conversation does not exist', async () => {
    const app = await buildApp(createMockPrisma({ conversationExists: false }), 'BIGBOSS');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/conversations/conv-1/messages?reason=${encodeURIComponent(REASON)}`,
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  function messagesFixture(): AnyRecord[] {
    return [
      {
        id: 'm2',
        content: 'latest message',
        originalLanguage: 'fr',
        messageType: 'text',
        messageSource: 'user',
        isEdited: false,
        editedAt: null,
        replyToId: null,
        createdAt: new Date('2026-06-02').toISOString(),
        isViewOnce: false,
        isBlurred: false,
        effectFlags: 0,
        expiresAt: null,
        isEncrypted: false,
        encryptionMode: null,
        sender: { id: 'pt1', userId: 'u1', type: 'user', displayName: 'Alice', avatar: null, nickname: null, user: { id: 'u1', username: 'alice', displayName: 'Alice', avatar: null } },
        // #6860 — deux pièces sur un message ORDINAIRE : une image libre, et
        // un VOCAL déclaré à vue unique SUR LA PIÈCE. Le second cas est celui
        // qu'une garde lisant le seul message laisserait sortir en clair.
        attachments: [
          { id: 'a1', originalName: 'photo.jpg', mimeType: 'image/jpeg', fileSize: 120000, width: 800, height: 600, duration: null, fileUrl: 'https://cdn.test/a1.jpg', thumbnailUrl: 'https://cdn.test/a1-t.jpg', isViewOnce: false, isBlurred: false, effectFlags: 0 },
          { id: 'a2', originalName: 'note.m4a', mimeType: 'audio/mp4', fileSize: 48000, width: null, height: null, duration: 12, fileUrl: 'https://cdn.test/a2.m4a', thumbnailUrl: null, isViewOnce: true, isBlurred: false, effectFlags: 0 },
        ],
        _count: { attachments: 2 },
      },
      {
        id: 'm3',
        content: 'a secret',
        originalLanguage: 'fr',
        messageType: 'text',
        messageSource: 'user',
        isEdited: false,
        editedAt: null,
        replyToId: null,
        createdAt: new Date('2026-06-03').toISOString(),
        // Vue unique : le CONTENU ne doit pas voyager, la ligne si.
        isViewOnce: true,
        isBlurred: false,
        effectFlags: 0,
        expiresAt: null,
        isEncrypted: false,
        encryptionMode: null,
        sender: { id: 'pt3', userId: 'u3', type: 'user', displayName: 'Carol', avatar: null, nickname: null, user: { id: 'u3', username: 'carol', displayName: 'Carol', avatar: null } },
        // #6860 — une pièce ORDINAIRE sur un message PROTÉGÉ. Elle ne déclare
        // rien elle-même : seule la protection du MESSAGE doit la retenir.
        attachments: [
          { id: 'a3', originalName: 'joint.png', mimeType: 'image/png', fileSize: 9000, width: 100, height: 100, duration: null, fileUrl: 'https://cdn.test/a3.png', thumbnailUrl: 'https://cdn.test/a3-t.png', isViewOnce: false, isBlurred: false, effectFlags: 0 },
        ],
        _count: { attachments: 1 },
      },
      {
        id: 'm1',
        content: 'older, deleted',
        originalLanguage: 'en',
        messageType: 'text',
        messageSource: 'user',
        isEdited: true,
        editedAt: new Date('2026-06-01').toISOString(),
        // Message supprimé : ne doit plus être SERVI du tout (au `where`).
        deletedAt: new Date('2026-06-01').toISOString(),
        replyToId: null,
        createdAt: new Date('2026-06-01').toISOString(),
        isViewOnce: false,
        isBlurred: false,
        effectFlags: 0,
        expiresAt: null,
        isEncrypted: false,
        encryptionMode: null,
        sender: { id: 'pt2', userId: 'u2', type: 'user', displayName: 'Bob', avatar: null, nickname: null, user: { id: 'u2', username: 'bob', displayName: 'Bob', avatar: null } },
        _count: { attachments: 0 },
      },
    ];
  }

  it('exclut un message SUPPRIMÉ de la liste servie — deletedAt: null au where, jamais un flag amputé', async () => {
    const prisma = createMockPrisma({ messages: messagesFixture(), messagesCount: 2 });
    const app = await buildApp(prisma, 'BIGBOSS');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/conversations/conv-1/messages?offset=0&limit=30&reason=${encodeURIComponent(REASON)}`,
      headers: { authorization: 'Bearer x' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const ids = (body.data as Array<{ id: string }>).map((m) => m.id);
    expect(ids).not.toContain('m1');
    expect(ids).toEqual(['m2', 'm3']);
    await app.close();
  });

  it('masque le CONTENU d\'un message à vue unique — la ligne reste listée, isProtected le dit', async () => {
    const prisma = createMockPrisma({ messages: messagesFixture(), messagesCount: 2 });
    const app = await buildApp(prisma, 'BIGBOSS');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/conversations/conv-1/messages?reason=${encodeURIComponent(REASON)}`,
      headers: { authorization: 'Bearer x' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const items = body.data as Array<Record<string, unknown>>;
    const vueUnique = items.find((m) => m.id === 'm3');
    const ordinaire = items.find((m) => m.id === 'm2');

    expect(vueUnique).toBeDefined();
    expect(vueUnique?.content).toBeNull();
    expect(vueUnique?.isProtected).toBe(true);

    // Contraste : un message ORDINAIRE garde son contenu — sinon le témoin
    // passerait aussi si la route retirait `content` à tout le monde.
    expect(ordinaire?.content).toBe('latest message');
    expect(ordinaire?.isProtected).toBe(false);
    await app.close();
  });

  it('returns the paginated messages with their sender and attachment count', async () => {
    const prisma = createMockPrisma({ messages: messagesFixture(), messagesCount: 2 });
    const app = await buildApp(prisma, 'BIGBOSS');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/conversations/conv-1/messages?offset=0&limit=30&reason=${encodeURIComponent(REASON)}`,
      headers: { authorization: 'Bearer x' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({ id: 'm2', content: 'latest message' });
    expect(body.data[0].sender).toMatchObject({ userId: 'u1' });
    expect(body.data[0].sender.user).toMatchObject({ username: 'alice' });
    expect(body.data[0].attachmentCount).toBe(2);
    expect(body.pagination).toMatchObject({ total: 2, offset: 0, limit: 30, hasMore: false });
    await app.close();
  });

  /**
   * #6860 — LES PIÈCES VOYAGENT, ET LEUR PROTECTION SE LIT AUX DEUX NIVEAUX.
   *
   * La route servait `attachmentCount` et rien d'autre. Ces trois témoins
   * ferment les trois cas que la composition doit distinguer : la pièce libre
   * sur un message libre, la pièce qui se protège ELLE-MÊME, et la pièce
   * ordinaire qu'un message protégé retient.
   */
  async function piecesServies(): Promise<Record<string, Record<string, unknown>>> {
    const prisma = createMockPrisma({ messages: messagesFixture(), messagesCount: 2 });
    const app = await buildApp(prisma, 'BIGBOSS');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/conversations/conv-1/messages?reason=${encodeURIComponent(REASON)}`,
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(200);
    const messages = res.json().data as Array<Record<string, unknown>>;
    const parId: Record<string, Record<string, unknown>> = {};
    for (const message of messages) {
      for (const piece of (message.attachments ?? []) as Array<Record<string, unknown>>) {
        parId[String(piece.id)] = piece;
      }
    }
    await app.close();
    return parId;
  }

  it('sert les PIÈCES de chaque message, et non plus leur seul compte', async () => {
    const pieces = await piecesServies();

    // Une image libre sur un message libre : elle voyage entière.
    expect(pieces.a1).toMatchObject({
      id: 'a1',
      originalName: 'photo.jpg',
      mimeType: 'image/jpeg',
      fileUrl: 'https://cdn.test/a1.jpg',
      thumbnailUrl: 'https://cdn.test/a1-t.jpg',
      isProtected: false,
    });
    // La durée d'un vocal fait partie de ce qu'un administrateur constate.
    expect(pieces.a2?.duration).toBe(12);
  });

  it("retient une pièce qui se déclare à vue unique SUR UN MESSAGE ORDINAIRE — le cas qu'une garde lisant le seul message laisse sortir", async () => {
    const pieces = await piecesServies();

    expect(pieces.a2).toBeDefined();
    expect(pieces.a2?.isProtected).toBe(true);
    expect(pieces.a2?.fileUrl).toBeNull();
    expect(pieces.a2?.thumbnailUrl).toBeNull();
    // La ligne RESTE : nom, poids et durée sont des faits que
    // l'administration a le droit de constater sans ouvrir le fichier.
    expect(pieces.a2?.originalName).toBe('note.m4a');
    expect(pieces.a2?.fileSize).toBe(48000);

    // Contraste indispensable : sans lui, ce témoin passerait aussi si la
    // route masquait TOUTES les pièces.
    expect(pieces.a1?.fileUrl).toBe('https://cdn.test/a1.jpg');
  });

  it('retient les pièces ORDINAIRES d\'un message protégé — la garde du message couvre ce qu\'il porte', async () => {
    const pieces = await piecesServies();

    // `a3` ne déclare aucune protection ; seul son message est à vue unique.
    expect(pieces.a3).toBeDefined();
    expect(pieces.a3?.isProtected).toBe(true);
    expect(pieces.a3?.fileUrl).toBeNull();
    expect(pieces.a3?.thumbnailUrl).toBeNull();
    expect(pieces.a3?.originalName).toBe('joint.png');
  });

  it('trace le geste dans AdminAuditLog, APRÈS la lecture réussie, avec le motif écrit', async () => {
    const prisma = createMockPrisma({ messages: messagesFixture(), messagesCount: 2 });
    const app = await buildApp(prisma, 'BIGBOSS');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/conversations/conv-1/messages?reason=${encodeURIComponent(REASON)}`,
      headers: { authorization: 'Bearer x' },
    });

    expect(res.statusCode).toBe(200);
    const auditCreate = (prisma as unknown as { adminAuditLog: { create: jest.Mock } }).adminAuditLog.create;
    expect(auditCreate).toHaveBeenCalledTimes(1);
    const written = auditCreate.mock.calls[0][0] as { data: AnyRecord };
    expect(written.data).toMatchObject({
      adminId: ADMIN_ID,
      entity: 'Conversation',
      entityId: 'conv-1',
    });
    expect(String(written.data.action)).toContain('CONVERSATION');
    expect(String(written.data.metadata)).toContain(REASON);
    await app.close();
  });

  it('ne trace RIEN quand le motif est refusé au schéma (400) — l\'audit ne suit qu\'une lecture réussie', async () => {
    const prisma = createMockPrisma({ messages: messagesFixture(), messagesCount: 2 });
    const app = await buildApp(prisma, 'BIGBOSS');
    await app.inject({
      method: 'GET',
      url: '/api/v1/admin/conversations/conv-1/messages',
      headers: { authorization: 'Bearer x' },
    });
    const auditCreate = (prisma as unknown as { adminAuditLog: { create: jest.Mock } }).adminAuditLog.create;
    expect(auditCreate).not.toHaveBeenCalled();
    await app.close();
  });
});
