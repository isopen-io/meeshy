/**
 * `POST /conversations/:id/messages/capture` — le jumeau REST de
 * `message:capture-detected` (#9617). Les témoins traversent le VRAI
 * sérialiseur (`app.inject`) : la réponse dit les messages annoncés, et les
 * refus d'ensemble ont leur statut.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import { parseCaptureNotice } from '@meeshy/shared/utils/capture-notice';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockResolveConversationId = jest.fn<(prisma: unknown, id: string) => Promise<string | null>>();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (prisma: unknown, id: string) => mockResolveConversationId(prisma, id),
}));

import { registerMessageCaptureRoutes, type MessageCaptureRouteOptions } from '../../../routes/conversations/messages-capture';

const CONV = '507f1f77bcf86cd799439011';
const USER = '507f1f77bcf86cd799439022';
const ACTOR = '507f1f77bcf86cd7994390a1';
const SENDER = '507f1f77bcf86cd7994390af';
const FLAME = '507f1f77bcf86cd799439031';
const NOW = new Date('2026-10-07T12:00:00.000Z');

type Row = Record<string, unknown>;

function buildPrisma(member = true, closed = false) {
  const created: Row[] = [];
  const prisma = {
    participant: {
      findFirst: async ({ where }: { where: Row }) => {
        if (!member || where.conversationId !== CONV) return null;
        if (where.userId === USER || where.id === ACTOR) {
          return { id: ACTOR, userId: USER, role: 'member', joinedAt: null, displayName: 'Alice', nickname: null, user: { username: 'alice' } };
        }
        return null;
      },
    },
    message: {
      findMany: async () => [
        {
          id: FLAME,
          conversationId: CONV,
          createdAt: new Date('2026-10-07T11:58:00Z'),
          deletedAt: null,
          senderId: SENDER,
          isViewOnce: false,
          isBlurred: false,
          effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL,
          ephemeralDuration: 60,
          expiresAt: null,
          attachments: [],
        },
      ],
      create: async ({ data }: { data: Row }) => {
        const row = { ...data, id: `sys-${created.length}`, createdAt: NOW };
        created.push(row);
        return row;
      },
    },
    messageStatusEntry: {
      findFirst: async () => ({ readAt: NOW, viewedOnceAt: null, ephemeralExpiresAt: null }),
    },
    conversation: { update: async () => ({}), findUnique: async () => ({ isActive: true, closedAt: closed ? NOW : null }) },
  };
  return { prisma, created };
}

async function buildApp(params: { member?: boolean; allowed?: boolean; closed?: boolean } = {}) {
  const { prisma, created } = buildPrisma(params.member ?? true, params.closed ?? false);
  const broadcasts: Array<{ message: unknown; conversationId: string }> = [];
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as unknown as { socketIOHandler: unknown }).socketIOHandler = {
    getManager: () => ({
      broadcastMessage: async (message: unknown, conversationId: string) => {
        broadcasts.push({ message, conversationId });
      },
    }),
  };
  const auth = async (req: { authContext?: unknown }) => {
    req.authContext = { type: 'registered', isAuthenticated: true, isAnonymous: false, userId: USER };
  };
  const keys = new Set<string>();
  const options: MessageCaptureRouteOptions = {
    dedup: {
      setnx: async (key) => (keys.has(key) ? false : (keys.add(key), true)),
      del: async (key) => {
        keys.delete(key);
      },
    },
    limiter: { checkLimit: async () => params.allowed ?? true },
    mayRead: async () => true,
    now: () => NOW,
  };
  registerMessageCaptureRoutes(app, prisma as never, auth, options);
  await app.ready();
  return { app, created, broadcasts };
}

const post = (app: Awaited<ReturnType<typeof buildApp>>['app'], body: unknown, id = CONV) =>
  app.inject({ method: 'POST', url: `/conversations/${id}/messages/capture`, payload: body as Record<string, unknown> });

const report = { messageIds: [FLAME], kind: 'screenshot', captureId: 'capture-0001' };

describe('POST /conversations/:id/messages/capture', () => {
  it('écrit l’avis, le diffuse au fil et sert les messages annoncés', async () => {
    mockResolveConversationId.mockResolvedValue(CONV);
    const h = await buildApp();
    const res = await post(h.app, report);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true, data: { noticedMessageIds: [FLAME] } });
    expect(h.created).toHaveLength(1);
    expect(parseCaptureNotice(h.created[0]?.metadata)).toMatchObject({ capturedMessageId: FLAME, outcome: 'announced' });
    expect(h.broadcasts).toEqual([{ message: h.created[0], conversationId: CONV }]);
  });

  it('refuse un corps mal formé sans rien écrire', async () => {
    mockResolveConversationId.mockResolvedValue(CONV);
    const h = await buildApp();
    const res = await post(h.app, { ...report, kind: 'photo' });
    expect(res.statusCode).toBe(400);
    expect(h.created).toHaveLength(0);
  });

  it('rend 404 pour une conversation introuvable', async () => {
    mockResolveConversationId.mockResolvedValue(null);
    const h = await buildApp();
    expect((await post(h.app, report)).statusCode).toBe(404);
  });

  it('rend 403 à qui n’est pas participant', async () => {
    mockResolveConversationId.mockResolvedValue(CONV);
    const h = await buildApp({ member: false });
    const res = await post(h.app, report);
    expect(res.statusCode).toBe(403);
    expect(h.created).toHaveLength(0);
  });

  it('rend 410 dans une conversation close, sans rien écrire', async () => {
    mockResolveConversationId.mockResolvedValue(CONV);
    const h = await buildApp({ closed: true });
    const res = await post(h.app, report);
    expect(res.statusCode).toBe(410);
    expect(res.json()).toMatchObject({ success: false, code: 'CONVERSATION_CLOSED' });
    expect(h.created).toHaveLength(0);
  });

  it('rend 429 avec le code du refus de débit quand le budget est épuisé', async () => {
    mockResolveConversationId.mockResolvedValue(CONV);
    const h = await buildApp({ allowed: false });
    const res = await post(h.app, report);
    expect(res.statusCode).toBe(429);
    expect(res.json()).toMatchObject({ success: false, code: 'RATE_LIMITED' });
    expect(h.created).toHaveLength(0);
  });
});
