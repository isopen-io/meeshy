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
    message: {
      findMany: jest.fn(async () => opts.messages ?? []),
      count: jest.fn(async () => opts.messagesCount ?? (opts.messages?.length ?? 0)),
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
          memberCount: 4,
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
    // participants are now surfaced (preview for direct display / group modal)
    expect(body.data[0].participants).toHaveLength(2);
    expect(body.pagination).toMatchObject({ total: 7, offset: 0, limit: 20, hasMore: true });
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

describe('GET /admin/conversations/:conversationId/messages', () => {
  it('returns 403 for a role without canViewUsers (USER)', async () => {
    const app = await buildApp(createMockPrisma({}), 'USER');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/conversations/conv-1/messages',
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('returns 404 when the conversation does not exist', async () => {
    const app = await buildApp(createMockPrisma({ conversationExists: false }), 'ADMIN');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/conversations/conv-1/messages',
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('returns the paginated messages with their sender (deleted ones included)', async () => {
    const prisma = createMockPrisma({
      messages: [
        {
          id: 'm2',
          content: 'latest message',
          originalLanguage: 'fr',
          messageType: 'text',
          messageSource: 'user',
          isEdited: false,
          editedAt: null,
          deletedAt: null,
          replyToId: null,
          createdAt: new Date('2026-06-02').toISOString(),
          sender: { id: 'pt1', userId: 'u1', type: 'user', displayName: 'Alice', avatar: null, nickname: null, user: { id: 'u1', username: 'alice', displayName: 'Alice', avatar: null } },
          _count: { attachments: 2 },
        },
        {
          id: 'm1',
          content: 'older, deleted',
          originalLanguage: 'en',
          messageType: 'text',
          messageSource: 'user',
          isEdited: true,
          editedAt: new Date('2026-06-01').toISOString(),
          deletedAt: new Date('2026-06-01').toISOString(),
          replyToId: null,
          createdAt: new Date('2026-06-01').toISOString(),
          sender: { id: 'pt2', userId: 'u2', type: 'user', displayName: 'Bob', avatar: null, nickname: null, user: { id: 'u2', username: 'bob', displayName: 'Bob', avatar: null } },
          _count: { attachments: 0 },
        },
      ],
      messagesCount: 42,
    });
    const app = await buildApp(prisma, 'ADMIN');
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/conversations/conv-1/messages?offset=0&limit=30',
      headers: { authorization: 'Bearer x' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toHaveLength(2);
    expect(body.data[0]).toMatchObject({ id: 'm2', content: 'latest message' });
    expect(body.data[0].sender).toMatchObject({ userId: 'u1' });
    expect(body.data[0].sender.user).toMatchObject({ username: 'alice' });
    expect(body.data[0].attachmentCount).toBe(2);
    expect(body.data[1]).toMatchObject({ id: 'm1', isEdited: true });
    expect(body.data[1].deletedAt).not.toBeNull();
    expect(body.pagination).toMatchObject({ total: 42, offset: 0, limit: 30, hasMore: true });
    await app.close();
  });
});
