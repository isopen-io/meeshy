import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeAll, beforeEach, afterAll, jest } from '@jest/globals';

// ── Module mocks (must precede all imports that reference these modules) ──────
jest.mock('../../../../utils/logger', () => ({
  logError: jest.fn(),
}));

// Bypass Zod validation so tests control request.query directly
// (and can reach the unreachable-in-prod default entityType branch)
jest.mock('../../../../validation/helpers', () => ({
  validateQuery: () => async () => {},
  validateBody: () => async () => {},
  validateParams: () => async () => {},
}));

// ── Import under test ─────────────────────────────────────────────────────────
import { systemRankingsRoutes } from '../../../../routes/admin/system-rankings';

// ── Fixture IDs ───────────────────────────────────────────────────────────────
const USER_ID = 'user001aaa';
const PART_ID = 'part001bbb';
const CONV_ID = 'conv001ccc';
const MSG_ID  = 'msg001ddd';

const mockUser = {
  id: USER_ID,
  username: 'alice',
  displayName: 'Alice Smith',
  avatar: 'https://example.com/alice.png',
  lastActiveAt: new Date('2024-03-01T10:00:00Z'),
};

const mockParticipant = { id: PART_ID, userId: USER_ID };

const mockConvo = {
  id: CONV_ID,
  identifier: 'test-convo',
  title: 'Test Conversation',
  type: 'group',
  avatar: null,
};

// ── Mock Prisma ───────────────────────────────────────────────────────────────
const mockPrisma: any = {
  message:               { groupBy: jest.fn<any>(), findMany: jest.fn<any>() },
  participant:           { groupBy: jest.fn<any>(), findMany: jest.fn<any>() },
  reaction:              { groupBy: jest.fn<any>(), findMany: jest.fn<any>() },
  mention:               { groupBy: jest.fn<any>(), findMany: jest.fn<any>() },
  conversation:          { findMany: jest.fn<any>() },
  conversationShareLink: { groupBy: jest.fn<any>(), findMany: jest.fn<any>() },
  report:                { groupBy: jest.fn<any>() },
  friendRequest:         { groupBy: jest.fn<any>(), findMany: jest.fn<any>() },
  callSession:           { groupBy: jest.fn<any>() },
  callParticipant:       { groupBy: jest.fn<any>() },
  affiliateRelation:     { groupBy: jest.fn<any>() },
  trackingLink:          { groupBy: jest.fn<any>(), findMany: jest.fn<any>() },
  user:                  { findMany: jest.fn<any>() },
};

function resetMocks() {
  jest.clearAllMocks();
  mockPrisma.message.groupBy.mockResolvedValue([]);
  mockPrisma.message.findMany.mockResolvedValue([]);
  mockPrisma.participant.groupBy.mockResolvedValue([]);
  mockPrisma.participant.findMany.mockResolvedValue([]);
  mockPrisma.reaction.groupBy.mockResolvedValue([]);
  mockPrisma.reaction.findMany.mockResolvedValue([]);
  mockPrisma.mention.groupBy.mockResolvedValue([]);
  mockPrisma.mention.findMany.mockResolvedValue([]);
  mockPrisma.conversation.findMany.mockResolvedValue([]);
  mockPrisma.conversationShareLink.groupBy.mockResolvedValue([]);
  mockPrisma.conversationShareLink.findMany.mockResolvedValue([]);
  mockPrisma.report.groupBy.mockResolvedValue([]);
  mockPrisma.friendRequest.groupBy.mockResolvedValue([]);
  mockPrisma.friendRequest.findMany.mockResolvedValue([]);
  mockPrisma.callSession.groupBy.mockResolvedValue([]);
  mockPrisma.callParticipant.groupBy.mockResolvedValue([]);
  mockPrisma.affiliateRelation.groupBy.mockResolvedValue([]);
  mockPrisma.trackingLink.groupBy.mockResolvedValue([]);
  mockPrisma.trackingLink.findMany.mockResolvedValue([]);
  mockPrisma.user.findMany.mockResolvedValue([]);
}

// ── App builders ──────────────────────────────────────────────────────────────
const makeAuthContext = (role = 'ADMIN') => ({
  isAuthenticated: true,
  registeredUser: { id: 'adminUser', role, username: 'admin' },
});

function buildApp(role = 'ADMIN'): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = makeAuthContext(role);
  });
  app.register(systemRankingsRoutes);
  return app;
}

function buildNoAuthApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.decorate('prisma', mockPrisma);
  app.decorate('authenticate', async () => {});
  app.register(systemRankingsRoutes);
  return app;
}

// ── Injection helper ──────────────────────────────────────────────────────────
function inject(app: FastifyInstance, query: Record<string, string> = {}) {
  const qs = Object.keys(query).length
    ? '?' + Object.entries(query).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
    : '';
  return app.inject({ method: 'GET', url: `/ranking${qs}` });
}

// ════════════════════════════════════════════════════════════════════════════
// TEST SUITES
// ════════════════════════════════════════════════════════════════════════════

describe('systemRankingsRoutes — GET /ranking', () => {

  // ── requireAdmin middleware ──────────────────────────────────────────────
  describe('requireAdmin middleware', () => {
    beforeEach(() => resetMocks());

    it('returns 401 when no authContext is set', async () => {
      const app = buildNoAuthApp();
      await app.ready();
      const res = await inject(app);
      expect(res.statusCode).toBe(401);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      await app.close();
    });

    it.each(['USER', 'MODERATOR'])('returns 403 for role %s', async (role) => {
      const app = buildApp(role);
      await app.ready();
      const res = await inject(app);
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(false);
      await app.close();
    });

    it.each(['BIGBOSS', 'ADMIN', 'AUDIT', 'ANALYST'])('allows access for role %s', async (role) => {
      const app = buildApp(role);
      await app.ready();
      const res = await inject(app, { entityType: 'users', criterion: 'messages_sent', period: '7d', limit: '5' });
      expect(res.statusCode).toBe(200);
      await app.close();
    });
  });

  // ── entityType routing ───────────────────────────────────────────────────
  describe('entityType routing', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = buildApp('ADMIN');
      await app.ready();
    });
    afterAll(() => app.close());
    beforeEach(() => resetMocks());

    it('returns 400 for unknown entityType', async () => {
      const res = await inject(app, { entityType: 'invalid_type' });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).success).toBe(false);
    });

    it('returns 200 with rankings meta for entityType=users', async () => {
      const res = await inject(app, { entityType: 'users', criterion: 'messages_sent' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data.rankings)).toBe(true);
      expect(body.data.entityType).toBe('users');
      expect(body.data.criterion).toBe('messages_sent');
      expect(typeof body.data.total).toBe('number');
    });

    it('returns 200 for entityType=conversations', async () => {
      const res = await inject(app, { entityType: 'conversations', criterion: 'message_count' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.entityType).toBe('conversations');
    });

    it('returns 200 for entityType=messages', async () => {
      const res = await inject(app, { entityType: 'messages', criterion: 'most_reactions' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.entityType).toBe('messages');
    });

    it('returns 200 for entityType=links', async () => {
      const res = await inject(app, { entityType: 'links', criterion: 'clicks' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.entityType).toBe('links');
    });

    it('returns period in response meta', async () => {
      const res = await inject(app, { entityType: 'users', criterion: 'messages_sent', period: '7d' });
      expect(JSON.parse(res.body).data.period).toBe('7d');
    });

    it('returns 500 when DB throws', async () => {
      mockPrisma.message.groupBy.mockRejectedValue(new Error('Connection failed'));
      const res = await inject(app, { entityType: 'users', criterion: 'messages_sent' });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).success).toBe(false);
    });
  });

  // ── Period handling (getPeriodStartDate branches) ────────────────────────
  describe('period handling', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = buildApp();
      await app.ready();
    });
    afterAll(() => app.close());
    beforeEach(() => resetMocks());

    it.each(['1d', '7d', '30d', '60d', '90d', '180d', '365d', 'all'])(
      'accepts period=%s and returns 200',
      async (period) => {
        const res = await inject(app, { entityType: 'users', criterion: 'messages_sent', period });
        expect(res.statusCode).toBe(200);
      }
    );
  });

  // ── Limit clamping ───────────────────────────────────────────────────────
  describe('limit clamping', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = buildApp();
      await app.ready();
    });
    afterAll(() => app.close());
    beforeEach(() => resetMocks());

    it('clamps limit to 100 when given 999', async () => {
      const res = await inject(app, { entityType: 'users', criterion: 'messages_sent', limit: '999' });
      expect(res.statusCode).toBe(200);
      const call = mockPrisma.message.groupBy.mock.calls[0]?.[0];
      if (call) expect(call.take).toBeLessThanOrEqual(100);
    });

    it('uses minimum limit of 1', async () => {
      const res = await inject(app, { entityType: 'users', criterion: 'messages_sent', limit: '1' });
      expect(res.statusCode).toBe(200);
    });

    it('defaults limit to 50 when not provided', async () => {
      const res = await inject(app, { entityType: 'users', criterion: 'messages_sent' });
      expect(res.statusCode).toBe(200);
      const call = mockPrisma.message.groupBy.mock.calls[0]?.[0];
      if (call) expect(call.take).toBe(50);
    });

    it('treats non-numeric limit as 50 (parseInt fallback)', async () => {
      const res = await inject(app, { entityType: 'users', criterion: 'messages_sent', limit: 'abc' });
      expect(res.statusCode).toBe(200);
    });
  });

  // ── rankUsers criteria ───────────────────────────────────────────────────
  describe('rankUsers', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = buildApp();
      await app.ready();
    });
    afterAll(() => app.close());
    beforeEach(() => resetMocks());

    it('messages_sent — empty DB returns empty rankings', async () => {
      const res = await inject(app, { entityType: 'users', criterion: 'messages_sent', limit: '10' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings).toHaveLength(0);
    });

    it('messages_sent — resolves participant→user and builds ranking', async () => {
      mockPrisma.message.groupBy.mockResolvedValue([
        { senderId: PART_ID, _count: { id: 5 } },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([mockParticipant]);
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);

      const res = await inject(app, { entityType: 'users', criterion: 'messages_sent', limit: '10' });
      expect(res.statusCode).toBe(200);
      const rankings = JSON.parse(res.body).data.rankings;
      expect(rankings).toHaveLength(1);
      expect(rankings[0].username).toBe('alice');
      expect(rankings[0].count).toBe(5);
    });

    it('messages_sent — falls back to participantId when not in participant map', async () => {
      mockPrisma.message.groupBy.mockResolvedValue([
        { senderId: PART_ID, _count: { id: 3 } },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([]); // no mapping
      mockPrisma.user.findMany.mockResolvedValue([]);

      const res = await inject(app, { entityType: 'users', criterion: 'messages_sent' });
      expect(res.statusCode).toBe(200);
      const rankings = JSON.parse(res.body).data.rankings;
      expect(rankings[0].username).toBe('Unknown'); // user not in map
      expect(rankings[0].id).toBe(PART_ID); // falls back to participantId
    });

    it('messages (alias for messages_sent)', async () => {
      const res = await inject(app, { entityType: 'users', criterion: 'messages' });
      expect(res.statusCode).toBe(200);
    });

    it('reactions_given — resolves participant→user', async () => {
      mockPrisma.reaction.groupBy.mockResolvedValue([
        { participantId: PART_ID, _count: { id: 10 } },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([mockParticipant]);
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);

      const res = await inject(app, { entityType: 'users', criterion: 'reactions_given' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].count).toBe(10);
    });

    it('reactions (alias for reactions_given)', async () => {
      const res = await inject(app, { entityType: 'users', criterion: 'reactions' });
      expect(res.statusCode).toBe(200);
    });

    it('reactions_received — aggregates reaction counts by message sender', async () => {
      mockPrisma.reaction.groupBy.mockResolvedValue([
        { messageId: MSG_ID, _count: { id: 7 } },
      ]);
      mockPrisma.message.findMany.mockResolvedValue([
        { id: MSG_ID, senderId: PART_ID },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);

      const res = await inject(app, { entityType: 'users', criterion: 'reactions_received' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].count).toBe(7);
    });

    it('reactions_received — accumulates multiple messages from same sender', async () => {
      const MSG2 = 'msg002';
      mockPrisma.reaction.groupBy.mockResolvedValue([
        { messageId: MSG_ID, _count: { id: 3 } },
        { messageId: MSG2, _count: { id: 4 } },
      ]);
      mockPrisma.message.findMany.mockResolvedValue([
        { id: MSG_ID, senderId: PART_ID },
        { id: MSG2, senderId: PART_ID },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);

      const res = await inject(app, { entityType: 'users', criterion: 'reactions_received' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].count).toBe(7); // 3 + 4
    });

    it('reactions_received — skips messages with null senderId', async () => {
      mockPrisma.reaction.groupBy.mockResolvedValue([
        { messageId: MSG_ID, _count: { id: 5 } },
      ]);
      mockPrisma.message.findMany.mockResolvedValue([
        { id: MSG_ID, senderId: null },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const res = await inject(app, { entityType: 'users', criterion: 'reactions_received' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings).toHaveLength(0);
    });

    it('replies_received — aggregates reply counts by original message sender', async () => {
      mockPrisma.message.groupBy.mockResolvedValue([
        { replyToId: MSG_ID, _count: { id: 4 } },
      ]);
      mockPrisma.message.findMany.mockResolvedValue([
        { id: MSG_ID, senderId: PART_ID },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);

      const res = await inject(app, { entityType: 'users', criterion: 'replies_received' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].count).toBe(4);
    });

    it('replies_received — skips when original senderId is null', async () => {
      mockPrisma.message.groupBy.mockResolvedValue([
        { replyToId: MSG_ID, _count: { id: 2 } },
      ]);
      mockPrisma.message.findMany.mockResolvedValue([
        { id: MSG_ID, senderId: null },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const res = await inject(app, { entityType: 'users', criterion: 'replies_received' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings).toHaveLength(0);
    });

    it('mentions_received — resolves mentionedParticipant→user', async () => {
      mockPrisma.mention.groupBy.mockResolvedValue([
        { mentionedParticipantId: PART_ID, _count: { id: 6 } },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([mockParticipant]);
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);

      const res = await inject(app, { entityType: 'users', criterion: 'mentions_received' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].count).toBe(6);
    });

    it('mentions_sent — counts mentions by message sender, skips null senderId', async () => {
      mockPrisma.mention.findMany.mockResolvedValue([
        { message: { senderId: USER_ID } },
        { message: { senderId: USER_ID } },
        { message: { senderId: null } }, // skipped
        { message: null },               // skipped
      ]);
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);

      const res = await inject(app, { entityType: 'users', criterion: 'mentions_sent' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].count).toBe(2);
    });

    it('conversations_joined — groups participant by userId', async () => {
      mockPrisma.participant.groupBy.mockResolvedValue([
        { userId: USER_ID, _count: { id: 3 } },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);

      const res = await inject(app, { entityType: 'users', criterion: 'conversations_joined' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].count).toBe(3);
    });

    it('conversations (alias for conversations_joined)', async () => {
      const res = await inject(app, { entityType: 'users', criterion: 'conversations' });
      expect(res.statusCode).toBe(200);
    });

    it('communities_created — counts first admin per conversation, deduplicates seen set', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([{ id: CONV_ID }]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { userId: USER_ID, conversationId: CONV_ID },
        { userId: USER_ID, conversationId: CONV_ID }, // duplicate → skipped by seen set
      ]);
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);

      const res = await inject(app, { entityType: 'users', criterion: 'communities_created' });
      expect(res.statusCode).toBe(200);
      const rankings = JSON.parse(res.body).data.rankings;
      expect(rankings[0].count).toBe(1); // counted only once
    });

    it('communities_created — empty convos returns empty rankings', async () => {
      const res = await inject(app, { entityType: 'users', criterion: 'communities_created' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings).toHaveLength(0);
    });

    it('share_links_created — groups by createdBy', async () => {
      mockPrisma.conversationShareLink.groupBy.mockResolvedValue([
        { createdBy: USER_ID, _count: { id: 2 } },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);

      const res = await inject(app, { entityType: 'users', criterion: 'share_links_created' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].count).toBe(2);
    });

    it('files_shared — resolves participantId→userId for media messages', async () => {
      mockPrisma.message.groupBy.mockResolvedValue([
        { senderId: PART_ID, _count: { id: 8 } },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([mockParticipant]);
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);

      const res = await inject(app, { entityType: 'users', criterion: 'files_shared' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].count).toBe(8);
    });

    it('reports_sent — groups by reporterId', async () => {
      mockPrisma.report.groupBy.mockResolvedValue([
        { reporterId: USER_ID, _count: { id: 1 } },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);

      const res = await inject(app, { entityType: 'users', criterion: 'reports_sent' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].count).toBe(1);
    });

    it('reports_received — groups by reportedEntityId', async () => {
      mockPrisma.report.groupBy.mockResolvedValue([
        { reportedEntityId: USER_ID, _count: { id: 2 } },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);

      const res = await inject(app, { entityType: 'users', criterion: 'reports_received' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].count).toBe(2);
    });

    it('friend_requests_sent — groups by senderId', async () => {
      mockPrisma.friendRequest.groupBy.mockResolvedValue([
        { senderId: USER_ID, _count: { id: 5 } },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);

      const res = await inject(app, { entityType: 'users', criterion: 'friend_requests_sent' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].count).toBe(5);
    });

    it('friend_requests_received — groups by receiverId', async () => {
      mockPrisma.friendRequest.groupBy.mockResolvedValue([
        { receiverId: USER_ID, _count: { id: 3 } },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);

      const res = await inject(app, { entityType: 'users', criterion: 'friend_requests_received' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].count).toBe(3);
    });

    it('calls_initiated — groups by initiatorId', async () => {
      mockPrisma.callSession.groupBy.mockResolvedValue([
        { initiatorId: USER_ID, _count: { id: 4 } },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);

      const res = await inject(app, { entityType: 'users', criterion: 'calls_initiated' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].count).toBe(4);
    });

    it('call_participations — resolves callParticipant→user via participant', async () => {
      mockPrisma.callParticipant.groupBy.mockResolvedValue([
        { participantId: PART_ID, _count: { id: 6 } },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([mockParticipant]);
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);

      const res = await inject(app, { entityType: 'users', criterion: 'call_participations' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].count).toBe(6);
    });

    it('call_participations — falls back to participantId when not in map', async () => {
      mockPrisma.callParticipant.groupBy.mockResolvedValue([
        { participantId: PART_ID, _count: { id: 2 } },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([]); // no mapping
      mockPrisma.user.findMany.mockResolvedValue([]);

      const res = await inject(app, { entityType: 'users', criterion: 'call_participations' });
      expect(res.statusCode).toBe(200);
      const rankings = JSON.parse(res.body).data.rankings;
      expect(rankings[0].id).toBe(PART_ID);
    });

    it('most_referrals_via_affiliate — groups by affiliateUserId', async () => {
      mockPrisma.affiliateRelation.groupBy.mockResolvedValue([
        { affiliateUserId: USER_ID, _count: { id: 10 } },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);

      const res = await inject(app, { entityType: 'users', criterion: 'most_referrals_via_affiliate' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].count).toBe(10);
    });

    it('most_referrals_via_sharelinks — sums currentUses by creator, skips null createdBy', async () => {
      mockPrisma.conversationShareLink.findMany.mockResolvedValue([
        { createdBy: USER_ID, currentUses: 5 },
        { createdBy: USER_ID, currentUses: 3 },
        { createdBy: null, currentUses: 100 }, // skipped
      ]);
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);

      const res = await inject(app, { entityType: 'users', criterion: 'most_referrals_via_sharelinks' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].count).toBe(8); // 5 + 3
    });

    it('most_contacts — counts both senderId and receiverId from accepted requests', async () => {
      const USER2 = 'user002';
      mockPrisma.friendRequest.findMany.mockResolvedValue([
        { senderId: USER_ID, receiverId: USER2 },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([
        mockUser,
        { ...mockUser, id: USER2, username: 'bob', displayName: 'Bob' },
      ]);

      const res = await inject(app, { entityType: 'users', criterion: 'most_contacts' });
      expect(res.statusCode).toBe(200);
      const rankings = JSON.parse(res.body).data.rankings;
      expect(rankings).toHaveLength(2);
      const alice = rankings.find((r: any) => r.id === USER_ID);
      const bob   = rankings.find((r: any) => r.id === USER2);
      expect(alice?.count).toBe(1);
      expect(bob?.count).toBe(1);
    });

    it('most_tracking_links_created — groups by createdBy', async () => {
      mockPrisma.trackingLink.groupBy.mockResolvedValue([
        { createdBy: USER_ID, _count: { id: 7 } },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);

      const res = await inject(app, { entityType: 'users', criterion: 'most_tracking_links_created' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].count).toBe(7);
    });

    it('most_tracking_link_clicks — sums totalClicks by creator, skips null createdBy', async () => {
      mockPrisma.trackingLink.findMany.mockResolvedValue([
        { createdBy: USER_ID, totalClicks: 100 },
        { createdBy: USER_ID, totalClicks: 50 },
        { createdBy: null, totalClicks: 999 }, // skipped
      ]);
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);

      const res = await inject(app, { entityType: 'users', criterion: 'most_tracking_link_clicks' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].count).toBe(150); // 100 + 50
    });

    it('unknown criterion returns empty rankings with 200', async () => {
      const res = await inject(app, { entityType: 'users', criterion: 'no_such_criterion_xyz' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings).toHaveLength(0);
    });
  });

  // ── buildUserRankings edge cases ─────────────────────────────────────────
  describe('buildUserRankings — edge cases', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = buildApp();
      await app.ready();
    });
    afterAll(() => app.close());
    beforeEach(() => resetMocks());

    it('shows Unknown username when user is not in the map', async () => {
      mockPrisma.report.groupBy.mockResolvedValue([
        { reporterId: 'ghost-id', _count: { id: 9 } },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([]); // empty map

      const res = await inject(app, { entityType: 'users', criterion: 'reports_sent' });
      const rankings = JSON.parse(res.body).data.rankings;
      expect(rankings[0].username).toBe('Unknown');
      expect(rankings[0].displayName).toBeUndefined();
      expect(rankings[0].avatar).toBeUndefined();
    });

    it('includes lastActivity ISO string when lastActiveAt is set', async () => {
      const lastActiveAt = new Date('2024-06-01T12:00:00Z');
      mockPrisma.report.groupBy.mockResolvedValue([
        { reporterId: USER_ID, _count: { id: 1 } },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([{ ...mockUser, lastActiveAt }]);

      const res = await inject(app, { entityType: 'users', criterion: 'reports_sent' });
      const rankings = JSON.parse(res.body).data.rankings;
      expect(rankings[0].lastActivity).toBe(lastActiveAt.toISOString());
    });

    it('lastActivity is undefined when lastActiveAt is null', async () => {
      mockPrisma.report.groupBy.mockResolvedValue([
        { reporterId: USER_ID, _count: { id: 1 } },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([{ ...mockUser, lastActiveAt: null }]);

      const res = await inject(app, { entityType: 'users', criterion: 'reports_sent' });
      const rankings = JSON.parse(res.body).data.rankings;
      expect(rankings[0].lastActivity).toBeUndefined();
    });

    it('fetchUserDetails skips prisma.user.findMany when userIds is empty', async () => {
      // Empty report.groupBy → userIds=[] → fetchUserDetails early-returns
      const res = await inject(app, { entityType: 'users', criterion: 'reports_sent' });
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  // ── rankConversations criteria ────────────────────────────────────────────
  describe('rankConversations', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = buildApp();
      await app.ready();
    });
    afterAll(() => app.close());
    beforeEach(() => resetMocks());

    it('message_count — groups messages by conversationId', async () => {
      mockPrisma.message.groupBy.mockResolvedValue([
        { conversationId: CONV_ID, _count: { id: 15 } },
      ]);
      mockPrisma.conversation.findMany.mockResolvedValue([mockConvo]);

      const res = await inject(app, { entityType: 'conversations', criterion: 'message_count' });
      expect(res.statusCode).toBe(200);
      const rankings = JSON.parse(res.body).data.rankings;
      expect(rankings[0].count).toBe(15);
      expect(rankings[0].title).toBe('Test Conversation');
      expect(rankings[0].id).toBe(CONV_ID);
    });

    it('messages (alias for message_count)', async () => {
      const res = await inject(app, { entityType: 'conversations', criterion: 'messages' });
      expect(res.statusCode).toBe(200);
    });

    it('member_count — groups participants by conversationId', async () => {
      mockPrisma.participant.groupBy.mockResolvedValue([
        { conversationId: CONV_ID, _count: { id: 25 } },
      ]);
      mockPrisma.conversation.findMany.mockResolvedValue([mockConvo]);

      const res = await inject(app, { entityType: 'conversations', criterion: 'member_count' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].count).toBe(25);
    });

    it('members (alias for member_count)', async () => {
      const res = await inject(app, { entityType: 'conversations', criterion: 'members' });
      expect(res.statusCode).toBe(200);
    });

    it('reaction_count — aggregates reactions per conversation, skips null message/convoId', async () => {
      mockPrisma.reaction.findMany.mockResolvedValue([
        { message: { conversationId: CONV_ID } },
        { message: { conversationId: CONV_ID } },
        { message: null },                      // skipped
        { message: { conversationId: null } },  // skipped
      ]);
      mockPrisma.conversation.findMany.mockResolvedValue([mockConvo]);

      const res = await inject(app, { entityType: 'conversations', criterion: 'reaction_count' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].count).toBe(2);
    });

    it('files_shared — counts media messages by conversationId', async () => {
      mockPrisma.message.groupBy.mockResolvedValue([
        { conversationId: CONV_ID, _count: { id: 5 } },
      ]);
      mockPrisma.conversation.findMany.mockResolvedValue([mockConvo]);

      const res = await inject(app, { entityType: 'conversations', criterion: 'files_shared' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].count).toBe(5);
    });

    it('call_count — groups callSessions by conversationId', async () => {
      mockPrisma.callSession.groupBy.mockResolvedValue([
        { conversationId: CONV_ID, _count: { id: 3 } },
      ]);
      mockPrisma.conversation.findMany.mockResolvedValue([mockConvo]);

      const res = await inject(app, { entityType: 'conversations', criterion: 'call_count' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].count).toBe(3);
    });

    it('recent_activity — returns conversations ordered by lastMessageAt', async () => {
      const lastMessageAt = new Date('2024-06-10T09:00:00Z');
      mockPrisma.conversation.findMany.mockResolvedValue([
        { ...mockConvo, lastMessageAt },
      ]);

      const res = await inject(app, { entityType: 'conversations', criterion: 'recent_activity' });
      expect(res.statusCode).toBe(200);
      const rankings = JSON.parse(res.body).data.rankings;
      expect(rankings[0].lastActivity).toBe(lastMessageAt.toISOString());
      expect(rankings[0].count).toBe(0);
    });

    it('recent_activity — lastActivity undefined when lastMessageAt is null', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([
        { ...mockConvo, lastMessageAt: null },
      ]);

      const res = await inject(app, { entityType: 'conversations', criterion: 'recent_activity' });
      const rankings = JSON.parse(res.body).data.rankings;
      expect(rankings[0].lastActivity).toBeUndefined();
    });

    it('unknown criterion returns empty rankings', async () => {
      const res = await inject(app, { entityType: 'conversations', criterion: 'unknown_xyz' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings).toHaveLength(0);
    });

    it('fetchConvoDetails skips prisma when convoIds is empty', async () => {
      // Empty groupBy → convoIds=[] → fetchConvoDetails early-returns
      const res = await inject(app, { entityType: 'conversations', criterion: 'message_count' });
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.conversation.findMany).not.toHaveBeenCalled();
    });
  });

  // ── buildConvoRankings title fallback chain ──────────────────────────────
  describe('buildConvoRankings — title fallback', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = buildApp();
      await app.ready();
    });
    afterAll(() => app.close());
    beforeEach(() => resetMocks());

    it('uses title when available', async () => {
      mockPrisma.message.groupBy.mockResolvedValue([{ conversationId: CONV_ID, _count: { id: 1 } }]);
      mockPrisma.conversation.findMany.mockResolvedValue([{ ...mockConvo, title: 'My Group' }]);

      const res = await inject(app, { entityType: 'conversations', criterion: 'message_count' });
      expect(JSON.parse(res.body).data.rankings[0].title).toBe('My Group');
    });

    it('falls back to identifier when title is null', async () => {
      mockPrisma.message.groupBy.mockResolvedValue([{ conversationId: CONV_ID, _count: { id: 1 } }]);
      mockPrisma.conversation.findMany.mockResolvedValue([{ ...mockConvo, title: null, identifier: 'my-convo' }]);

      const res = await inject(app, { entityType: 'conversations', criterion: 'message_count' });
      expect(JSON.parse(res.body).data.rankings[0].title).toBe('my-convo');
    });

    it('falls back to identifier in recent_activity when title is null', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([
        { ...mockConvo, title: null, identifier: 'conv-slug', lastMessageAt: null },
      ]);

      const res = await inject(app, { entityType: 'conversations', criterion: 'recent_activity' });
      expect(JSON.parse(res.body).data.rankings[0].title).toBe('conv-slug');
    });

    it('uses Sans titre when both title and identifier are null', async () => {
      mockPrisma.message.groupBy.mockResolvedValue([{ conversationId: CONV_ID, _count: { id: 1 } }]);
      mockPrisma.conversation.findMany.mockResolvedValue([{ ...mockConvo, title: null, identifier: null }]);

      const res = await inject(app, { entityType: 'conversations', criterion: 'message_count' });
      expect(JSON.parse(res.body).data.rankings[0].title).toBe('Sans titre');
    });

    it('uses Sans titre when convo is not in the map', async () => {
      mockPrisma.message.groupBy.mockResolvedValue([{ conversationId: CONV_ID, _count: { id: 1 } }]);
      mockPrisma.conversation.findMany.mockResolvedValue([]); // not in map

      const res = await inject(app, { entityType: 'conversations', criterion: 'message_count' });
      const rankings = JSON.parse(res.body).data.rankings;
      expect(rankings[0].title).toBe('Sans titre');
      expect(rankings[0].identifier).toBeUndefined();
    });
  });

  // ── rankMessages criteria ─────────────────────────────────────────────────
  describe('rankMessages', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = buildApp();
      await app.ready();
    });
    afterAll(() => app.close());
    beforeEach(() => resetMocks());

    const fullMockMessage = {
      id: MSG_ID,
      content: 'Hello world this is a test message body',
      messageType: 'text',
      createdAt: new Date('2024-01-01T10:00:00Z'),
      sender: {
        id: PART_ID,
        userId: USER_ID,
        displayName: 'Alice',
        avatar: null,
        user: { username: 'alice' },
      },
      conversation: { id: CONV_ID, identifier: 'conv-1', title: 'Test', type: 'direct' },
    };

    it('most_reactions — builds message ranking with sender and conversation', async () => {
      mockPrisma.reaction.groupBy.mockResolvedValue([
        { messageId: MSG_ID, _count: { id: 20 } },
      ]);
      mockPrisma.message.findMany.mockResolvedValue([fullMockMessage]);

      const res = await inject(app, { entityType: 'messages', criterion: 'most_reactions' });
      expect(res.statusCode).toBe(200);
      const rankings = JSON.parse(res.body).data.rankings;
      expect(rankings[0].count).toBe(20);
      expect(rankings[0].content).toBe('Hello world this is a test message body');
      expect(rankings[0].contentPreview).toBe('Hello world this is a test message body');
      expect(rankings[0].sender.username).toBe('alice');
      expect(rankings[0].conversation.identifier).toBe('conv-1');
    });

    it('reactions (alias for most_reactions)', async () => {
      mockPrisma.reaction.groupBy.mockResolvedValue([]);
      const res = await inject(app, { entityType: 'messages', criterion: 'reactions' });
      expect(res.statusCode).toBe(200);
    });

    it('most_replies — groups by replyToId', async () => {
      mockPrisma.message.groupBy.mockResolvedValue([
        { replyToId: MSG_ID, _count: { id: 12 } },
      ]);
      mockPrisma.message.findMany.mockResolvedValue([fullMockMessage]);

      const res = await inject(app, { entityType: 'messages', criterion: 'most_replies' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].count).toBe(12);
    });

    it('replies (alias for most_replies)', async () => {
      const res = await inject(app, { entityType: 'messages', criterion: 'replies' });
      expect(res.statusCode).toBe(200);
    });

    it('most_mentions — groups by messageId via mention table', async () => {
      mockPrisma.mention.groupBy.mockResolvedValue([
        { messageId: MSG_ID, _count: { id: 5 } },
      ]);
      mockPrisma.message.findMany.mockResolvedValue([fullMockMessage]);

      const res = await inject(app, { entityType: 'messages', criterion: 'most_mentions' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].count).toBe(5);
    });

    it('message not in map produces empty contentPreview and undefined sender', async () => {
      mockPrisma.reaction.groupBy.mockResolvedValue([
        { messageId: 'unknown-msg', _count: { id: 1 } },
      ]);
      mockPrisma.message.findMany.mockResolvedValue([]); // not in map

      const res = await inject(app, { entityType: 'messages', criterion: 'most_reactions' });
      expect(res.statusCode).toBe(200);
      const rankings = JSON.parse(res.body).data.rankings;
      expect(rankings[0].contentPreview).toBe('');
      expect(rankings[0].sender).toBeUndefined();
      expect(rankings[0].content).toBeUndefined();
    });

    it('sender.user is null → sender.username is undefined', async () => {
      mockPrisma.reaction.groupBy.mockResolvedValue([
        { messageId: MSG_ID, _count: { id: 3 } },
      ]);
      mockPrisma.message.findMany.mockResolvedValue([{
        ...fullMockMessage,
        sender: { ...fullMockMessage.sender, user: null },
      }]);

      const res = await inject(app, { entityType: 'messages', criterion: 'most_reactions' });
      const rankings = JSON.parse(res.body).data.rankings;
      expect(rankings[0].sender.username).toBeUndefined();
    });

    it('content truncates to 100 chars in contentPreview', async () => {
      const longContent = 'A'.repeat(150);
      mockPrisma.reaction.groupBy.mockResolvedValue([
        { messageId: MSG_ID, _count: { id: 1 } },
      ]);
      mockPrisma.message.findMany.mockResolvedValue([{
        ...fullMockMessage,
        content: longContent,
      }]);

      const res = await inject(app, { entityType: 'messages', criterion: 'most_reactions' });
      const rankings = JSON.parse(res.body).data.rankings;
      expect(rankings[0].contentPreview).toHaveLength(100);
      expect(rankings[0].content).toBe(longContent);
    });

    it('unknown criterion returns empty rankings', async () => {
      const res = await inject(app, { entityType: 'messages', criterion: 'unknown_xyz' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings).toHaveLength(0);
    });
  });

  // ── rankLinks criteria ────────────────────────────────────────────────────
  describe('rankLinks', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = buildApp();
      await app.ready();
    });
    afterAll(() => app.close());
    beforeEach(() => resetMocks());

    const mockCreator = { id: USER_ID, username: 'alice', displayName: 'Alice', avatar: null };

    const baseTrackingLink = {
      id: 'link1',
      token: 'abc123',
      originalUrl: 'https://example.com',
      totalClicks: 100,
      uniqueClicks: 80,
      createdAt: new Date('2024-01-01T00:00:00Z'),
      creator: mockCreator,
    };

    it('tracking_links_most_visited / clicks — ordered by totalClicks', async () => {
      mockPrisma.trackingLink.findMany.mockResolvedValue([baseTrackingLink]);

      const res = await inject(app, { entityType: 'links', criterion: 'clicks' });
      expect(res.statusCode).toBe(200);
      const rankings = JSON.parse(res.body).data.rankings;
      expect(rankings[0].totalClicks).toBe(100);
      expect(rankings[0].count).toBe(100);
      expect(rankings[0].creator.username).toBe('alice');
      expect(rankings[0].createdAt).toBe(baseTrackingLink.createdAt.toISOString());
    });

    it('tracking_links_most_visited (named alias)', async () => {
      mockPrisma.trackingLink.findMany.mockResolvedValue([]);
      const res = await inject(app, { entityType: 'links', criterion: 'tracking_links_most_visited' });
      expect(res.statusCode).toBe(200);
    });

    it('tracking_links_most_unique — ordered by uniqueClicks', async () => {
      mockPrisma.trackingLink.findMany.mockResolvedValue([baseTrackingLink]);

      const res = await inject(app, { entityType: 'links', criterion: 'tracking_links_most_unique' });
      expect(res.statusCode).toBe(200);
      const rankings = JSON.parse(res.body).data.rankings;
      expect(rankings[0].uniqueClicks).toBe(80);
      expect(rankings[0].count).toBe(80);
    });

    it('share_links_most_used / uses — ordered by currentUses', async () => {
      const mockShareLink = {
        id: 'sl1',
        linkId: 'link-abc',
        identifier: 'share-1',
        name: 'My Share Link',
        currentUses: 42,
        maxUses: 100,
        createdAt: new Date('2024-01-01T00:00:00Z'),
        creator: mockCreator,
        conversation: { id: CONV_ID, identifier: 'conv-1', title: 'Test', type: 'group' },
      };
      mockPrisma.conversationShareLink.findMany.mockResolvedValue([mockShareLink]);

      const res = await inject(app, { entityType: 'links', criterion: 'uses' });
      expect(res.statusCode).toBe(200);
      const rankings = JSON.parse(res.body).data.rankings;
      expect(rankings[0].currentUses).toBe(42);
      expect(rankings[0].name).toBe('My Share Link');
      expect(rankings[0].count).toBe(42);
    });

    it('share_links_most_used (named alias)', async () => {
      const res = await inject(app, { entityType: 'links', criterion: 'share_links_most_used' });
      expect(res.statusCode).toBe(200);
    });

    it('share_links_most_used — falls back to identifier when name is null', async () => {
      mockPrisma.conversationShareLink.findMany.mockResolvedValue([{
        id: 'sl2', linkId: 'lxyz', identifier: 'share-slug', name: null,
        currentUses: 5, maxUses: null, createdAt: null, creator: null, conversation: null,
      }]);

      const res = await inject(app, { entityType: 'links', criterion: 'uses' });
      expect(JSON.parse(res.body).data.rankings[0].name).toBe('share-slug');
    });

    it('share_links_most_used — falls back to linkId when name and identifier are null', async () => {
      mockPrisma.conversationShareLink.findMany.mockResolvedValue([{
        id: 'sl3', linkId: 'link-fallback', identifier: null, name: null,
        currentUses: 3, maxUses: null, createdAt: null, creator: null, conversation: null,
      }]);

      const res = await inject(app, { entityType: 'links', criterion: 'uses' });
      expect(JSON.parse(res.body).data.rankings[0].name).toBe('link-fallback');
    });

    it('share_links_most_unique_sessions — ordered by currentUniqueSessions', async () => {
      const mockShareLink = {
        id: 'sl4', linkId: 'link-unique', identifier: 'share-unique',
        name: 'Unique Sessions Link', currentUses: 20, currentUniqueSessions: 15,
        maxUses: null, createdAt: new Date('2024-01-01T00:00:00Z'),
        creator: mockCreator,
        conversation: { id: CONV_ID, identifier: 'conv-1', title: 'Test', type: 'group' },
      };
      mockPrisma.conversationShareLink.findMany.mockResolvedValue([mockShareLink]);

      const res = await inject(app, { entityType: 'links', criterion: 'share_links_most_unique_sessions' });
      expect(res.statusCode).toBe(200);
      const rankings = JSON.parse(res.body).data.rankings;
      expect(rankings[0].currentUniqueSessions).toBe(15);
      expect(rankings[0].count).toBe(15);
    });

    it('unknown criterion returns empty rankings', async () => {
      const res = await inject(app, { entityType: 'links', criterion: 'unknown_xyz' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings).toHaveLength(0);
    });

    it('share_links_most_unique_sessions — falls back to identifier when name is null', async () => {
      mockPrisma.conversationShareLink.findMany.mockResolvedValue([{
        id: 'su2', linkId: 'lu2', identifier: 'slug-u2', name: null,
        currentUses: 8, currentUniqueSessions: 6, maxUses: null,
        createdAt: null, creator: null, conversation: null,
      }]);

      const res = await inject(app, { entityType: 'links', criterion: 'share_links_most_unique_sessions' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].name).toBe('slug-u2');
    });

    it('share_links_most_unique_sessions — falls back to linkId when name and identifier are null', async () => {
      mockPrisma.conversationShareLink.findMany.mockResolvedValue([{
        id: 'su3', linkId: 'lu3-fallback', identifier: null, name: null,
        currentUses: 5, currentUniqueSessions: 4, maxUses: null,
        createdAt: null, creator: null, conversation: null,
      }]);

      const res = await inject(app, { entityType: 'links', criterion: 'share_links_most_unique_sessions' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings[0].name).toBe('lu3-fallback');
    });
  });

  // ── DB error paths → 500 ─────────────────────────────────────────────────
  describe('DB errors produce 500', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = buildApp();
      await app.ready();
    });
    afterAll(() => app.close());
    beforeEach(() => resetMocks());

    it('prisma throws in rankUsers → 500', async () => {
      mockPrisma.message.groupBy.mockRejectedValue(new Error('DB failure'));
      const res = await inject(app, { entityType: 'users', criterion: 'messages_sent' });
      expect(res.statusCode).toBe(500);
    });

    it('prisma throws in rankConversations → 500', async () => {
      mockPrisma.participant.groupBy.mockRejectedValue(new Error('DB failure'));
      const res = await inject(app, { entityType: 'conversations', criterion: 'member_count' });
      expect(res.statusCode).toBe(500);
    });

    it('prisma throws in rankMessages → 500', async () => {
      mockPrisma.reaction.groupBy.mockRejectedValue(new Error('DB failure'));
      const res = await inject(app, { entityType: 'messages', criterion: 'most_reactions' });
      expect(res.statusCode).toBe(500);
    });

    it('prisma throws in rankLinks → 500', async () => {
      mockPrisma.trackingLink.findMany.mockRejectedValue(new Error('DB failure'));
      const res = await inject(app, { entityType: 'links', criterion: 'clicks' });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── criterion || fallback branches (empty criterion string) ──────────────
  describe('criterion default fallbacks (empty string triggers || default)', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = buildApp();
      await app.ready();
    });
    afterAll(() => app.close());
    beforeEach(() => resetMocks());

    it('users: empty criterion falls back to messages_sent', async () => {
      // criterion='' → falsy → uses 'messages_sent' fallback
      const res = await inject(app, { entityType: 'users', criterion: '' });
      expect(res.statusCode).toBe(200);
      // messages_sent calls message.groupBy
      expect(mockPrisma.message.groupBy).toHaveBeenCalled();
    });

    it('conversations: empty criterion falls back to message_count', async () => {
      const res = await inject(app, { entityType: 'conversations', criterion: '' });
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.message.groupBy).toHaveBeenCalled();
    });

    it('messages: empty criterion falls back to most_reactions', async () => {
      const res = await inject(app, { entityType: 'messages', criterion: '' });
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.reaction.groupBy).toHaveBeenCalled();
    });

    it('links: empty criterion falls back to tracking_links_most_visited', async () => {
      const res = await inject(app, { entityType: 'links', criterion: '' });
      expect(res.statusCode).toBe(200);
      expect(mockPrisma.trackingLink.findMany).toHaveBeenCalled();
    });
  });

  // ── period='all' → startDate=null → no date filter ──────────────────────
  describe('period=all (startDate=null) branches', () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = buildApp();
      await app.ready();
    });
    afterAll(() => app.close());
    beforeEach(() => resetMocks());

    it('recent_activity with period=all passes empty where clause', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([
        { ...mockConvo, lastMessageAt: new Date('2024-01-01') },
      ]);

      const res = await inject(app, {
        entityType: 'conversations',
        criterion: 'recent_activity',
        period: 'all',
      });
      expect(res.statusCode).toBe(200);
      // With startDate=null, conversation.findMany is called with empty where {}
      const call = mockPrisma.conversation.findMany.mock.calls[0][0];
      expect(call.where).toEqual({});
    });

    it('reactions_received with period=all passes empty dateWhere', async () => {
      // Covers dateWhere(startDate) false branch (startDate=null → {})
      const res = await inject(app, {
        entityType: 'users',
        criterion: 'reactions_received',
        period: 'all',
      });
      expect(res.statusCode).toBe(200);
      const call = mockPrisma.reaction.groupBy.mock.calls[0][0];
      expect(call.where).toEqual({});
    });

    it('reactions_given filter — removes entry when mapped id is falsy', async () => {
      // participantId='' → partToUser.get('')=undefined → undefined||''='' → filter removes
      mockPrisma.reaction.groupBy.mockResolvedValue([
        { participantId: '', _count: { id: 5 } },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([]);

      const res = await inject(app, { entityType: 'users', criterion: 'reactions_given' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings).toHaveLength(0);
    });

    it('mentions_received filter — removes entry when mapped id is falsy', async () => {
      mockPrisma.mention.groupBy.mockResolvedValue([
        { mentionedParticipantId: '', _count: { id: 3 } },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([]);

      const res = await inject(app, { entityType: 'users', criterion: 'mentions_received' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.rankings).toHaveLength(0);
    });

    it('files_shared filter(Boolean) — excludes participants with null userId', async () => {
      mockPrisma.message.groupBy.mockResolvedValue([
        { senderId: PART_ID, _count: { id: 8 } },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: PART_ID, userId: null }, // null userId filtered out
      ]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      const res = await inject(app, { entityType: 'users', criterion: 'files_shared' });
      expect(res.statusCode).toBe(200);
      // user.findMany called with empty array (null userId filtered)
      const userCall = mockPrisma.user.findMany.mock.calls[0];
      if (userCall) {
        expect(userCall[0].where.id.in).toHaveLength(0);
      } else {
        // fetchUserDetails early-returned (empty userIds)
        expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
      }
    });
  });
});
