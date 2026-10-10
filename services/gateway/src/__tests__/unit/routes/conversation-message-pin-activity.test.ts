/**
 * Épingler ou dépingler un message est une ACTIVITÉ (#9026) : la conversation
 * remonte en tête de liste pour TOUS ses participants — `lastActivityAt` écrit
 * (rechargement) et `listRankAt` servi à chacun (direct), par
 * `announceConversationActivity`. Un refus (introuvable) n'en est pas une.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockResolveConversationId = jest.fn<any>();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: unknown[]) => mockResolveConversationId(...args),
}));

const mockCanAccessConversation = jest.fn<any>();
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  ...(jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>),
  canAccessConversation: (...args: unknown[]) => mockCanAccessConversation(...args),
}));

jest.mock('../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn().mockImplementation(() => ({ recordActivity: jest.fn(async () => undefined) })),
}));

const mockAnnounce = jest.fn<any>();
jest.mock('../../../services/conversations/conversationActivity', () => ({
  announceConversationActivity: (...args: unknown[]) => mockAnnounce(...args),
}));

import { registerMessagePinRoutes } from '../../../routes/conversations/messages-pin';

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';
const MESSAGE_ID = '507f1f77bcf86cd799439033';

async function buildApp(options: { exists?: boolean; withSocket?: boolean; conversationType?: string; birthDate?: Date | null } = {}) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const io = { to: jest.fn(() => ({ emit: jest.fn() })) };
  const manager = { getIO: () => io, enqueueOfflineMessageMutation: jest.fn(async () => undefined) };
  if (options.withSocket) app.decorate('socketIOHandler', { getManager: () => manager } as never);
  const prisma = {
    message: {
      findFirst: jest.fn<any>().mockResolvedValue(
        options.exists === false
          ? null
          : { id: MESSAGE_ID, pinnedAt: null, ...(options.conversationType ? { conversation: { type: options.conversationType } } : {}) }
      ),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    user: { findUnique: jest.fn<any>().mockResolvedValue({ birthDate: options.birthDate ?? null }) },
  };
  const auth = async (req: any) => {
    req.authContext = { type: 'user', isAuthenticated: true, isAnonymous: false, userId: USER_ID };
  };
  registerMessagePinRoutes(app, prisma as any, auth, options.withSocket ? {} : null);
  await app.ready();
  return { app, prisma, io };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const url = `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin`;

describe('épingler / dépingler remonte la conversation pour tous (#9026)', () => {
  beforeEach(() => {
    mockAnnounce.mockReset();
    mockAnnounce.mockResolvedValue(undefined);
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it.each([
    ['PUT', 'épingler'],
    ['DELETE', 'dépingler'],
  ] as const)('%s (%s) annonce une activité, servie sur le io du gestionnaire', async (method) => {
    const { app, io } = await buildApp({ withSocket: true });
    try {
      const before = Date.now();
      const res = await app.inject({ method, url });
      await flush();
      expect(res.statusCode).toBe(200);
      expect(mockAnnounce).toHaveBeenCalledTimes(1);
      const [args] = mockAnnounce.mock.calls[0] as [Record<string, unknown>];
      expect(args).toMatchObject({ conversationId: CONV_ID, updatedByUserId: USER_ID, io });
      expect((args.at as Date).getTime()).toBeGreaterThanOrEqual(before);
    } finally {
      await app.close();
    }
  });

  it("sans transport temps réel, l'activité s'écrit quand même (la remontée survit au rechargement)", async () => {
    const { app } = await buildApp();
    try {
      await app.inject({ method: 'PUT', url });
      await flush();
      expect(mockAnnounce).toHaveBeenCalledWith(expect.objectContaining({ conversationId: CONV_ID, io: null }));
    } finally {
      await app.close();
    }
  });

  it("un message introuvable n'est pas une activité", async () => {
    const { app } = await buildApp({ exists: false, withSocket: true });
    try {
      const res = await app.inject({ method: 'PUT', url });
      await flush();
      expect(res.statusCode).toBe(404);
      expect(mockAnnounce).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("une panne de l'annonce ne fait pas échouer l'épingle", async () => {
    mockAnnounce.mockRejectedValue(new Error('down'));
    const { app } = await buildApp({ withSocket: true });
    try {
      const res = await app.inject({ method: 'DELETE', url });
      await flush();
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});

// #9927 — épingler (ou dépingler) dans Meeshy Global met un message en avant
// pour TOUT le salon : c'est y écrire. Un mineur déclaré ne le fait pas.

/** Horloge FIGÉE (#9927) : une date de naissance comparée à l'horloge murale rougirait le jour où l'âge change. */
const FROZEN_NOW = new Date('2026-10-10T12:00:00.000Z');
const yearsBeforeFrozenNow = (years: number): Date =>
  new Date(Date.UTC(FROZEN_NOW.getUTCFullYear() - years, FROZEN_NOW.getUTCMonth(), FROZEN_NOW.getUTCDate()));
const freezeClock = () => jest.useFakeTimers({
  doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'performance', 'hrtime'],
  now: FROZEN_NOW,
});

describe('épingler / dépingler dans Global — un mineur déclaré en est exclu (#9927)', () => {
  afterEach(() => { jest.useRealTimers(); });
  beforeEach(() => {
    freezeClock();
    mockAnnounce.mockReset();
    mockAnnounce.mockResolvedValue(undefined);
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it.each(['PUT', 'DELETE'] as const)('%s refusé à un mineur de 15 ans : 403 GLOBAL_ADULTS_ONLY, rien n’est écrit', async (method) => {
    const { app, prisma } = await buildApp({ conversationType: 'global', birthDate: yearsBeforeFrozenNow(15) });
    try {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ success: false, code: 'GLOBAL_ADULTS_ONLY' });
      expect(prisma.message.update).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('un majeur, ou un âge non déclaré, épingle dans Global', async () => {
    const { app, prisma } = await buildApp({ conversationType: 'global', birthDate: null });
    try {
      const res = await app.inject({ method: 'PUT', url });
      expect(res.statusCode).toBe(200);
      expect(prisma.message.update).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('un mineur épingle hors de Global, sans que sa date de naissance soit lue', async () => {
    const { app, prisma } = await buildApp({ conversationType: 'group', birthDate: yearsBeforeFrozenNow(15) });
    try {
      const res = await app.inject({ method: 'PUT', url });
      expect(res.statusCode).toBe(200);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
