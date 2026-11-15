/**
 * **Un REJEU n'est pas un geste** (#17031).
 *
 * Épingler un message DÉJÀ épinglé, ou dépingler un message qui ne l'est pas,
 * est une écriture SANS EFFET — et elle annonçait pourtant une activité :
 * `announceConversationActivity` avance `lastActivityAt` (jamais réversible,
 * `at = new Date()` à chaque appel, donc la condition `lastActivityAt < at` est
 * toujours vraie) et émet un `conversation:updated` porteur d'un `listRankAt`
 * neuf **à chaque participant**. La conversation remontait donc en tête de
 * liste de tout le monde, autant de fois qu'on rejoue le geste, et `pinnedBy`
 * changeait de main à chaque rejeu — ce qui réordonne en prime la liste des
 * épinglés, triée `pinnedAt: 'desc'`.
 *
 * **Le témoin porte le REJEU, et il ne peut pas en être autrement** : au rang
 * nominal — un pin sur un message non épinglé, un unpin sur un message épinglé
 * — la forme juste et le défaut rendent le MÊME verdict. Les deux cas nominaux
 * sont donc gardés ici aussi, verts des deux côtés, pour que le correctif ne
 * puisse pas se payer en supprimant le geste lui-même.
 *
 * Le code SAVAIT déjà que ré-épingler n'est pas un geste neuf — « seul un
 * message qui DEVIENT épinglé rapporte `tool.pin` (#8959) » — et n'en tirait la
 * conséquence que pour le crédit d'engagement, ni pour l'écriture, ni pour
 * l'annonce, ni pour la diffusion. Le jumeau qui dépingle ne pouvait même pas
 * s'en apercevoir : son `select` ne lisait pas `pinnedAt`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
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
const OTHER_USER_ID = '507f1f77bcf86cd799439099';
const MESSAGE_ID = '507f1f77bcf86cd799439033';
const PINNED_AT = new Date('2026-11-01T08:30:00.000Z');

async function buildApp(options: { pinnedAt?: Date | null; pinnedBy?: string | null } = {}) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const emit = jest.fn();
  const io = { to: jest.fn(() => ({ emit })) };
  const enqueue = jest.fn<any>(async () => undefined);
  const manager = { getIO: () => io, enqueueOfflineMessageMutation: enqueue };
  app.decorate('socketIOHandler', { getManager: () => manager } as never);
  const prisma = {
    message: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: MESSAGE_ID,
        pinnedAt: options.pinnedAt ?? null,
        pinnedBy: options.pinnedBy ?? null,
      }),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    user: { findUnique: jest.fn<any>().mockResolvedValue({ birthDate: null }) },
  };
  const auth = async (req: any) => {
    req.authContext = { type: 'user', isAuthenticated: true, isAnonymous: false, userId: USER_ID };
  };
  registerMessagePinRoutes(app, prisma as any, auth, {});
  await app.ready();
  return { app, prisma, io, emit, enqueue };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));
const url = `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin`;

describe('un rejeu de pin / unpin ne remonte pas la conversation de tous (#17031)', () => {
  beforeEach(() => {
    mockAnnounce.mockReset();
    mockAnnounce.mockResolvedValue(undefined);
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it("ré-épingler n'écrit rien, n'annonce rien, ne diffuse rien, et n'enfile rien", async () => {
    const { app, prisma, io, enqueue } = await buildApp({ pinnedAt: PINNED_AT, pinnedBy: OTHER_USER_ID });
    try {
      const res = await app.inject({ method: 'PUT', url });
      await flush();
      expect(res.statusCode).toBe(200);
      expect(prisma.message.update).not.toHaveBeenCalled();
      expect(mockAnnounce).not.toHaveBeenCalled();
      expect(io.to).not.toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("ré-épingler sert l'épingle EXISTANTE, sans voler son attribution", async () => {
    const { app } = await buildApp({ pinnedAt: PINNED_AT, pinnedBy: OTHER_USER_ID });
    try {
      const res = await app.inject({ method: 'PUT', url });
      expect(res.statusCode).toBe(200);
      expect(res.json().data).toEqual({ pinnedAt: PINNED_AT.toISOString(), pinnedBy: OTHER_USER_ID });
    } finally {
      await app.close();
    }
  });

  it("dépingler un message qui ne l'est pas n'écrit rien, n'annonce rien, ne diffuse rien, et n'enfile rien", async () => {
    const { app, prisma, io, enqueue } = await buildApp({ pinnedAt: null });
    try {
      const res = await app.inject({ method: 'DELETE', url });
      await flush();
      expect(res.statusCode).toBe(200);
      expect(prisma.message.update).not.toHaveBeenCalled();
      expect(mockAnnounce).not.toHaveBeenCalled();
      expect(io.to).not.toHaveBeenCalled();
      expect(enqueue).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('le dépinglage lit `pinnedAt` — sans la colonne, il ne peut pas voir le rejeu', async () => {
    const { app, prisma } = await buildApp({ pinnedAt: PINNED_AT, pinnedBy: USER_ID });
    try {
      await app.inject({ method: 'DELETE', url });
      const [args] = prisma.message.findFirst.mock.calls[0] as [{ select: Record<string, unknown> }];
      expect(args.select).toMatchObject({ pinnedAt: true });
    } finally {
      await app.close();
    }
  });

  // ─── Les deux cas NOMINAUX : verts des deux côtés du correctif ──────────────
  // Ils ne peuvent pas tomber sur le défaut — c'est pourquoi les quatre témoins
  // ci-dessus portent le rejeu — et ils interdisent que le correctif se paie en
  // supprimant le geste.

  it('épingler un message NON épinglé écrit, annonce, diffuse et enfile', async () => {
    const { app, prisma, io, enqueue } = await buildApp({ pinnedAt: null });
    try {
      const res = await app.inject({ method: 'PUT', url });
      await flush();
      expect(res.statusCode).toBe(200);
      expect(prisma.message.update).toHaveBeenCalledTimes(1);
      expect(mockAnnounce).toHaveBeenCalledTimes(1);
      expect(enqueue).toHaveBeenCalledTimes(1);
      expect(io.to).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('dépingler un message épinglé écrit, annonce, diffuse et enfile', async () => {
    const { app, prisma, io, enqueue } = await buildApp({ pinnedAt: PINNED_AT, pinnedBy: USER_ID });
    try {
      const res = await app.inject({ method: 'DELETE', url });
      await flush();
      expect(res.statusCode).toBe(200);
      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { pinnedAt: null, pinnedBy: null } }),
      );
      expect(mockAnnounce).toHaveBeenCalledTimes(1);
      expect(enqueue).toHaveBeenCalledTimes(1);
      expect(io.to).toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
