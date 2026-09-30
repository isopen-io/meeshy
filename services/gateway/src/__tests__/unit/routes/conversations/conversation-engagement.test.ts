/**
 * « N (M) 🔥 » servi au LECTEUR (#8906) : la route dédiée, la projection
 * groupée de la liste, et les contrats de fil qui ne la jettent pas.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import fastJsonStringify from 'fast-json-stringify';

const mockResolveConversationId = jest.fn<any>();
jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: unknown[]) => mockResolveConversationId(...args),
}));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }),
  },
}));

import {
  conversationDetailWithEngagementResponseSchema,
  conversationListWithEngagementResponseSchema,
  loadViewerEngagements,
  registerConversationEngagementRoute,
} from '../../../../routes/conversations/engagement';

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';

const utcToday = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};
const todayKey = () => utcToday().toISOString().slice(0, 10);
const ONE_DAY = 24 * 60 * 60 * 1000;

function row(conversationId: string, overrides: Record<string, unknown> = {}) {
  return {
    conversationId,
    totalPoints: 120,
    dayPoints: 14,
    day: utcToday(),
    dayCounts: {},
    streakDays: 3,
    longestStreakDays: 5,
    ...overrides,
  };
}

function makePrisma(options: { rows?: ReturnType<typeof row>[]; participant?: unknown } = {}) {
  return {
    conversationEngagement: { findMany: jest.fn<any>().mockResolvedValue(options.rows ?? []) },
    user: { findUnique: jest.fn<any>().mockResolvedValue({ timezone: null }) },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(
        options.participant === undefined ? { id: 'p-1', role: 'member', joinedAt: null } : options.participant,
      ),
    },
  };
}

describe('loadViewerEngagements — UNE lecture par page', () => {
  it('lit toute la page en une requête groupée, et résout chaque ligne au jour du lecteur', async () => {
    const prisma = makePrisma({
      rows: [row('c-1'), row('c-2', { day: new Date(utcToday().getTime() - ONE_DAY) }), row('c-3', { day: new Date(utcToday().getTime() - 3 * ONE_DAY) })],
    });

    const map = await loadViewerEngagements(prisma as never, USER_ID, ['c-1', 'c-2', 'c-3', 'c-4']);

    expect(prisma.conversationEngagement.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.conversationEngagement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID, conversationId: { in: ['c-1', 'c-2', 'c-3', 'c-4'] } } }),
    );
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(map.get('c-1')).toEqual({ conversationId: 'c-1', totalPoints: 120, todayPoints: 14, streakDays: 3, day: todayKey() });
    expect(map.get('c-2')).toMatchObject({ todayPoints: 0, streakDays: 3 });
    expect(map.get('c-3')).toMatchObject({ totalPoints: 120, todayPoints: 0, streakDays: 0 });
    expect(map.has('c-4')).toBe(false);
  });

  it('ne lit rien pour une page vide, ni le fuseau quand aucune ligne n\'existe', async () => {
    const prisma = makePrisma();

    expect((await loadViewerEngagements(prisma as never, USER_ID, [])).size).toBe(0);
    expect(prisma.conversationEngagement.findMany).not.toHaveBeenCalled();

    expect((await loadViewerEngagements(prisma as never, USER_ID, ['c-1'])).size).toBe(0);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('les contrats de fil gardent viewerEngagement', () => {
  const snapshot = { conversationId: CONV_ID, totalPoints: 9, todayPoints: 2, streakDays: 1, day: '2026-09-30' };

  it('sur une ligne de liste', () => {
    const stringify = fastJsonStringify(conversationListWithEngagementResponseSchema as never);
    const body = JSON.parse(stringify({ success: true, data: [{ id: CONV_ID, viewerEngagement: snapshot }] }));
    expect(body.data[0].viewerEngagement).toEqual(snapshot);
  });

  it('sur le détail', () => {
    const stringify = fastJsonStringify(conversationDetailWithEngagementResponseSchema as never);
    const body = JSON.parse(stringify({ success: true, data: { id: CONV_ID, viewerEngagement: snapshot } }));
    expect(body.data.viewerEngagement).toEqual(snapshot);
  });
});

async function callRoute(prisma: ReturnType<typeof makePrisma>, authContext: Record<string, unknown>) {
  const app = Fastify({ logger: false });
  const auth = async (request: FastifyRequest, _reply: FastifyReply) => {
    (request as unknown as Record<string, unknown>).authContext = authContext;
  };
  registerConversationEngagementRoute(app, prisma as never, auth);
  await app.ready();
  const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/engagement` });
  await app.close();
  return res;
}

const registered = { isAuthenticated: true, isAnonymous: false, userId: USER_ID, type: 'user' };

describe('GET /conversations/:id/engagement', () => {
  it('sert l\'instantané du participant', async () => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    const res = await callRoute(makePrisma({ rows: [row(CONV_ID)] }), registered);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      success: true,
      data: { conversationId: CONV_ID, totalPoints: 120, todayPoints: 14, streakDays: 3, day: todayKey() },
    });
  });

  it('sert des zéros quand le lecteur n\'a encore rien crédité ici', async () => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    const res = await callRoute(makePrisma(), registered);

    expect(res.json().data).toEqual({ conversationId: CONV_ID, totalPoints: 0, todayPoints: 0, streakDays: 0, day: null });
  });

  it('refuse un non-participant comme une conversation introuvable (404)', async () => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    const prisma = makePrisma({ rows: [row(CONV_ID)], participant: null });
    const res = await callRoute(prisma, registered);

    expect(res.statusCode).toBe(404);
    expect(prisma.conversationEngagement.findMany).not.toHaveBeenCalled();
  });

  it('refuse une requête sans compte (401)', async () => {
    const res = await callRoute(makePrisma(), { isAuthenticated: true, isAnonymous: true, userId: 'participant-1' });

    expect(res.statusCode).toBe(401);
  });
});
