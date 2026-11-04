/**
 * #14690 — chaque lecteur reçoit, sur la conversation, ce qu'il peut y faire :
 * `viewerCapabilities.canMakeObsolete`. La capacité servie par la liste et par
 * le détail est la MÊME décision que celle qui garde
 * `DELETE /conversations/:id/obsolete` : les trois routes lisent ici un même
 * monde Prisma, et chaque scénario les interroge toutes.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const CONV_ID = '507f1f77bcf86cd799439b11';
const ALICE = '507f1f77bcf86cd799439b22';
const BOB = '507f1f77bcf86cd799439b33';
const CAROL = '507f1f77bcf86cd799439b44';
const JOINED = new Date('2026-10-01T08:00:00.000Z');
const OBSOLETED_AT = new Date('2026-11-04T10:00:00.000Z');
const PURGE_AFTER = new Date('2026-11-06T10:00:00.000Z');

const mockObsoleteConversation = jest.fn<any>();

jest.mock('../../../../services/conversations/obsoleteConversation', () => ({
  ...jest.requireActual<object>('../../../../services/conversations/obsoleteConversation'),
  obsoleteConversation: (...args: unknown[]) => mockObsoleteConversation(...args),
}));

jest.mock('../../../../services/messaging/messageRequests', () => ({
  ...jest.requireActual<object>('../../../../services/messaging/messageRequests'),
  decideOpenings: jest.fn(async () => new Map()),
  decideDirectOpening: jest.fn(async () => ({ kind: 'direct' })),
}));

jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: async (_viewer: unknown, ids: readonly string[]) =>
      new Map(ids.map((id) => [id, { showOnline: false, showLastSeenTimestamp: false }])),
    resolveForTarget: async () => ({ showOnline: false, showLastSeenTimestamp: false }),
    acceptedFriendIds: async () => new Set<string>(),
  }),
}));

jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: async () => '507f1f77bcf86cd799439b11',
  invalidateConversationIdCache: () => undefined,
}));

jest.mock('../../../../routes/conversations/utils/access-control', () =>
  (jest.requireActual('../../../helpers/acces-conversation-double') as any).doubleAccesConversation(
    jest.requireActual('../../../../routes/conversations/utils/access-control') as Record<string, unknown>,
    async () => true,
  ));

jest.mock('../../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: class {
    getUnreadCountsForUser() { return Promise.resolve(new Map()); }
    getUnreadCount() { return Promise.resolve(0); }
  },
}));

import { registerConversationListRoute } from '../../../../routes/conversations/core-list';
import { registerConversationDetailRoute } from '../../../../routes/conversations/core-detail';
import { registerObsoleteConversationRoute } from '../../../../routes/conversations/obsolete';

type Row = {
  readonly id: string;
  readonly userId: string;
  readonly role: string;
  readonly messageRequestAt?: Date | null;
  readonly messageRequestFromId?: string | null;
};

type World = { readonly type: string; readonly rows: readonly Row[] };

type Where = Record<string, unknown>;

const isSubset = (value: unknown, filter: unknown): boolean => {
  if (filter === undefined) return true;
  if (filter !== null && typeof filter === 'object' && !(filter instanceof Date)) {
    const f = filter as Record<string, unknown>;
    if ('in' in f) return (f.in as unknown[]).includes(value);
    if ('not' in f) return f.not === null ? value !== null && value !== undefined : value !== f.not;
    if ('isSet' in f) return f.isSet ? value !== undefined : value === undefined;
  }
  return value === filter;
};

const participantRows = (world: World) =>
  world.rows.map((row) => ({
    id: row.id,
    conversationId: CONV_ID,
    userId: row.userId,
    type: 'user',
    role: row.role,
    isActive: true,
    leftAt: null,
    bannedAt: null,
    deletedForMe: null,
    joinedAt: JOINED,
    displayName: row.userId,
    avatar: null,
    language: 'fr',
    nickname: null,
    permissions: null,
    isOnline: false,
    lastActiveAt: null,
    messageRequestAt: row.messageRequestAt ?? null,
    messageRequestRisk: null,
    messageRequestFromId: row.messageRequestFromId ?? null,
    conversation: { type: world.type, identifier: 'mee_14690' },
    user: { id: row.userId, username: row.userId, displayName: row.userId, firstName: 'F', lastName: 'L', role: 'USER' },
  }));

const matches = (row: Record<string, unknown>, where: Where | undefined): boolean => {
  if (!where) return true;
  return Object.entries(where).every(([key, filter]) => {
    if (key === 'OR') return (filter as Where[]).some((clause) => matches(row, clause));
    if (key === 'NOT') return !matches(row, filter as Where);
    if (key === 'AND') return (filter as Where[]).every((clause) => matches(row, clause));
    return isSubset(row[key], filter);
  });
};

const prismaFor = (world: World): any => {
  const rows = () => participantRows(world);
  const conversation = {
    id: CONV_ID, type: world.type, title: 'Salon', identifier: 'mee_14690', isActive: true,
    createdAt: JOINED, updatedAt: JOINED, lastMessageAt: JOINED, banner: null, avatar: null, communityId: null,
    isAnnouncementChannel: false, _count: { participants: world.rows.length }, userPreferences: [], messages: [],
    participants: rows(),
  };
  return {
    conversation: {
      findMany: jest.fn<any>().mockResolvedValue([conversation]),
      findFirst: jest.fn<any>().mockResolvedValue(conversation),
      count: jest.fn<any>().mockResolvedValue(1),
    },
    participant: {
      findMany: jest.fn<any>(async (args: any) => rows().filter((row) => matches(row, args?.where))),
      findFirst: jest.fn<any>(async (args: any) => rows().find((row) => matches(row, args?.where)) ?? null),
      count: jest.fn<any>(async (args: any) => rows().filter((row) => matches(row, args?.where)).length),
      groupBy: jest.fn<any>(async (args: any) => {
        const kept = rows().filter((row) => matches(row, args?.where));
        return kept.length === 0 ? [] : [{ conversationId: CONV_ID, _count: { _all: kept.length } }];
      }),
    },
    conversationReadCursor: { findMany: jest.fn<any>().mockResolvedValue([]) },
    message: { findFirst: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    user: {
      findMany: jest.fn<any>(async () => world.rows.map((row) => ({ id: row.userId, role: 'USER' }))),
      findUnique: jest.fn<any>().mockResolvedValue({ birthDate: null }),
    },
    agentConversationSummary: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    agentUserRole: { findMany: jest.fn<any>().mockResolvedValue([]) },
    agentAnalysisSnapshot: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversationShareLink: { findMany: jest.fn<any>().mockResolvedValue([]) },
    $transaction: jest.fn((ops: any) => Promise.all(ops)),
  };
};

type Handler = (request: unknown, reply: unknown) => Promise<unknown>;

const createFastify = () => {
  const routes = new Map<string, Handler>();
  const on = (method: string) => (path: string, _options: unknown, handler: Handler) => {
    routes.set(`${method} ${path}`, handler);
  };
  const io = (): any => ({ to: () => io(), except: () => io(), emit: () => undefined });
  return {
    get: on('GET'),
    post: on('POST'),
    put: on('PUT'),
    patch: on('PATCH'),
    delete: on('DELETE'),
    socketIOHandler: { getManager: () => ({ getIO: () => io() }) },
    notificationService: { markConversationNotificationsAsRead: async () => undefined },
    handler: (key: string): Handler => {
      const handler = routes.get(key);
      if (!handler) throw new Error(`route absente : ${key}`);
      return handler;
    },
  };
};

const createReply = () => {
  const reply: any = { body: undefined, statusCode: 200 };
  reply.status = (code: number) => { reply.statusCode = code; return reply; };
  reply.code = reply.status;
  reply.header = () => reply;
  reply.send = (body: unknown) => { reply.body = body; return reply; };
  return reply;
};

const requestAs = (userId: string) => ({
  authContext: {
    type: 'user',
    isAuthenticated: true,
    isAnonymous: false,
    userId,
    registeredUser: { id: userId, role: 'USER' },
    sessionToken: null,
  },
  params: { id: CONV_ID },
  query: {},
  body: {},
  headers: {},
});

const readAs = async (world: World, userId: string) => {
  const fastify = createFastify();
  const prisma = prismaFor(world);
  registerConversationListRoute(fastify as never, prisma, jest.fn() as never);
  registerConversationDetailRoute(fastify as never, prisma, jest.fn() as never);
  registerObsoleteConversationRoute(fastify as never, prisma, jest.fn() as never);
  const call = async (key: string) => {
    const reply = createReply();
    await fastify.handler(key)(requestAs(userId), reply);
    return reply;
  };
  const list = await call('GET /conversations');
  const detail = await call('GET /conversations/:id');
  const obsolete = await call('DELETE /conversations/:id/obsolete');
  expect(list.statusCode).toBe(200);
  expect(detail.statusCode).toBe(200);
  return {
    list: (list.body as { data: Array<Record<string, any>> }).data[0]?.viewerCapabilities,
    detail: (detail.body as { data: Record<string, any> }).data.viewerCapabilities,
    obsoleteStatus: obsolete.statusCode,
  };
};

const pendingDirect: World = {
  type: 'direct',
  rows: [
    { id: 'p-alice', userId: ALICE, role: 'creator' },
    { id: 'p-bob', userId: BOB, role: 'member', messageRequestAt: new Date('2026-11-03T09:00:00.000Z') },
  ],
};

const acceptedDirect: World = {
  type: 'direct',
  rows: [
    { id: 'p-alice', userId: ALICE, role: 'creator' },
    { id: 'p-bob', userId: BOB, role: 'member' },
  ],
};

const group: World = {
  type: 'group',
  rows: [
    { id: 'p-alice', userId: ALICE, role: 'creator' },
    { id: 'p-bob', userId: BOB, role: 'admin' },
    { id: 'p-carol', userId: CAROL, role: 'member' },
  ],
};

beforeEach(() => {
  mockObsoleteConversation.mockReset();
  mockObsoleteConversation.mockResolvedValue({ kind: 'obsoleted', conversationId: CONV_ID, obsoletedAt: OBSOLETED_AT, purgeAfter: PURGE_AFTER });
});

describe('#14690 — viewerCapabilities.canMakeObsolete suit la garde de DELETE /conversations/:id/obsolete', () => {
  it("l'expéditeur d'une demande non acceptée : false sur la liste et le détail, 403 sur la route", async () => {
    const served = await readAs(pendingDirect, ALICE);
    expect(served.list).toEqual({ canMakeObsolete: false });
    expect(served.detail).toEqual({ canMakeObsolete: false });
    expect(served.obsoleteStatus).toBe(403);
    expect(mockObsoleteConversation).not.toHaveBeenCalled();
  });

  it('le destinataire de cette demande : true sur la liste et le détail, 200 sur la route', async () => {
    const served = await readAs(pendingDirect, BOB);
    expect(served.list).toEqual({ canMakeObsolete: true });
    expect(served.detail).toEqual({ canMakeObsolete: true });
    expect(served.obsoleteStatus).toBe(200);
  });

  it("une fois la demande acceptée, l'un et l'autre membre du tête-à-tête : true et 200", async () => {
    for (const userId of [ALICE, BOB]) {
      mockObsoleteConversation.mockClear();
      const served = await readAs(acceptedDirect, userId);
      expect(served.list).toEqual({ canMakeObsolete: true });
      expect(served.detail).toEqual({ canMakeObsolete: true });
      expect(served.obsoleteStatus).toBe(200);
    }
  });

  it("un membre de groupe qui n'est pas administrateur : false et 403", async () => {
    const served = await readAs(group, CAROL);
    expect(served.list).toEqual({ canMakeObsolete: false });
    expect(served.detail).toEqual({ canMakeObsolete: false });
    expect(served.obsoleteStatus).toBe(403);
  });

  it("l'administrateur et le créateur d'un groupe : true et 200", async () => {
    for (const userId of [ALICE, BOB]) {
      const served = await readAs(group, userId);
      expect(served.list).toEqual({ canMakeObsolete: true });
      expect(served.detail).toEqual({ canMakeObsolete: true });
      expect(served.obsoleteStatus).toBe(200);
    }
  });
});
