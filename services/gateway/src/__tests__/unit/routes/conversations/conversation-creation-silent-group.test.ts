/**
 * #14644 — un groupe neuf ne s'annonce aux invités qu'au premier message (B),
 * et un groupe peut n'avoir que son créateur, à condition d'avoir un titre (C).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../../services/messaging/messageRequests', () => ({
  ...jest.requireActual<object>('../../../../services/messaging/messageRequests'),
  decideOpenings: jest.fn(async () => new Map()),
  decideDirectOpening: jest.fn(async () => ({ kind: 'direct' })),
}));

jest.mock('../../../../routes/conversations/utils/identifier-generator', () => ({
  generateConversationIdentifier: jest.fn<any>().mockReturnValue('mshy_groupe'),
  generateCompactConversationIdentifier: jest.fn<any>().mockReturnValue('mshy_AbCdEfGhIjKl'),
  ensureUniqueConversationIdentifier: jest.fn<any>().mockResolvedValue('mshy_unique'),
}));

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({ error: jest.fn<any>(), info: jest.fn<any>(), warn: jest.fn<any>(), debug: jest.fn<any>() }),
  },
}));

jest.mock('../../../../services/EncryptionService', () => ({
  getEncryptionService: jest.fn(async () => ({ activationKeyId: async () => 'server-key' })),
}));

jest.mock('../../../../utils/response', () => ({
  sendSuccess: jest.fn<any>((reply: any, data: any, options?: { statusCode?: number }) => {
    reply.statusCode = options?.statusCode ?? 200;
    reply.body = { success: true, data };
    return reply;
  }),
  sendError: jest.fn<any>((reply: any, status: number) => { reply.statusCode = status; return reply; }),
  sendForbidden: jest.fn<any>((reply: any) => { reply.statusCode = 403; return reply; }),
  sendNotFound: jest.fn<any>((reply: any) => { reply.statusCode = 404; return reply; }),
  sendInternalError: jest.fn<any>((reply: any) => { reply.statusCode = 500; return reply; }),
}));

jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: jest.fn<any>().mockReturnValue({ resolveForTargets: jest.fn<any>().mockResolvedValue(new Map()) }),
}));

jest.mock('../../../../services/achievements/CerclesAchievements', () => ({
  CerclesAchievements: jest.fn<any>().mockImplementation(() => ({ recordEvent: jest.fn<any>().mockResolvedValue(undefined) })),
}));

jest.mock('../../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn<any>().mockImplementation(() => ({ recordGroupCreation: jest.fn<any>().mockResolvedValue(undefined) })),
}));

import { registerCreateConversationRoute } from '../../../../routes/conversations/core-lifecycle';

const CONV_ID = '507f1f77bcf86cd799439011';
const MOI = '507f1f77bcf86cd799439022';
const AUTRE = '507f1f77bcf86cd799439033';

function prismaDouble() {
  const created: { type?: string; rows: Array<{ userId: string; role: string }> } = { rows: [] };
  return {
    community: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    conversation: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      create: jest.fn<any>(async (args: any) => {
        created.type = args.data.type;
        created.rows = args.data.participants.create;
        return {
        id: CONV_ID,
        type: args.data.type,
        title: args.data.title,
        createdAt: new Date('2026-11-02T09:00:00.000Z'),
        participants: args.data.participants.create.map((p: any, i: number) => ({ id: `p${i}`, ...p, user: { id: p.userId, displayName: p.displayName } })),
        };
      }),
      update: jest.fn<any>().mockResolvedValue({ id: CONV_ID }),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    participant: {
      findMany: jest.fn<any>(async (args: any) =>
        Array.isArray(args?.where?.userId?.in) && args?.select?.conversation
          ? created.rows
              .filter((row) => args.where.userId.in.includes(row.userId))
              .map((row) => ({ conversationId: CONV_ID, userId: row.userId, role: row.role, type: 'user', leftAt: null, bannedAt: null, conversation: { type: created.type, identifier: 'mshy_groupe' } }))
          : []),
      groupBy: jest.fn<any>().mockResolvedValue([]),
    },
    user: {
      findMany: jest.fn<any>().mockResolvedValue([
        { id: MOI, displayName: 'Moi', username: 'moi', avatar: null },
        { id: AUTRE, displayName: 'Alice', username: 'alice', avatar: null },
      ]),
    },
  };
}

async function creer(body: Record<string, unknown>) {
  const prisma = prismaDouble();
  const emitted: Array<{ room: string; event: string; payload?: any }> = [];
  const notificationService = { createConversationInviteNotification: jest.fn<any>().mockResolvedValue(null) };
  let handler: any;
  const fastify: any = {
    post: jest.fn<any>((_path: string, _opts: any, h: any) => { handler = h; }),
    notificationService,
    socketIOHandler: {
      getManager: jest.fn<any>().mockReturnValue({
        getIO: jest.fn<any>().mockReturnValue({ to: (room: string) => ({ emit: (event: string, payload?: any) => emitted.push({ room, event, payload }) }) }),
        joinUserToConversationRoom: jest.fn<any>().mockResolvedValue(undefined),
      }),
    },
  };
  registerCreateConversationRoute(fastify, prisma as never, jest.fn<any>());
  const reply: any = { statusCode: 0, body: undefined };
  reply.status = jest.fn<any>((code: number) => { reply.statusCode = code; return reply; });
  reply.code = reply.status;
  reply.header = jest.fn<any>(() => reply);
  reply.send = jest.fn<any>((payload: unknown) => { reply.body = payload; return reply; });
  await handler(
    {
      body,
      params: {}, query: {}, headers: {},
      authContext: { type: 'user', isAuthenticated: true, isAnonymous: false, userId: MOI, registeredUser: { id: MOI, role: 'USER' } },
      user: { userId: MOI },
    },
    reply,
  );
  await new Promise((resolve) => setImmediate(resolve));
  return { prisma, emitted, notificationService, reply };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('#14644 (B) — un groupe neuf est silencieux jusqu\'à son premier message', () => {
  it('naît avec firstMessageSentAt: null, posé explicitement', async () => {
    const { prisma } = await creer({ type: 'group', title: 'Équipe', participantIds: [AUTRE] });
    expect((prisma.conversation.create.mock.calls[0][0] as any).data.firstMessageSentAt).toBeNull();
  });

  it('seul le créateur reçoit conversation:new à la création', async () => {
    const { emitted } = await creer({ type: 'group', title: 'Équipe', participantIds: [AUTRE] });
    expect(emitted.filter((e) => e.event === 'conversation:new').map((e) => e.room)).toEqual([`user:${MOI}`]);
  });

  it('#14690 — le créateur reçoit conversation:new avec sa capacité de rendre le groupe obsolète', async () => {
    const { emitted } = await creer({ type: 'group', title: 'Équipe', participantIds: [AUTRE] });
    const announced = emitted.find((e) => e.event === 'conversation:new');
    expect(announced?.payload.viewerCapabilities).toEqual({ canMakeObsolete: true });
  });

  it('aucune invitation ne part à la création', async () => {
    const { notificationService } = await creer({ type: 'group', title: 'Équipe', participantIds: [AUTRE] });
    expect(notificationService.createConversationInviteNotification).not.toHaveBeenCalled();
  });

  it('une conversation publique reste annoncée et sans le champ', async () => {
    const { prisma, emitted, notificationService } = await creer({ type: 'public', title: 'Agora', participantIds: [AUTRE] });
    expect('firstMessageSentAt' in (prisma.conversation.create.mock.calls[0][0] as any).data).toBe(false);
    expect(emitted.filter((e) => e.event === 'conversation:new').map((e) => e.room).sort()).toEqual([`user:${AUTRE}`, `user:${MOI}`].sort());
    expect(notificationService.createConversationInviteNotification).toHaveBeenCalledTimes(1);
  });
});

describe('#14644 (C) — un groupe peut n\'avoir que son créateur', () => {
  it('un groupe à 0 invité avec un titre est créé, et sa réponse ne porte que son créateur', async () => {
    const { reply, prisma } = await creer({ type: 'group', title: 'Recueil d\'avis', participantIds: [] });
    expect(reply.statusCode).toBe(201);
    const created = (prisma.conversation.create.mock.calls[0][0] as any).data;
    expect(created.type).toBe('group');
    expect(created.title).toBe('Recueil d\'avis');
    expect(created.participants.create).toHaveLength(1);
    expect(created.participants.create[0]).toMatchObject({ userId: MOI, role: 'creator' });
    expect(reply.body.data.title).toBe('Recueil d\'avis');
    expect(reply.body.data.participants.map((p: any) => p.userId)).toEqual([MOI]);
  });

  it('un groupe à 0 invité sans titre est refusé', async () => {
    const { reply, prisma } = await creer({ type: 'group', participantIds: [] });
    expect(reply.statusCode).toBe(400);
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it('un groupe à 0 invité au titre blanc est refusé', async () => {
    const { reply, prisma } = await creer({ type: 'group', title: '   ', participantIds: [] });
    expect(reply.statusCode).toBe(400);
    expect(prisma.conversation.create).not.toHaveBeenCalled();
  });

  it('un groupe avec invités garde son titre facultatif', async () => {
    const { reply } = await creer({ type: 'group', participantIds: [AUTRE] });
    expect(reply.statusCode).toBe(201);
  });
});
