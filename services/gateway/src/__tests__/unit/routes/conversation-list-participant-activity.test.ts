/**
 * #9071 — la liste des conversations sert, au niveau du participant, l'activité
 * du COMPTE et jamais la date de la ligne `Participant` (son entrée dans la
 * conversation). La paire `isOnline` / `lastActiveAt` vient d'UNE source.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

const CONV_ID = '507f1f77bcf86cd799439b11';
const VIEWER_ID = '507f1f77bcf86cd799439b22';
const PEER_ID = '507f1f77bcf86cd799439b33';
const VIEWER_PARTICIPANT_ID = '507f1f77bcf86cd799439b44';
const PEER_PARTICIPANT_ID = '507f1f77bcf86cd799439b55';

jest.mock('../../../services/messaging/messageRequests', () => ({
  ...jest.requireActual<object>('../../../services/messaging/messageRequests'),
  decideOpenings: jest.fn(async () => new Map()),
  decideDirectOpening: jest.fn(async () => ({ kind: 'direct' })),
}));

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: async (_viewer: unknown, ids: readonly string[]) =>
      new Map(ids.map((id) => [id, { showOnline: true, showLastSeenTimestamp: true }])),
    resolveForTarget: async () => ({ showOnline: true, showLastSeenTimestamp: true }),
    acceptedFriendIds: async () => new Set([PEER_ID]),
  }),
}));

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: async () => CONV_ID,
  invalidateConversationIdCache: () => undefined,
}));

jest.mock('../../../routes/conversations/utils/access-control', () =>
  (jest.requireActual('../../helpers/acces-conversation-double') as any).doubleAccesConversation(
    jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>,
    async () => true,
  ));

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: class {
    getUnreadCountsForUser() { return Promise.resolve(new Map()); }
    getUnreadCount() { return Promise.resolve(0); }
  },
}));

import { participantActivity } from '../../../routes/conversations/participant-activity';
import { registerConversationListRoute } from '../../../routes/conversations/core-list';

const entree = new Date('2026-10-01T17:32:40.000Z');
const activiteCompte = new Date('2026-10-02T07:58:00.000Z');

const inscrit = (surcharge: Record<string, unknown> = {}) => ({
  userId: 'u1',
  isOnline: false,
  lastActiveAt: entree,
  user: { isOnline: true, lastActiveAt: activiteCompte },
  ...surcharge,
});

describe('participantActivity — la paire de présence d’un participant de la liste', () => {
  it('un inscrit sert la dernière activité de son COMPTE, pas la date de sa ligne participant', () => {
    expect(participantActivity(inscrit())).toEqual({ isOnline: true, lastActiveAt: activiteCompte });
  });

  it('un inscrit dont le compte n’a aucune activité connue sert null, jamais la date d’entrée', () => {
    expect(participantActivity(inscrit({ user: { isOnline: null, lastActiveAt: null } }))).toEqual({
      isOnline: null,
      lastActiveAt: null,
    });
  });

  it('un inscrit dont le compte n’est pas chargé ne fabrique rien', () => {
    expect(participantActivity(inscrit({ user: null }))).toEqual({ isOnline: null, lastActiveAt: null });
  });

  it('un participant sans compte garde l’activité de sa session, portée par sa ligne', () => {
    expect(
      participantActivity({ userId: null, isOnline: true, lastActiveAt: entree, user: null }),
    ).toEqual({ isOnline: true, lastActiveAt: entree });
  });
});

type Handler = (request: unknown, reply: unknown) => Promise<unknown>;

const servedList = async () => {
  const routes = new Map<string, Handler>();
  const on = (method: string) => (path: string, _options: unknown, handler: Handler) => {
    routes.set(`${method} ${path}`, handler);
  };
  const fastify = {
    get: on('GET'), post: on('POST'), put: on('PUT'), patch: on('PATCH'), delete: on('DELETE'),
    notificationService: null,
    mentionService: null,
    presenceChecker: undefined,
  };
  const participantRow = (id: string, userId: string, name: string) => ({
    id, userId, conversationId: CONV_ID, type: 'user', displayName: name, avatar: null, role: 'member',
    language: 'fr', nickname: null, joinedAt: entree, isActive: true, isOnline: false, lastActiveAt: entree,
    user: { id: userId, username: name, displayName: name, firstName: name, lastName: null, avatar: null, isOnline: true, lastActiveAt: activiteCompte },
  });
  const row = {
    id: CONV_ID, title: null, type: 'direct', identifier: 'conv-9071', isActive: true,
    createdAt: entree, updatedAt: entree, lastMessageAt: entree, banner: null, avatar: null, communityId: null,
    isAnnouncementChannel: false, _count: { participants: 2 }, userPreferences: [],
    participants: [participantRow(VIEWER_PARTICIPANT_ID, VIEWER_ID, 'alice'), participantRow(PEER_PARTICIPANT_ID, PEER_ID, 'bob')],
    messages: [],
  };
  const prisma: any = {
    conversation: { findMany: jest.fn<any>().mockResolvedValue([row]), count: jest.fn<any>().mockResolvedValue(1) },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversationReadCursor: { findMany: jest.fn<any>().mockResolvedValue([]) },
    message: { findFirst: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]), count: jest.fn<any>().mockResolvedValue(0) },
    user: { findMany: jest.fn<any>().mockResolvedValue([]), findUnique: jest.fn<any>().mockResolvedValue(null) },
    agentConversationSummary: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    agentUserRole: { findMany: jest.fn<any>().mockResolvedValue([]) },
    agentAnalysisSnapshot: { findMany: jest.fn<any>().mockResolvedValue([]) },
    $transaction: jest.fn((ops: any) => Promise.all(ops)),
  };
  registerConversationListRoute(fastify as never, prisma, jest.fn());
  const reply: any = { body: undefined, statusCode: 200 };
  reply.status = (code: number) => { reply.statusCode = code; return reply; };
  reply.code = reply.status;
  reply.header = () => reply;
  reply.send = (body: unknown) => { reply.body = body; return reply; };
  await routes.get('GET /conversations')!({
    authContext: {
      type: 'user', isAuthenticated: true, isAnonymous: false, userId: VIEWER_ID,
      registeredUser: { id: VIEWER_ID, role: 'USER' }, sessionToken: null,
    },
    params: {}, query: {}, body: {}, headers: {},
  }, reply);
  expect(reply.statusCode).toBe(200);
  return (reply.body as { data: any[] }).data[0];
};

describe('GET /conversations — le participant servi porte l’activité de son compte', () => {
  it('un pair en ligne sert, au niveau participant, le lastActiveAt et l’isOnline de son COMPTE', async () => {
    const conversation = await servedList();
    const peer = conversation.participants.find((p: any) => p.userId === PEER_ID);

    expect(peer.isOnline).toBe(true);
    expect(peer.lastActiveAt).toEqual(activiteCompte);
    expect(peer.lastActiveAt).toEqual(peer.user.lastActiveAt);
  });
});
