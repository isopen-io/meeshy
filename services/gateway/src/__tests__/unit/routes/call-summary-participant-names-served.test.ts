/**
 * #18242 R2 — le nom des participants d'un résumé d'appel se compose À LA
 * LECTURE (`withCallSummaryParticipantNames`, B2) : `Message.metadata` ne
 * persiste que leurs `userId`. Un témoin de COMPORTEMENT par famille de chemin
 * hydraté, mesuré sur ce que la vraie route SERT :
 *
 * | chemin | témoin |
 * |---|---|
 * | page `GET /conversations/:id/messages` | corps sérialisé par le vrai schéma de réponse |
 * | rattrapage `/sync` (`syncMessages`) | lignes `added` |
 * | aperçu de liste `GET /conversations` | `lastMessage.metadata` de la ligne |
 *
 * Chacun tombe si l'hydratation est remplacée par l'identité : la forme
 * stockée `{ userId }` n'a pas de `displayName`. La citation (`replyTo`
 * socket) a le sien : `socketio/__tests__/message-new-quoted-call-summary.test.ts`.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import Fastify from 'fastify';

jest.mock('../../../services/messaging/captureNoticeVisibility', () => ({
  ...jest.requireActual<object>('../../../services/messaging/captureNoticeVisibility'),
  hidingServedTo: async (_prisma: unknown, params: { hiding: unknown }) => params.hiding,
  hidingServedToReader: async (_prisma: unknown, params: { hiding: unknown }) => params.hiding,
}));
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockResolveConversationId = jest.fn<(...args: unknown[]) => Promise<string | null>>();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: unknown[]) => mockResolveConversationId(...args),
}));

const mockCanAccessConversation = jest.fn<(...args: unknown[]) => Promise<boolean>>();
jest.mock('../../../routes/conversations/utils/access-control', () =>
  jest.requireActual<typeof import('../../helpers/acces-conversation-double')>('../../helpers/acces-conversation-double').doubleAccesConversation(
    jest.requireActual<Record<string, unknown>>('../../../routes/conversations/utils/access-control'),
    (...args: unknown[]) => mockCanAccessConversation(...args)));

jest.mock('../../../services/MentionService', () => ({ resolveMentionedUsers: async () => [] }));
jest.mock('../../../services/message-translation/MessageTranslationService', () => ({ MessageTranslationService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/messaging/MessagingService', () => ({ MessagingService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/TrackingLinkService', () => ({ TrackingLinkService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/attachments', () => ({ AttachmentService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/PrivacyPreferencesService', () => ({ PrivacyPreferencesService: jest.fn().mockImplementation(() => ({})) }));
jest.mock('../../../services/messaging/messageRequests', () => ({
  ...jest.requireActual<object>('../../../services/messaging/messageRequests'),
  decideOpenings: async () => new Map(),
}));
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: async (_viewer: unknown, ids: readonly string[]) =>
      new Map(ids.map((id) => [id, { showOnline: false, showLastSeenTimestamp: false }])),
    resolveForTarget: async () => ({ showOnline: false, showLastSeenTimestamp: false }),
    acceptedFriendIds: async () => new Set<string>(),
  }),
}));
jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: class {
    getUnreadCountsForUser() { return Promise.resolve(new Map()); }
    getUnreadCount() { return Promise.resolve(0); }
  },
}));

import { registerMessagesRoutes } from '../../../routes/conversations/messages';
import { registerConversationListRoute } from '../../../routes/conversations/core-list';
import { syncMessages } from '../../../routes/sync/messages';

const CONV_ID = '507f1f77bcf86cd799439011';
const READER = '507f1f77bcf86cd799439022';
const AWA = '507f1f77bcf86cd7994390a1';
const SUMMARY_ID = '507f1f77bcf86cd799439099';
const INIT_PARTICIPANT = '507f1f77bcf86cd7994390c1';
const AT = new Date('2026-11-14T10:00:00.000Z');

type Where = {
  readonly id?: { readonly in?: readonly string[] };
  readonly userId?: unknown;
  readonly conversationId?: unknown;
};
type FindArgs = { readonly where?: Where };
type Served = { readonly metadata?: { readonly participants?: unknown } } | null | undefined;

/** Les membres que la lecture des noms interroge (`conversationId` ET `userId` en liste). */
const MEMBERS = [
  { conversationId: CONV_ID, userId: AWA, displayName: 'awa-copie', nickname: 'Awa', user: { displayName: 'Awa D.', firstName: 'Awa', lastName: 'Diop', username: 'awa' } },
  { conversationId: CONV_ID, userId: READER, displayName: 'Moi', nickname: null, user: { displayName: 'Moi', firstName: null, lastName: null, username: 'moi' } },
];

const isNameLookup = (where: Where | undefined): boolean =>
  typeof where?.userId === 'object' && where?.userId !== null && 'in' in (where.userId as object)
  && typeof where?.conversationId === 'object' && where?.conversationId !== null && 'in' in (where.conversationId as object);

const namesOr = <T>(fallback: () => T) => async (args?: FindArgs) => (isNameLookup(args?.where) ? MEMBERS : fallback());

const SERVED_PARTICIPANTS = [{ userId: AWA, displayName: 'Awa' }, { userId: READER, displayName: 'Moi' }];

const callSummary = (overrides: Record<string, unknown> = {}) => ({
  id: SUMMARY_ID,
  conversationId: CONV_ID,
  senderId: INIT_PARTICIPANT,
  content: 'Appel audio · 00:42',
  originalLanguage: 'fr',
  messageType: 'system',
  messageSource: 'system',
  metadata: {
    kind: 'call', callId: 'call-1', initiatorId: AWA, callType: 'audio', outcome: 'completed', durationSeconds: 42,
    participants: [{ userId: AWA }, { userId: READER }],
  },
  createdAt: AT,
  updatedAt: AT,
  deletedAt: null,
  attachments: [],
  translations: null,
  validatedMentions: null,
  _count: { attachments: 0 },
  sender: {
    id: INIT_PARTICIPANT, userId: AWA, displayName: 'Awa', avatar: null, type: 'user', role: 'member', language: 'fr',
    user: { id: AWA, username: 'awa', displayName: 'Awa' },
  },
  ...overrides,
});

const participantsOf = (served: Served): unknown => served?.metadata?.participants;

describe('page — GET /conversations/:id/messages', () => {
  it('sert le nom de chaque participant, composé à la lecture', async () => {
    const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
    app.decorate('socketIOHandler', { getManager: () => null } as never);
    app.decorate('notificationService', null);
    const prisma = {
      participant: { findFirst: async () => null, findMany: namesOr(() => []) },
      message: { count: async () => 1, findFirst: async () => ({ createdAt: AT }), findMany: async () => [callSummary()] },
      user: { findFirst: async () => null },
    };
    const auth = async (request: { authContext?: unknown }) => {
      request.authContext = { type: 'registered', isAuthenticated: true, isAnonymous: false, userId: READER, registeredUser: { id: READER, role: 'USER' } };
    };
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
    registerMessagesRoutes(app, prisma as never, {} as never, auth as never, auth as never);
    await app.ready();

    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/messages` });

    expect(res.statusCode).toBe(200);
    expect(participantsOf(res.json<{ data: Served[] }>().data[0])).toEqual(SERVED_PARTICIPANTS);
    await app.close();
  });
});

describe('rattrapage — /sync', () => {
  it('sert le nom de chaque participant dans les lignes rattrapées', async () => {
    const reader = {
      id: '507f1f77bcf86cd7994390d1', userId: READER, conversationId: CONV_ID, role: 'member', joinedAt: new Date('2026-01-01T00:00:00.000Z'),
      shareLinkId: null, historyVisibleFrom: null, permissions: null, anonymousSession: null, user: { role: 'USER' },
    };
    const prisma = {
      participant: { findMany: namesOr(() => [reader]) },
      conversationShareLink: { findMany: async () => [] },
      conversation: { findMany: async () => [{ id: CONV_ID, isAnnouncementChannel: false }] },
      userConversationPreferences: { findMany: async () => [] },
      userMessageDeletion: { findMany: async () => [] },
      reaction: { findMany: async () => [] },
      attachmentReaction: { findMany: async () => [] },
      message: {
        findMany: async (args?: FindArgs) =>
          args?.where && ('updatedAt' in args.where || 'OR' in args.where) ? [{ ...callSummary(), sender: null }] : [],
      },
    };

    const result = await syncMessages({
      prisma: prisma as never,
      identity: { kind: 'user', userId: READER },
      sinceDate: new Date('2026-11-01T00:00:00.000Z'),
      cap: 50,
    });

    const served = [...result.added, ...result.modified].find((row) => row.id === SUMMARY_ID);
    expect(participantsOf(served as Served)).toEqual(SERVED_PARTICIPANTS);
  });
});

describe('aperçu de liste — GET /conversations', () => {
  type Handler = (request: unknown, reply: unknown) => Promise<unknown>;

  it('sert le nom de chaque participant dans `lastMessage`', async () => {
    const member = (userId: string, role: string) => ({
      id: `p-${userId}`, conversationId: CONV_ID, userId, type: 'user', role, isActive: true, leftAt: null, bannedAt: null,
      deletedForMe: null, joinedAt: AT, displayName: userId, avatar: null, language: 'fr', nickname: null, permissions: null,
      isOnline: false, lastActiveAt: null, messageRequestAt: null, messageRequestRisk: null, messageRequestFromId: null,
      user: { id: userId, username: userId, displayName: userId, firstName: 'F', lastName: 'L', role: 'USER' },
    });
    const conversation = {
      id: CONV_ID, type: 'group', title: 'Équipe', identifier: `mee_${CONV_ID}`, isActive: true, encryptionMode: 'server',
      createdAt: AT, updatedAt: AT, lastMessageAt: AT, firstMessageSentAt: AT, banner: null, avatar: null, communityId: null,
      isAnnouncementChannel: false, _count: { participants: 2 }, userPreferences: [],
      messages: [callSummary()], participants: [member(READER, 'creator'), member(AWA, 'member')],
    };
    const prisma = {
      conversation: { findMany: async () => [conversation], findFirst: async () => null, count: async () => 1 },
      participant: { findMany: namesOr(() => []), findFirst: async () => null, count: async () => 0, groupBy: async () => [] },
      conversationReadCursor: { findMany: async () => [] },
      message: { findFirst: async () => null, findMany: async () => [], count: async () => 0 },
      user: { findMany: async () => [], findUnique: async () => ({ birthDate: null }) },
      agentConversationSummary: { findUnique: async () => null },
      agentUserRole: { findMany: async () => [] },
      agentAnalysisSnapshot: { findMany: async () => [] },
      conversationShareLink: { findMany: async () => [] },
      $transaction: (ops: readonly Promise<unknown>[]) => Promise.all(ops),
    };
    const routes = new Map<string, Handler>();
    const fastify = {
      get: (path: string, _options: unknown, handler: Handler) => { routes.set(path, handler); },
      socketIOHandler: { getManager: () => null },
    };
    registerConversationListRoute(fastify as never, prisma as never, jest.fn() as never);
    const reply = {
      statusCode: 200,
      body: undefined as unknown,
      status(code: number) { this.statusCode = code; return this; },
      code(code: number) { this.statusCode = code; return this; },
      header() { return this; },
      getHeader() { return undefined; },
      send(body: unknown) { this.body = body; return this; },
    };
    const handler = routes.get('/conversations');
    if (!handler) throw new Error('route absente');

    await handler(
      { authContext: { type: 'user', isAuthenticated: true, isAnonymous: false, userId: READER, registeredUser: { id: READER, role: 'USER' } }, query: {}, headers: {} },
      reply,
    );

    expect(reply.statusCode).toBe(200);
    const [row] = (reply.body as { data: Array<{ lastMessage: Served }> }).data;
    expect(participantsOf(row?.lastMessage)).toEqual(SERVED_PARTICIPANTS);
  });
});
