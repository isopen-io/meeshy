/**
 * #17117 / #9223 — un ancien client ne reçoit JAMAIS une conversation externe :
 * `GET /conversations` ne la sert qu'au client qui annonce le jeton
 * `external-conversations` (`X-Meeshy-Capabilities`). Sans l'en-tête, la liste
 * est EXACTEMENT celle d'avant ; `Vary` le dit à tout cache partagé.
 *
 * Le double Prisma ÉVALUE le `where` reçu contre deux conversations (une
 * directe, une externe) : c'est la forme SERVIE qui parle, pas la clause.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { EXTERNAL_CONVERSATIONS_CAPABILITY } from '@meeshy/shared/types/external-conversation';

const ALICE = '507f1f77bcf86cd799439a01';
const BOB = '507f1f77bcf86cd799439a02';
const DIRECT_ID = '507f1f77bcf86cd799439c01';
const EXTERNAL_ID = '507f1f77bcf86cd799439c02';
const JOINED = new Date('2026-11-01T08:00:00.000Z');

jest.mock('../../../../services/messaging/messageRequests', () => ({
  ...jest.requireActual<object>('../../../../services/messaging/messageRequests'),
  decideOpenings: jest.fn(async () => new Map()),
}));

jest.mock('../../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: async (_viewer: unknown, ids: readonly string[]) =>
      new Map(ids.map((id) => [id, { showOnline: false, showLastSeenTimestamp: false }])),
    resolveForTarget: async () => ({ showOnline: false, showLastSeenTimestamp: false }),
    acceptedFriendIds: async () => new Set<string>(),
  }),
}));

jest.mock('../../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: class {
    getUnreadCountsForUser() { return Promise.resolve(new Map()); }
    getUnreadCount() { return Promise.resolve(0); }
  },
}));

import { registerConversationListRoute } from '../../../../routes/conversations/core-list';

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const RELATIONS = new Set(['participants', 'userPreferences', 'messages']);

const satisfies = (value: unknown, filter: unknown): boolean => {
  if (filter === undefined) return true;
  if (filter === null || typeof filter !== 'object' || filter instanceof Date) return value === filter;
  return Object.entries(filter as Record<string, unknown>).every(([operator, operand]) => {
    if (operator === 'in') return (operand as unknown[]).includes(value);
    if (operator === 'notIn') return !(operand as unknown[]).includes(value);
    if (operator === 'not') return operand === null ? value !== null && value !== undefined : value !== operand;
    if (operator === 'isSet') return operand ? value !== undefined : value === undefined;
    throw new Error(`opérateur inconnu du double : ${operator}`);
  });
};

const matches = (row: Row, where: Where | undefined): boolean =>
  !where ||
  Object.entries(where).every(([key, filter]) => {
    if (key === 'AND') return (Array.isArray(filter) ? filter : [filter]).every((clause) => matches(row, clause as Where));
    if (key === 'OR') return (filter as Where[]).some((clause) => matches(row, clause));
    if (key === 'NOT') return (Array.isArray(filter) ? filter : [filter]).every((clause) => !matches(row, clause as Where));
    if (RELATIONS.has(key)) return true;
    return satisfies(row[key], filter);
  });

const participant = (conversationId: string, userId: string, role: string) => ({
  id: `p-${conversationId}-${userId}`, conversationId, userId, type: 'user', role, isActive: true, leftAt: null, bannedAt: null,
  deletedForMe: null, joinedAt: JOINED, displayName: userId, avatar: null, language: 'fr', nickname: null, permissions: null,
  isOnline: false, lastActiveAt: null, messageRequestAt: null, messageRequestRisk: null, messageRequestFromId: null,
  user: { id: userId, username: userId, displayName: userId, firstName: 'F', lastName: 'L', role: 'USER' },
});

const conversation = (id: string, type: string, members: ReturnType<typeof participant>[]): Row => ({
  id, type, title: null, identifier: type === 'external' ? `ext_${id}` : `mee_${id}`, isActive: true,
  encryptionMode: 'e2ee', createdAt: JOINED, updatedAt: JOINED, lastMessageAt: JOINED, firstMessageSentAt: JOINED,
  banner: null, avatar: null, communityId: null, isAnnouncementChannel: false, _count: { participants: members.length },
  userPreferences: [], messages: [], participants: members,
});

const WORLD: readonly Row[] = [
  conversation(DIRECT_ID, 'direct', [participant(DIRECT_ID, ALICE, 'creator'), participant(DIRECT_ID, BOB, 'member')]),
  conversation(EXTERNAL_ID, 'external', [participant(EXTERNAL_ID, ALICE, 'creator')]),
];

const prismaFor = () => ({
  conversation: {
    findMany: jest.fn(async (args: { where?: Where; skip?: number; take?: number }) =>
      WORLD.filter((row) => matches(row, args.where)).slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? WORLD.length))),
    findFirst: jest.fn(async () => null),
    count: jest.fn(async (args: { where?: Where }) => WORLD.filter((row) => matches(row, args.where)).length),
  },
  participant: { findMany: jest.fn(async () => []), findFirst: jest.fn(async () => null), count: jest.fn(async () => 0), groupBy: jest.fn(async () => []) },
  conversationReadCursor: { findMany: jest.fn(async () => []) },
  message: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
  user: { findMany: jest.fn(async () => []), findUnique: jest.fn(async () => ({ birthDate: null })) },
  agentConversationSummary: { findUnique: jest.fn(async () => null) },
  agentUserRole: { findMany: jest.fn(async () => []) },
  agentAnalysisSnapshot: { findMany: jest.fn(async () => []) },
  conversationShareLink: { findMany: jest.fn(async () => []) },
  $transaction: jest.fn((ops: unknown) => Promise.all(ops as Promise<unknown>[])),
});

type Handler = (request: unknown, reply: unknown) => Promise<unknown>;

const list = async (headers: Record<string, string>) => {
  const routes = new Map<string, Handler>();
  const fastify = {
    get: (path: string, _options: unknown, handler: Handler) => { routes.set(path, handler); },
    socketIOHandler: { getManager: () => null },
  };
  registerConversationListRoute(fastify as never, prismaFor() as never, jest.fn() as never);
  const sent: Record<string, string> = {};
  const reply = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    code(code: number) { this.statusCode = code; return this; },
    header(name: string, value: string) { sent[name.toLowerCase()] = value; return this; },
    getHeader(name: string) { return sent[name.toLowerCase()]; },
    send(body: unknown) { this.body = body; return this; },
  };
  const handler = routes.get('/conversations');
  if (!handler) throw new Error('route absente');
  await handler(
    { authContext: { type: 'user', isAuthenticated: true, isAnonymous: false, userId: ALICE, registeredUser: { id: ALICE, role: 'USER' } }, query: {}, headers },
    reply,
  );
  expect(reply.statusCode).toBe(200);
  const served = (reply.body as { data: Array<{ id: string; type: string }> }).data;
  return { served, vary: sent.vary ?? '' };
};

describe('GET /conversations et la conversation externe', () => {
  it('un ancien client, sans en-tête de capacité, ne la reçoit pas : sa liste est celle d’avant', async () => {
    const { served } = await list({});

    expect(served.map((row) => row.id)).toEqual([DIRECT_ID]);
  });

  it('un client qui annonce d’autres jetons seulement ne la reçoit pas non plus', async () => {
    const { served } = await list({ 'x-meeshy-capabilities': 'onboarding-age, link-device-binding' });

    expect(served.map((row) => row.type)).toEqual(['direct']);
  });

  it('un client qui annonce le jeton la reçoit, avec son type', async () => {
    const { served } = await list({ 'x-meeshy-capabilities': `onboarding-age, ${EXTERNAL_CONVERSATIONS_CAPABILITY.toUpperCase()}` });

    expect(served.map((row) => [row.id, row.type])).toEqual(expect.arrayContaining([[DIRECT_ID, 'direct'], [EXTERNAL_ID, 'external']]));
    expect(served).toHaveLength(2);
  });

  it('la réponse varie selon l’en-tête de capacité, pour qu’aucun cache partagé ne serve l’une à la place de l’autre', async () => {
    const { vary } = await list({});

    expect(vary.toLowerCase()).toContain('x-meeshy-capabilities');
  });
});
