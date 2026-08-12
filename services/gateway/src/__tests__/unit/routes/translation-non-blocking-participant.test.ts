/**
 * translation-non-blocking-participant.test.ts
 *
 * POST /translate (CAS 2 — new message) fires `messagingService.handleMessage`
 * fire-and-forget with the raw `authContext.userId` as the second argument.
 * `MessagingService.handleMessage` expects a `Participant.id` there — passing
 * a `User.id` only works by accident, via a DEPRECATED fallback path that logs
 * an error and burns an extra query on every single non-blocking translation
 * request. This route should resolve the `Participant.id` up front instead,
 * exactly like `POST /conversations/:id/messages` already does.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { MessageTranslationService } from '../../../services/message-translation/MessageTranslationService';
import type { MessagingService } from '../../../services/messaging/MessagingService';

const USER_ID = '507f1f77bcf86cd799439001';
const CONV_ID = '507f1f77bcf86cd7994390aa';
const PARTICIPANT_ID = '507f1f77bcf86cd7994390bb';
const ANON_PARTICIPANT_ID = '507f1f77bcf86cd7994390cc';

async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function buildAuthenticate(authContext: Record<string, unknown>) {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = authContext;
  };
}

async function buildApp(opts: {
  prisma: PrismaClient;
  handleMessage: (...args: unknown[]) => Promise<unknown>;
  authContext: Record<string, unknown>;
}): Promise<FastifyInstance> {
  // strict: false because the real translateRequestSchema uses the `example` keyword
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', opts.prisma);
  app.decorate('translationService', {} as MessageTranslationService);
  app.decorate('messagingService', {
    handleMessage: opts.handleMessage,
  } as unknown as MessagingService);
  app.decorate('authenticate', buildAuthenticate(opts.authContext));

  const { translationRoutes } = await import('../../../routes/translation-non-blocking');
  await app.register(translationRoutes);
  await app.ready();
  return app;
}

describe('POST /translate (new message) — Participant.id resolution', () => {
  it('resolves Participant.id via participant.findFirst and passes it to handleMessage', async () => {
    const handleMessage = jest.fn(async (..._args: unknown[]) => ({ success: true, data: {} }));
    const participantFindFirst = jest.fn(async (..._args: unknown[]) => ({ id: PARTICIPANT_ID }));
    const prisma = {
      conversation: { findFirst: jest.fn(async (..._args: unknown[]) => ({ id: CONV_ID })) },
      participant: { findFirst: participantFindFirst },
    } as unknown as PrismaClient;

    const app = await buildApp({
      prisma,
      handleMessage,
      authContext: { userId: USER_ID, isAnonymous: false },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      payload: { text: 'hello', target_language: 'fr', conversation_id: CONV_ID },
    });

    expect(res.statusCode).toBe(200);
    await flushAsync();

    expect(participantFindFirst).toHaveBeenCalledWith({
      where: { userId: USER_ID, conversationId: CONV_ID, isActive: true },
      select: { id: true },
    });
    expect(handleMessage).toHaveBeenCalledTimes(1);
    const [, participantIdArg] = handleMessage.mock.calls[0] as unknown as [unknown, string];
    expect(participantIdArg).toBe(PARTICIPANT_ID);
    expect(participantIdArg).not.toBe(USER_ID);

    await app.close();
  });

  it('never invokes the legacy userId-as-participantId fallback (no participant lookup miss forwarded)', async () => {
    const handleMessage = jest.fn(async (..._args: unknown[]) => ({ success: true, data: {} }));
    const participantFindFirst = jest.fn(async (..._args: unknown[]) => null);
    const prisma = {
      conversation: { findFirst: jest.fn(async (..._args: unknown[]) => ({ id: CONV_ID })) },
      participant: { findFirst: participantFindFirst },
    } as unknown as PrismaClient;

    const app = await buildApp({
      prisma,
      handleMessage,
      authContext: { userId: USER_ID, isAnonymous: false },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      payload: { text: 'hello', target_language: 'fr', conversation_id: CONV_ID },
    });

    expect(res.statusCode).toBe(200);
    await flushAsync();

    // No active Participant found for this user/conversation — handleMessage
    // must NOT be called with the raw userId as a stand-in participantId.
    expect(handleMessage).not.toHaveBeenCalled();

    await app.close();
  });

  it('uses authContext.participantId directly for anonymous senders, skipping the DB lookup', async () => {
    const handleMessage = jest.fn(async (..._args: unknown[]) => ({ success: true, data: {} }));
    const participantFindFirst = jest.fn(async (..._args: unknown[]) => ({ id: PARTICIPANT_ID }));
    const prisma = {
      conversation: { findFirst: jest.fn(async (..._args: unknown[]) => ({ id: CONV_ID })) },
      participant: { findFirst: participantFindFirst },
    } as unknown as PrismaClient;

    const app = await buildApp({
      prisma,
      handleMessage,
      authContext: {
        userId: USER_ID,
        isAnonymous: true,
        participantId: ANON_PARTICIPANT_ID,
        displayName: 'Guest',
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/translate',
      payload: { text: 'hello', target_language: 'fr', conversation_id: CONV_ID },
    });

    expect(res.statusCode).toBe(200);
    await flushAsync();

    expect(participantFindFirst).not.toHaveBeenCalled();
    expect(handleMessage).toHaveBeenCalledTimes(1);
    const [, participantIdArg] = handleMessage.mock.calls[0] as unknown as [unknown, string];
    expect(participantIdArg).toBe(ANON_PARTICIPANT_ID);

    await app.close();
  });
});
