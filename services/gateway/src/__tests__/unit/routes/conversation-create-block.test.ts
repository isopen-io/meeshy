/**
 * conversation-create-block.test.ts
 *
 * Tests block enforcement on POST /conversations.
 *
 * Product rule: enforcement applies to DIRECT conversations only and is
 * bidirectional (reject if creator blocked the other OR the other blocked the
 * creator). Group / public / global conversations are never block-enforced.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const CREATOR_ID = '507f1f77bcf86cd799439001';
const OTHER_ID = '507f1f77bcf86cd799439002';

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

type PrismaOpts = {
  blockedBetween: boolean;
};

function createMockPrisma(opts: PrismaOpts) {
  const conversationCreate = jest.fn(async () => ({
    id: '507f1f77bcf86cd7994390aa',
    identifier: 'mshy_test',
    type: 'direct',
    title: null,
    participants: [],
  }));
  const userFindFirst = jest.fn(async () => (opts.blockedBetween ? { id: OTHER_ID } : null));

  const prisma = {
    conversation: {
      findFirst: jest.fn(async () => null), // identifier uniqueness check → unique
      create: conversationCreate,
    },
    user: {
      findMany: jest.fn(async () => [
        { id: CREATOR_ID, displayName: 'Creator', username: 'creator' },
        { id: OTHER_ID, displayName: 'Other', username: 'other' },
      ]),
      findFirst: userFindFirst,
    },
    participant: { findFirst: jest.fn(async () => null) },
    notification: { create: jest.fn(async () => ({})) },
  } as unknown as PrismaClient;

  return { prisma, conversationCreate, userFindFirst };
}

async function buildApp(prisma: PrismaClient): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const optionalAuth = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: CREATOR_ID,
      registeredUser: { id: CREATOR_ID },
      hasFullAccess: true,
    };
  };
  const { registerCoreRoutes } = await import('../../../routes/conversations/core');
  registerCoreRoutes(app, prisma, optionalAuth, optionalAuth);
  await app.ready();
  return app;
}

describe('POST /conversations block enforcement', () => {
  it('rejects a DIRECT conversation when a block exists (403 USER_BLOCKED)', async () => {
    const { prisma, conversationCreate } = createMockPrisma({ blockedBetween: true });
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { authorization: 'Bearer x' },
      payload: { type: 'direct', participantIds: [OTHER_ID] },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('USER_BLOCKED');
    expect(conversationCreate).not.toHaveBeenCalled();

    await app.close();
  });

  it('allows a DIRECT conversation when no block exists', async () => {
    const { prisma, conversationCreate } = createMockPrisma({ blockedBetween: false });
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { authorization: 'Bearer x' },
      payload: { type: 'direct', participantIds: [OTHER_ID] },
    });

    expect(res.statusCode).toBe(201);
    expect(conversationCreate).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('does NOT enforce blocks for GROUP conversations with a blocked member', async () => {
    const { prisma, conversationCreate, userFindFirst } = createMockPrisma({ blockedBetween: true });
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { authorization: 'Bearer x' },
      payload: { type: 'group', title: 'Team', participantIds: [OTHER_ID] },
    });

    expect(res.statusCode).toBe(201);
    expect(conversationCreate).toHaveBeenCalledTimes(1);
    // group → block lookup never runs
    expect(userFindFirst).not.toHaveBeenCalled();

    await app.close();
  });
});
