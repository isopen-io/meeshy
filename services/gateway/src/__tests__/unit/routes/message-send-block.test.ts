/**
 * message-send-block.test.ts
 *
 * Tests block enforcement on POST /conversations/:id/messages.
 *
 * Product rule: enforcement applies to DIRECT conversations only and is
 * bidirectional (reject if sender blocked the other OR the other blocked the
 * sender). Group / public / global conversations are never block-enforced.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { MessageTranslationService } from '../../../services/message-translation/MessageTranslationService';

const SENDER_ID = '507f1f77bcf86cd799439001';
const OTHER_ID = '507f1f77bcf86cd799439002';
const CONV_ID = '507f1f77bcf86cd7994390aa';
const PARTICIPANT_ID = '507f1f77bcf86cd7994390bb';
const VALID_CID = 'cid_11111111-1111-4111-8111-111111111111';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
  performanceLogger: {
    withTiming: jest.fn(async (_n: unknown, fn: () => unknown) => fn()),
  },
}));

// Mutable holder so each test can swap the handleMessage behavior. The route
// imports MessagingService statically, so the mock must be module-scoped.
const handleMessageHolder: { fn: (...args: unknown[]) => Promise<unknown> } = {
  fn: async () => ({ success: true, data: {} }),
};

jest.mock('../../../services/messaging/MessagingService', () => ({
  MessagingService: jest.fn().mockImplementation(() => ({
    handleMessage: (...args: unknown[]) => handleMessageHolder.fn(...args),
  })),
}));

type Opts = {
  conversationType: string;
  blockedBetween: boolean;
};

function createMockPrisma(opts: Opts) {
  const conversationFindUnique = jest.fn(async () => ({
    type: opts.conversationType,
    participants: [{ userId: SENDER_ID }, { userId: OTHER_ID }],
  }));
  const userFindFirst = jest.fn(async () => (opts.blockedBetween ? { id: OTHER_ID } : null));

  const prisma = {
    conversation: { findUnique: conversationFindUnique, findFirst: jest.fn(async () => ({ id: CONV_ID })) },
    participant: { findFirst: jest.fn(async () => ({ id: PARTICIPANT_ID })) },
    user: { findFirst: userFindFirst },
  } as unknown as PrismaClient;

  return { prisma, conversationFindUnique, userFindFirst };
}

async function buildApp(prisma: PrismaClient): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('notificationService', {} as never);
  app.decorate('socketIOHandler', undefined as never);

  const optionalAuth = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: SENDER_ID,
      registeredUser: { id: SENDER_ID },
      hasFullAccess: true,
    };
  };

  const translationService = {} as MessageTranslationService;
  const { registerMessagesRoutes } = await import('../../../routes/conversations/messages');
  registerMessagesRoutes(app, prisma, translationService, optionalAuth, optionalAuth);
  await app.ready();
  return app;
}

describe('POST /conversations/:id/messages block enforcement', () => {
  it('rejects a DIRECT message when a block exists (403 USER_BLOCKED)', async () => {
    const handleMessage = jest.fn(async () => ({ success: true, data: {} }));
    handleMessageHolder.fn = handleMessage as never;
    const { prisma } = createMockPrisma({ conversationType: 'direct', blockedBetween: true });
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/messages`,
      headers: { authorization: 'Bearer x' },
      payload: { content: 'hi', clientMessageId: VALID_CID },
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('USER_BLOCKED');
    expect(handleMessage).not.toHaveBeenCalled();

    await app.close();
  });

  it('does NOT enforce blocks for GROUP messages even if a block exists', async () => {
    const handleMessage = jest.fn(async () => ({
      success: true,
      data: { id: 'm1', conversationId: CONV_ID },
    }));
    handleMessageHolder.fn = handleMessage as never;
    const { prisma, userFindFirst } = createMockPrisma({
      conversationType: 'group',
      blockedBetween: true,
    });
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/messages`,
      headers: { authorization: 'Bearer x' },
      payload: { content: 'hi', clientMessageId: VALID_CID },
    });

    expect(res.statusCode).toBe(200);
    expect(handleMessage).toHaveBeenCalledTimes(1);
    // group → bidirectional block lookup never runs
    expect(userFindFirst).not.toHaveBeenCalled();

    await app.close();
  });

  it('allows a DIRECT message when no block exists', async () => {
    const handleMessage = jest.fn(async () => ({
      success: true,
      data: { id: 'm1', conversationId: CONV_ID },
    }));
    handleMessageHolder.fn = handleMessage as never;
    const { prisma } = createMockPrisma({ conversationType: 'direct', blockedBetween: false });
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/messages`,
      headers: { authorization: 'Bearer x' },
      payload: { content: 'hi', clientMessageId: VALID_CID },
    });

    expect(res.statusCode).toBe(200);
    expect(handleMessage).toHaveBeenCalledTimes(1);

    await app.close();
  });
});
