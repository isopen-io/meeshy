/**
 * MessageReadStatusService Comprehensive Unit Tests
 *
 * Tests the new granular status tracking system:
 * - ConversationReadCursor: Fast unread count queries
 * - MessageStatusEntry: Per-message per-user status
 * - AttachmentStatusEntry: Per-attachment per-user status (audio, video, image, download)
 * - Computed fields: deliveredToAllAt, readByAllAt, viewedByAllAt, etc.
 *
 * Coverage target: > 80%
 *
 * @jest-environment node
 */

import { MessageReadStatusService, buildCursorFreshnessGuard } from '../../../services/MessageReadStatusService';
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';

// Mock the NotificationService import (used dynamically in markMessagesAsRead)
jest.mock('../../../services/notifications/NotificationService', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    markConversationNotificationsAsRead: jest.fn().mockResolvedValue(0)
  }))
}));

// Mock Prisma client with new models
const mockPrisma: any = {
  conversationReadCursor: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
    deleteMany: jest.fn()
  },
  messageStatusEntry: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    createMany: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
    deleteMany: jest.fn()
  },
  attachmentStatusEntry: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    upsert: jest.fn(),
    count: jest.fn()
  },
  message: {
    count: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn()
  },
  userPreference: {
    findMany: jest.fn()
  },
  userPreferences: {
    findMany: jest.fn()
  },
  messageAttachment: {
    findUnique: jest.fn(),
    update: jest.fn()
  },
  participant: {
    count: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn()
  },
  // Mock $transaction to pass the mock prisma to the callback
  $transaction: jest.fn().mockImplementation(async (callback: (tx: any) => Promise<any>) => {
    // Create a transaction mock that proxies to the main mock (includes findMany)
    return callback(mockPrisma);
  })
};

jest.mock('@meeshy/shared/prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma)
}));

// Mock console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

describe('MessageReadStatusService', () => {
  let service: MessageReadStatusService;

  // Test data
  const testParticipantId = '507f1f77bcf86cd799439011';
  const testParticipantId2 = '507f1f77bcf86cd799439015';
  const testConversationId = '507f1f77bcf86cd799439012';
  const testMessageId = '507f1f77bcf86cd799439013';
  const testMessageId2 = '507f1f77bcf86cd799439014';
  const testAttachmentId = '507f1f77bcf86cd799439016';

  beforeEach(() => {
    jest.clearAllMocks();

    // Clear the static dedup cache to ensure tests are isolated
    (MessageReadStatusService as any).recentActionCache.clear();
    // Idem pour le cache d'opt-out « accusés de lecture » : sa portée est le
    // processus, une entrée laissée par un test fausserait le suivant.
    clearPrivacyPreferencesCache();

    // `clearAllMocks` efface les APPELS, pas les implémentations : un
    // `mockRejectedValue` posé par un test survit à tous les suivants. Sans
    // conséquence tant que seul `getAttachmentStatus` lisait cette entrée ;
    // depuis que les marquages relisent la trace avant de l'étendre, la fuite
    // fait échouer des tests sans rapport. Remise à l'état « aucune entrée
    // antérieure », qui est le cas nominal d'un premier rapport.
    mockPrisma.attachmentStatusEntry.findUnique.mockReset();
    mockPrisma.attachmentStatusEntry.findUnique.mockResolvedValue(null);

    // Suppress console output in tests
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();

    // Safe default for the cursor-advance guard (_advanceCursor): the row
    // already exists and the write is fresh, so the guarded updateMany
    // succeeds — matching the old unconditional-upsert behavior for every
    // test that isn't specifically exercising the create or stale paths.
    mockPrisma.conversationReadCursor.updateMany.mockResolvedValue({ count: 1 });

    // Safe defaults for the per-message freeze path (freezeMessageStatus).
    // Individual tests override these to exercise the freeze behavior.
    mockPrisma.message.findMany.mockResolvedValue([]);
    mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);
    mockPrisma.messageStatusEntry.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.messageStatusEntry.updateMany.mockResolvedValue({ count: 0 });
    // Default: no per-participant media consumption rows (getMessageReadStatus).
    // Individual tests override this to exercise the attachmentConsumption path.
    mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([]);
    // Default: personne n'a désactivé ses accusés de lecture — ni dans le
    // document JSON qu'écrit l'application, ni dans les lignes clé/valeur
    // héritées. Les DEUX rangements doivent être modélisés : un double qui
    // n'en connaît qu'un ne peut pas voir lequel des deux la porte consulte.
    mockPrisma.userPreference.findMany.mockResolvedValue([]);
    mockPrisma.userPreferences.findMany.mockResolvedValue([]);

    // Create service instance with mock Prisma
    service = new MessageReadStatusService(mockPrisma as any);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  });

  // ==============================================
  // INITIALIZATION TESTS
  // ==============================================

  describe('Initialization', () => {
    it('should initialize with Prisma client', () => {
      expect(service).toBeInstanceOf(MessageReadStatusService);
    });
  });

  // ==============================================
  // GET UNREAD COUNT TESTS (using ConversationReadCursor)
  // ==============================================

  describe('getUnreadCount', () => {
    // The unread count MUST be computed fresh on every read — the cursor's
    // `unreadCount` field is a stale cache that is only updated on
    // markAsRead/markAsReceived. Trusting it returned wildly inflated
    // counts (e.g. 75 for users who had read all messages) because new
    // messages never auto-increment the cursor between reads. The new
    // contract: always count messages where `createdAt > floor` and
    // `senderId != self`, with floor = lastReadAt ?? participant.joinedAt.

    it('should count messages after cursor.lastReadAt, not return stale cursor.unreadCount', async () => {
      const lastReadAt = new Date('2026-05-21T10:00:00Z');
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
        id: 'cursor-1',
        participantId: testParticipantId,
        conversationId: testConversationId,
        // Stale cached value — must be IGNORED in favour of a fresh count
        unreadCount: 75,
        lastReadAt,
      });
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: testParticipantId,
        joinedAt: new Date('2026-04-01T00:00:00Z'),
      });
      mockPrisma.message.count.mockResolvedValue(3);

      const count = await service.getUnreadCount(testParticipantId, testConversationId);

      expect(count).toBe(3);
      expect(mockPrisma.message.count).toHaveBeenCalledWith({
        where: {
          conversationId: testConversationId,
          deletedAt: null,
          senderId: { not: testParticipantId },
          createdAt: { gt: lastReadAt },
        },
      });
    });

    it('should fall back to participant.joinedAt when cursor has no lastReadAt', async () => {
      const joinedAt = new Date('2026-04-01T00:00:00Z');
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
        id: 'cursor-2',
        participantId: testParticipantId,
        conversationId: testConversationId,
        unreadCount: 0,
        lastReadAt: null,
      });
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: testParticipantId,
        joinedAt,
      });
      mockPrisma.message.count.mockResolvedValue(5);

      const count = await service.getUnreadCount(testParticipantId, testConversationId);

      expect(count).toBe(5);
      expect(mockPrisma.message.count).toHaveBeenCalledWith({
        where: {
          conversationId: testConversationId,
          deletedAt: null,
          senderId: { not: testParticipantId },
          createdAt: { gt: joinedAt },
        },
      });
    });

    it('should fall back to participant.joinedAt when no cursor exists (new participant)', async () => {
      const joinedAt = new Date('2026-05-20T08:00:00Z');
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: testParticipantId,
        joinedAt,
      });
      mockPrisma.message.count.mockResolvedValue(2);

      const count = await service.getUnreadCount(testParticipantId, testConversationId);

      expect(count).toBe(2);
      // CRITICAL: new participant must NOT see the historical conversation
      // as 75 unread — the floor at participant.joinedAt ensures only
      // messages received after they joined are counted.
      expect(mockPrisma.message.count).toHaveBeenCalledWith({
        where: {
          conversationId: testConversationId,
          deletedAt: null,
          senderId: { not: testParticipantId },
          createdAt: { gt: joinedAt },
        },
      });
    });

    it('should resolve a userId to the matching Participant.id and count via that participant', async () => {
      // Regression test for the call-site bug where `_updateUnreadCounts`
      // passed `participant.userId` instead of `participant.id` and the
      // cursor lookup silently missed, falling through to a "count all
      // historical messages" path that returned 75 instead of 0.
      const userId = '6900000000000000000000aa';
      const realParticipantId = testParticipantId;
      const lastReadAt = new Date('2026-05-21T10:00:00Z');

      // 1. The first cursor lookup (by userId) returns null...
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValueOnce(null);
      // 2. ...so the service falls back to resolving the participant by userId
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: realParticipantId,
        userId,
        joinedAt: new Date('2026-04-01T00:00:00Z'),
      });
      // 3. ...then re-queries the cursor with the real Participant.id
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValueOnce({
        id: 'cursor-3',
        participantId: realParticipantId,
        conversationId: testConversationId,
        unreadCount: 0,
        lastReadAt,
      });
      mockPrisma.message.count.mockResolvedValue(1);

      const count = await service.getUnreadCount(userId, testConversationId);

      expect(count).toBe(1);
      // The count MUST exclude the participant's own messages — we use
      // the resolved Participant.id, not the userId, for senderId equality.
      expect(mockPrisma.message.count).toHaveBeenCalledWith({
        where: {
          conversationId: testConversationId,
          deletedAt: null,
          senderId: { not: realParticipantId },
          createdAt: { gt: lastReadAt },
        },
      });
    });

    it('should return 0 on database error', async () => {
      mockPrisma.conversationReadCursor.findUnique.mockRejectedValue(new Error('Database error'));

      const count = await service.getUnreadCount(testParticipantId, testConversationId);

      expect(count).toBe(0);
    });

    it('should return 0 when the participant cannot be resolved and no cursor exists', async () => {
      // Defensive default — calling getUnreadCount with an unknown id
      // must not fall back to counting "all messages from others", which
      // is exactly the legacy bug.
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.participant.findFirst.mockResolvedValue(null);

      const count = await service.getUnreadCount('unknown-id', testConversationId);

      expect(count).toBe(0);
      expect(mockPrisma.message.count).not.toHaveBeenCalled();
    });

    // Régression Prisme lecture-exacte. En mode exact le curseur s'arrête au
    // préfixe contigu : `lastReadMessageId` pointe le dernier message RÉELLEMENT
    // lu, alors que `lastReadAt` vaut `now` (l'horloge murale de l'ouverture,
    // postérieure à TOUS les messages déjà en base). Plancher le compteur sur
    // `lastReadAt` compterait `createdAt > now` = 0 non-lu — « ouvrir marque tout
    // lu », exactement le bug que le lot lecture-exacte élimine. Le plancher DOIT
    // être la position CHRONOLOGIQUE du curseur (`lastReadMessageCreatedAt`) pour
    // que « le badge reste haut » (design lecture-exacte §3).
    it('floors the count on the cursor position (lastReadMessageCreatedAt), not the wall-clock lastReadAt', async () => {
      const lastReadMessageCreatedAt = new Date('2026-05-21T10:00:00Z'); // position : dernier message lu
      const lastReadAt = new Date('2026-05-21T18:00:00Z');               // horloge de l'ouverture
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
        id: 'cursor-exact',
        participantId: testParticipantId,
        conversationId: testConversationId,
        unreadCount: 0,
        lastReadAt,
        lastReadMessageCreatedAt,
      });
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: testParticipantId,
        joinedAt: new Date('2026-04-01T00:00:00Z'),
      });
      mockPrisma.message.count.mockResolvedValue(197);

      const count = await service.getUnreadCount(testParticipantId, testConversationId);

      expect(count).toBe(197);
      expect(mockPrisma.message.count).toHaveBeenCalledWith({
        where: {
          conversationId: testConversationId,
          deletedAt: null,
          senderId: { not: testParticipantId },
          createdAt: { gt: lastReadMessageCreatedAt },
        },
      });
    });
  });

  // ==============================================
  // GET UNREAD COUNTS FOR CONVERSATIONS TESTS
  // ==============================================

  describe('getUnreadCountsForConversations', () => {
    const conversationIds = [
      '507f1f77bcf86cd799439012',
      '507f1f77bcf86cd799439020',
      '507f1f77bcf86cd799439021'
    ];

    it('should return empty map for empty conversation list', async () => {
      const result = await service.getUnreadCountsForConversations([testParticipantId],[]);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('should compute fresh counts per conversation using batch queries (iter-4)', async () => {
      const lastReadAt = new Date('2026-05-21T10:00:00Z');
      const joinedAt = new Date('2026-04-01');
      // iter-4 batch path: participant.findMany (1 query) + cursor.findMany (1 query) + message.count × N
      mockPrisma.participant.findMany.mockResolvedValueOnce([
        { id: testParticipantId, conversationId: conversationIds[0], joinedAt },
        { id: testParticipantId, conversationId: conversationIds[1], joinedAt },
        // conversationIds[2] has no participant → defaults to 0
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValueOnce([
        { participantId: testParticipantId, lastReadAt },
      ]);
      mockPrisma.message.count
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(3);

      const result = await service.getUnreadCountsForConversations([testParticipantId], conversationIds);

      expect(result.get(conversationIds[0])).toBe(5);
      expect(result.get(conversationIds[1])).toBe(3);
      expect(result.get(conversationIds[2])).toBe(0);
    });

    // Même régression que getUnreadCount, sur le chemin batch de la liste de
    // conversations : le plancher est la position chronologique du curseur, pas
    // l'horloge murale `lastReadAt`. Sinon le badge de chaque conversation
    // ouverte en préfixe partiel tombe à 0.
    it('floors the batch count on the cursor position (lastReadMessageCreatedAt), not lastReadAt', async () => {
      const lastReadMessageCreatedAt = new Date('2026-05-21T10:00:00Z');
      const lastReadAt = new Date('2026-05-21T18:00:00Z');
      const joinedAt = new Date('2026-04-01');
      mockPrisma.participant.findMany.mockResolvedValueOnce([
        { id: testParticipantId, conversationId: conversationIds[0], joinedAt },
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValueOnce([
        { participantId: testParticipantId, lastReadAt, lastReadMessageCreatedAt },
      ]);
      mockPrisma.message.count.mockResolvedValueOnce(4);

      const result = await service.getUnreadCountsForConversations([testParticipantId], conversationIds);

      expect(result.get(conversationIds[0])).toBe(4);
      expect(mockPrisma.message.count).toHaveBeenCalledWith({
        where: {
          conversationId: conversationIds[0],
          deletedAt: null,
          senderId: { not: testParticipantId },
          createdAt: { gt: lastReadMessageCreatedAt },
        },
      });
    });

    it('should return map of zeros on database error', async () => {
      // iter-4 batch path: participant.findMany throws → catch returns zeros
      mockPrisma.participant.findMany.mockRejectedValue(new Error('Database error'));

      const result = await service.getUnreadCountsForConversations([testParticipantId], conversationIds);

      expect(result).toBeInstanceOf(Map);
      // Outer catch returns empty Map (size 0) when participant batch fails
      expect(result.size).toBe(0);
    });
  });

  // ==============================================
  // MARK MESSAGES AS RECEIVED TESTS
  // ==============================================

  describe('markMessagesAsReceived', () => {
    it('should create cursor when marking as received (cursor-only approach)', async () => {
      const mockMessage = { id: testMessageId, conversationId: testConversationId };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);
      // No existing cursor row: the guarded updateMany can't match anything,
      // so _advanceCursor falls through to create().
      mockPrisma.conversationReadCursor.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.conversationReadCursor.create.mockResolvedValue({});
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);

      await service.markMessagesAsReceived(testParticipantId, testConversationId, testMessageId);

      expect(mockPrisma.conversationReadCursor.updateMany).toHaveBeenCalledWith({
        where: {
          participantId: testParticipantId,
          conversationId: testConversationId,
          OR: [{ lastDeliveredMessageId: null }, { lastDeliveredMessageId: { lt: testMessageId } }]
        },
        data: expect.objectContaining({
          lastDeliveredMessageId: testMessageId,
          lastDeliveredAt: expect.any(Date),
          version: { increment: 1 }
        })
      });
      expect(mockPrisma.conversationReadCursor.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          participantId: testParticipantId,
          conversationId: testConversationId,
          lastDeliveredMessageId: testMessageId,
          lastDeliveredAt: expect.any(Date),
          unreadCount: 0,
          version: 0
        })
      });

      // No messages in the newly-crossed window (default mock) → freeze no-ops.
      expect(mockPrisma.messageStatusEntry.createMany).not.toHaveBeenCalled();
    });

    it('should fetch latest message when messageId not provided', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);

      await service.markMessagesAsReceived(testParticipantId, testConversationId);

      expect(mockPrisma.message.findFirst).toHaveBeenCalledWith({
        where: { conversationId: testConversationId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true }
      });
    });

    it('should return early when no messages in conversation', async () => {
      mockPrisma.message.findFirst.mockResolvedValue(null);

      await service.markMessagesAsReceived(testParticipantId, testConversationId);

      expect(mockPrisma.conversationReadCursor.updateMany).not.toHaveBeenCalled();
      expect(mockPrisma.conversationReadCursor.create).not.toHaveBeenCalled();
    });

    it('should proceed with provided messageId even without validation', async () => {
      // In the cursor-based approach, when a messageId is explicitly provided,
      // the service proceeds directly without fetching the latest message.
      // The messageId is trusted as provided by the caller.
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);

      await service.markMessagesAsReceived(testParticipantId, testConversationId, 'provided-message-id');

      expect(mockPrisma.conversationReadCursor.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lastDeliveredMessageId: 'provided-message-id'
          })
        })
      );
    });

    it('should ignore an out-of-order receipt older than the recorded delivered cursor', async () => {
      // A second device/retry reports delivery up to testMessageId (older)
      // AFTER the cursor already advanced to testMessageId2 (newer). The
      // guard is now evaluated atomically inside updateMany's WHERE, not on a
      // stale snapshot: it correctly rejects the advance, and since the
      // cursor row is known to exist (from the best-effort read), the create
      // fallback is never attempted.
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
        lastDeliveredAt: new Date('2025-01-02')
      });
      mockPrisma.conversationReadCursor.updateMany.mockResolvedValue({ count: 0 });

      await service.markMessagesAsReceived(testParticipantId, testConversationId, testMessageId);

      expect(mockPrisma.conversationReadCursor.create).not.toHaveBeenCalled();
      // Stale: the write never advanced, so the freeze pass never runs.
      expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
    });

    it('should not treat non-ObjectId message ids as stale (safety net for non-Mongo ids)', async () => {
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
        lastDeliveredAt: new Date('2025-01-01')
      });

      await service.markMessagesAsReceived(testParticipantId, testConversationId, 'not-an-object-id-older');

      // Non-ObjectId ids skip the freshness OR clause entirely (guard would
      // be meaningless lexicographic comparison on non-Mongo ids) — the
      // updateMany still matches on participant+conversation alone.
      expect(mockPrisma.conversationReadCursor.updateMany).toHaveBeenCalledWith({
        where: { participantId: testParticipantId, conversationId: testConversationId },
        data: expect.objectContaining({ lastDeliveredMessageId: 'not-an-object-id-older' })
      });
      expect(mockPrisma.conversationReadCursor.create).not.toHaveBeenCalled();
    });

    // #4179 — `markedCount` a désormais UNE définition partout : le nombre
    // d'entrées `deliveredAt` RÉELLEMENT figées par cet appel. Avant ce
    // correctif la méthode ne rendait rien (`Promise<void>`) et la porte
    // `mark-as-received` servait à sa place `getUnreadCount` — calculé AVANT
    // le marquage, donc un nombre différent de ce qui vient d'être écrit. Ce
    // témoin fixe le nouveau contrat : `markMessagesAsReceived` rend le
    // COMPTE RÉEL, indépendamment de tout `unreadCount`.
    it('returns the number of MessageStatusEntry rows actually frozen, not a derived count', async () => {
      mockPrisma.message.findMany.mockResolvedValue([{ id: 'msg-a' }, { id: 'msg-b' }]);
      mockPrisma.messageStatusEntry.createMany.mockResolvedValue({ count: 2 });

      const result = await service.markMessagesAsReceived(testParticipantId, testConversationId, testMessageId);

      expect(result).toBe(2);
    });

    it('returns 0 when the received receipt is ignored as stale', async () => {
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
        lastDeliveredAt: new Date('2025-01-02')
      });
      mockPrisma.conversationReadCursor.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.markMessagesAsReceived(testParticipantId, testConversationId, testMessageId);

      expect(result).toBe(0);
      // Stale : la passe de gel n'a même pas dû être tentée.
      expect(mockPrisma.messageStatusEntry.createMany).not.toHaveBeenCalled();
    });
  });

  describe('markMessagesAsReceived — atomic cursor guard survives a stale existence read (regression)', () => {
    it('never regresses the delivered cursor even when both racing calls believe no cursor exists yet', async () => {
      // Reproduces the exact TOCTOU this fix closes: two concurrent calls for
      // the same participant+conversation both complete their best-effort
      // "does a cursor exist" read BEFORE either call's write lands, so both
      // see no row. Under the old unconditional `upsert`, whichever write
      // reached the DB LAST would win regardless of message recency. Here the
      // real guard lives in the write itself — this stateful fake stands in
      // for MongoDB, evaluating the `updateMany` WHERE guard against the
      // ACTUAL current row, not the stale snapshot either caller read.
      let row: { lastDeliveredMessageId: string } | null = null;

      // Both callers see "no row" — the stale existence snapshot.
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);

      mockPrisma.conversationReadCursor.updateMany.mockImplementation(async ({ where, data }: any) => {
        if (!row) return { count: 0 };
        const guardPasses: boolean = where.OR?.some((clause: any) =>
          clause.lastDeliveredMessageId === null
            ? false
            : row!.lastDeliveredMessageId < clause.lastDeliveredMessageId.lt
        ) ?? true;
        if (!guardPasses) return { count: 0 };
        row = { lastDeliveredMessageId: data.lastDeliveredMessageId };
        return { count: 1 };
      });

      mockPrisma.conversationReadCursor.create.mockImplementation(async ({ data }: any) => {
        if (row) {
          const err: any = new Error('duplicate cursor');
          err.code = 'P2002';
          throw err;
        }
        row = { lastDeliveredMessageId: data.lastDeliveredMessageId };
        return row;
      });

      // The NEWER message's write reaches the DB first, then the OLDER
      // message's write reaches it second — the interleaving that used to
      // silently win under the old blind upsert.
      await service.markMessagesAsReceived(testParticipantId, testConversationId, testMessageId2);
      await service.markMessagesAsReceived(testParticipantId, testConversationId, testMessageId);

      expect(row?.lastDeliveredMessageId).toBe(testMessageId2);
    });
  });

  describe('buildCursorFreshnessGuard (pure)', () => {
    const objectIdA = '507f1f77bcf86cd799439010';
    const createdAt = new Date('2025-01-01T00:00:00.500Z');

    it('orders by createdAt with an ObjectId legacy fallback when a createdAt is known', () => {
      expect(
        buildCursorFreshnessGuard({
          idField: 'lastDeliveredMessageId',
          createdAtField: 'lastDeliveredMessageCreatedAt',
          messageId: objectIdA,
          messageCreatedAt: createdAt,
        })
      ).toEqual({
        OR: [
          { lastDeliveredMessageCreatedAt: null, lastDeliveredMessageId: null },
          { lastDeliveredMessageCreatedAt: null, lastDeliveredMessageId: { lt: objectIdA } },
          { lastDeliveredMessageCreatedAt: { lt: createdAt } },
        ],
      });
    });

    it('falls back to the ObjectId-order guard when createdAt is unresolved', () => {
      expect(
        buildCursorFreshnessGuard({
          idField: 'lastReadMessageId',
          createdAtField: 'lastReadMessageCreatedAt',
          messageId: objectIdA,
          messageCreatedAt: null,
        })
      ).toEqual({
        OR: [{ lastReadMessageId: null }, { lastReadMessageId: { lt: objectIdA } }],
      });
    });

    it('returns null (no guard) for non-ObjectId ids', () => {
      expect(
        buildCursorFreshnessGuard({
          idField: 'lastReadMessageId',
          createdAtField: 'lastReadMessageCreatedAt',
          messageId: 'not-an-object-id',
          messageCreatedAt: createdAt,
        })
      ).toBeNull();
    });
  });

  describe('markMessagesAsReceived — cursor freshness is ordered by message createdAt, not ObjectId string', () => {
    // A MongoDB ObjectId only encodes creation time to the SECOND; its next 5
    // bytes are per-process random. Two messages created in the same second on
    // different gateway processes therefore sort by hex string in an order
    // unrelated to real recency. The delivered/read cursor must never roll back
    // to a genuinely OLDER message just because its ObjectId string happens to
    // sort higher than the message the cursor already records.
    //
    // Scenario: `idNewer` was created LATER (createdAt 500ms) but its ObjectId
    // string sorts BELOW `idOlder` (created earlier, 100ms). Under the old
    // string-`lt` guard, a late delivery receipt for the older message wins the
    // comparison `idNewer < idOlder` and rolls the cursor backward. Ordering by
    // createdAt removes the inversion.
    const idNewer = '507f1f77bcf86cd799439010';
    const idOlder = '507f1f77bcf86cd799439999';
    const tNewer = new Date('2025-01-01T00:00:00.500Z');
    const tOlder = new Date('2025-01-01T00:00:00.100Z');
    const createdAtById: Record<string, Date> = { [idNewer]: tNewer, [idOlder]: tOlder };

    const evalClause = (clause: Record<string, any>, row: Record<string, any>): boolean =>
      Object.entries(clause).every(([field, cond]) => {
        const current = row[field] ?? null;
        if (cond === null) return current === null;
        if (cond && typeof cond === 'object' && 'lt' in cond) {
          return current !== null && current < cond.lt;
        }
        return current === cond;
      });

    it('does not roll the delivered cursor back to an older same-second message with a higher ObjectId string', async () => {
      let row: Record<string, any> | null = null;

      mockPrisma.message.findUnique.mockImplementation(async ({ where }: any) => {
        const createdAt = createdAtById[where.id];
        return createdAt ? { createdAt } : null;
      });
      mockPrisma.conversationReadCursor.findUnique.mockImplementation(async () => row);

      mockPrisma.conversationReadCursor.updateMany.mockImplementation(async ({ where, data }: any) => {
        if (!row) return { count: 0 };
        const passes = where.OR ? where.OR.some((clause: any) => evalClause(clause, row!)) : true;
        if (!passes) return { count: 0 };
        row = { ...row, ...data };
        return { count: 1 };
      });
      mockPrisma.conversationReadCursor.create.mockImplementation(async ({ data }: any) => {
        row = { ...data };
        return row;
      });

      // The newer message is delivered first (cursor advances to it), then a
      // late receipt for the older message arrives second.
      await service.markMessagesAsReceived(testParticipantId, testConversationId, idNewer);
      await service.markMessagesAsReceived(testParticipantId, testConversationId, idOlder);

      expect(row?.lastDeliveredMessageId).toBe(idNewer);
    });

    it('still advances the delivered cursor for a genuinely newer same-second message with a lower ObjectId string', async () => {
      let row: Record<string, any> | null = null;

      mockPrisma.message.findUnique.mockImplementation(async ({ where }: any) => {
        const createdAt = createdAtById[where.id];
        return createdAt ? { createdAt } : null;
      });
      mockPrisma.conversationReadCursor.findUnique.mockImplementation(async () => row);

      mockPrisma.conversationReadCursor.updateMany.mockImplementation(async ({ where, data }: any) => {
        if (!row) return { count: 0 };
        const passes = where.OR ? where.OR.some((clause: any) => evalClause(clause, row!)) : true;
        if (!passes) return { count: 0 };
        row = { ...row, ...data };
        return { count: 1 };
      });
      mockPrisma.conversationReadCursor.create.mockImplementation(async ({ data }: any) => {
        row = { ...data };
        return row;
      });

      // The older message is delivered first, then the genuinely newer message
      // (lower ObjectId string) — the cursor MUST advance to it.
      await service.markMessagesAsReceived(testParticipantId, testConversationId, idOlder);
      await service.markMessagesAsReceived(testParticipantId, testConversationId, idNewer);

      expect(row?.lastDeliveredMessageId).toBe(idNewer);
    });
  });

  // ==============================================
  // MARK MESSAGES AS READ TESTS
  // ==============================================

  describe('markMessagesAsRead', () => {
    it('should update cursor only (cursor-based approach, no individual status entries)', async () => {
      const messageDate = new Date('2025-01-01');
      const mockMessage = { id: testMessageId, createdAt: messageDate };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      expect(mockPrisma.conversationReadCursor.updateMany).toHaveBeenCalledWith({
        where: {
          participantId: testParticipantId,
          conversationId: testConversationId,
          OR: [{ lastReadMessageId: null }, { lastReadMessageId: { lt: testMessageId } }]
        },
        data: expect.objectContaining({
          lastReadMessageId: testMessageId,
          lastReadAt: expect.any(Date),
          unreadCount: 0,
          version: { increment: 1 }
        })
      });
      expect(mockPrisma.conversationReadCursor.create).not.toHaveBeenCalled();

      // No messages in the newly-crossed window (default mock) → freeze no-ops.
      expect(mockPrisma.messageStatusEntry.createMany).not.toHaveBeenCalled();
      expect(mockPrisma.message.update).not.toHaveBeenCalled();
    });

    it('should ignore an out-of-order read receipt older than the recorded read cursor', async () => {
      // e.g. two devices marking read concurrently: a stale device reports
      // testMessageId (older) after the cursor already advanced to
      // testMessageId2 (newer) — must not roll the cursor backward. The guard
      // is evaluated atomically inside updateMany's WHERE at write time, not
      // on this snapshot, so a concurrent fresher write can never be undone.
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
        lastReadAt: new Date('2025-01-02')
      });
      mockPrisma.conversationReadCursor.updateMany.mockResolvedValue({ count: 0 });

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      expect(mockPrisma.conversationReadCursor.create).not.toHaveBeenCalled();
      expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
    });

    it('should advance the cursor when the read receipt is genuinely newer', async () => {
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
        lastReadAt: new Date('2025-01-01')
      });

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId2);

      expect(mockPrisma.conversationReadCursor.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastReadMessageId: testMessageId2 })
        })
      );
    });

    it('should not treat non-ObjectId message ids as stale (safety net for non-Mongo ids)', async () => {
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
        lastReadAt: new Date('2025-01-01')
      });

      await service.markMessagesAsRead(testParticipantId, testConversationId, 'not-an-object-id-older');

      // Non-ObjectId ids skip the freshness OR clause entirely — the
      // updateMany still matches on participant+conversation alone.
      expect(mockPrisma.conversationReadCursor.updateMany).toHaveBeenCalledWith({
        where: { participantId: testParticipantId, conversationId: testConversationId },
        data: expect.objectContaining({ lastReadMessageId: 'not-an-object-id-older' })
      });
      expect(mockPrisma.conversationReadCursor.create).not.toHaveBeenCalled();
    });

    // Chemin HÉRITÉ : sans ids rapportés (binaires clients déjà distribués), le
    // gel retombe sur la fenêtre temporelle. Ce comportement sur-déclare — c'est
    // précisément ce que le mode exact ci-dessous corrige — mais il doit être
    // préservé tant que des clients postent un corps vide.
    // @see docs/superpowers/specs/2026-07-24-read-exactness-design.md
    it('legacy path (no reported ids): freezes the whole time window', async () => {
      const messageDate = new Date('2025-01-01T00:00:00Z');
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId, createdAt: messageDate });
      // Previous read cursor is older → window has newly-read messages.
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: new Date('2024-12-01T00:00:00Z') });
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }, { id: testMessageId2 }]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]); // none frozen yet

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      // Window query excludes the participant's own messages and is time-bounded.
      expect(mockPrisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            conversationId: testConversationId,
            deletedAt: null,
            senderId: { not: testParticipantId },
            createdAt: expect.objectContaining({ gt: new Date('2024-12-01T00:00:00Z') })
          })
        })
      );
      // Both messages get a frozen readAt (write-once create).
      expect(mockPrisma.messageStatusEntry.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ messageId: testMessageId, participantId: testParticipantId, readAt: expect.any(Date) }),
          expect.objectContaining({ messageId: testMessageId2, participantId: testParticipantId, readAt: expect.any(Date) })
        ]
      });
    });

    // ── Prisme linguistique ───────────────────────────────────────────────
    // « Qui a lu » sans « dans quelle langue » perd la moitié de l'information :
    // l'auteur ignore si son texte a été compris tel qu'il l'a écrit ou à
    // travers une traduction. Contrairement à l'horodatage, la langue n'est pas
    // write-once — un lecteur qui bascule a vu les DEUX versions.

    it('inscrit la langue de lecture sur les entrées nouvellement figées', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId, createdAt: new Date('2025-01-01T00:00:00Z') });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: new Date('2024-12-01T00:00:00Z') });
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId, {
        messageIds: [testMessageId],
        language: 'en'
      });

      expect(mockPrisma.messageStatusEntry.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ viewedLanguages: ['en'] })]
      });
    });

    it('normalise la locale complète avant de l\'inscrire', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId, createdAt: new Date('2025-01-01T00:00:00Z') });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: null });
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId, {
        messageIds: [testMessageId],
        language: 'fr_FR'
      });

      expect(mockPrisma.messageStatusEntry.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ viewedLanguages: ['fr'] })]
      });
    });

    it('ajoute la nouvelle langue à une entrée déjà lue dans une autre', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId, createdAt: new Date('2025-01-01T00:00:00Z') });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: null });
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        { messageId: testMessageId, deliveredAt: new Date(), readAt: new Date(), viewedLanguages: ['fr'] }
      ]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId, {
        messageIds: [testMessageId],
        language: 'en'
      });

      expect(mockPrisma.messageStatusEntry.updateMany).toHaveBeenCalledWith({
        where: { messageId: { in: [testMessageId] }, participantId: testParticipantId },
        data: { viewedLanguages: { push: 'en' } }
      });
    });

    it('n\'écrit rien quand la langue est déjà connue de l\'entrée', async () => {
      // Le chemin courant : le lecteur ne change pas de langue entre deux lots.
      // Une réécriture par message et par lot serait du bruit pur.
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId, createdAt: new Date('2025-01-01T00:00:00Z') });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: null });
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        { messageId: testMessageId, deliveredAt: new Date(), readAt: new Date(), viewedLanguages: ['fr'] }
      ]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId, {
        messageIds: [testMessageId],
        language: 'fr'
      });

      const languagePush = mockPrisma.messageStatusEntry.updateMany.mock.calls.find(
        (call: any[]) => call[0]?.data?.viewedLanguages
      );
      expect(languagePush).toBeUndefined();
    });

    it('ne duplique pas une langue déjà connue sous une locale complète (stock legacy dénormalisé)', async () => {
      // Une entrée écrite par une version antérieure a pu stocker la locale
      // complète `fr-FR`. Le lecteur revient dans la même langue, normalisée
      // en `fr`. `fr-FR` et `fr` désignent la même version : pousser `fr`
      // créerait un doublon logique. La dédup passe donc par le SSOT
      // `mergeViewedLanguages`, qui re-normalise l'existant avant comparaison.
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId, createdAt: new Date('2025-01-01T00:00:00Z') });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: null });
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        { messageId: testMessageId, deliveredAt: new Date(), readAt: new Date(), viewedLanguages: ['fr-FR'] }
      ]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId, {
        messageIds: [testMessageId],
        language: 'fr'
      });

      const languagePush = mockPrisma.messageStatusEntry.updateMany.mock.calls.find(
        (call: any[]) => call[0]?.data?.viewedLanguages
      );
      expect(languagePush).toBeUndefined();
    });

    it('respecte la langue réellement affichée pour un message sans traduction', async () => {
      // Le lecteur préfère l'anglais, mais ce message n'a jamais été traduit :
      // il l'a vu en français. Le déclarer « lu en anglais » mentirait
      // précisément là où l'auteur veut savoir.
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId2, createdAt: new Date('2025-01-01T00:00:00Z') });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: null });
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }, { id: testMessageId2 }]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId2, {
        messageIds: [testMessageId, testMessageId2],
        language: 'en',
        messageLanguages: { [testMessageId2]: 'fr' }
      });

      expect(mockPrisma.messageStatusEntry.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ messageId: testMessageId, viewedLanguages: ['en'] }),
          expect.objectContaining({ messageId: testMessageId2, viewedLanguages: ['fr'] })
        ]
      });
    });

    it('regroupe les mises à jour par langue plutôt qu\'une par message', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId2, createdAt: new Date('2025-01-01T00:00:00Z') });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: null });
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }, { id: testMessageId2 }]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        { messageId: testMessageId, deliveredAt: new Date(), readAt: new Date(), viewedLanguages: [] },
        { messageId: testMessageId2, deliveredAt: new Date(), readAt: new Date(), viewedLanguages: [] }
      ]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId2, {
        messageIds: [testMessageId, testMessageId2],
        language: 'en'
      });

      const languagePushes = mockPrisma.messageStatusEntry.updateMany.mock.calls.filter(
        (call: any[]) => call[0]?.data?.viewedLanguages
      );
      expect(languagePushes).toHaveLength(1);
      expect(languagePushes[0][0].where.messageId.in).toEqual([testMessageId, testMessageId2]);
    });

    it('sépare les groupes quand une exception s\'en écarte', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId2, createdAt: new Date('2025-01-01T00:00:00Z') });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: null });
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }, { id: testMessageId2 }]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        { messageId: testMessageId, deliveredAt: new Date(), readAt: new Date(), viewedLanguages: [] },
        { messageId: testMessageId2, deliveredAt: new Date(), readAt: new Date(), viewedLanguages: [] }
      ]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId2, {
        messageIds: [testMessageId, testMessageId2],
        language: 'en',
        messageLanguages: { [testMessageId2]: 'fr' }
      });

      const languagePushes = mockPrisma.messageStatusEntry.updateMany.mock.calls
        .filter((call: any[]) => call[0]?.data?.viewedLanguages)
        .map((call: any[]) => [call[0].data.viewedLanguages.push, call[0].where.messageId.in]);

      expect(languagePushes).toEqual([
        ['en', [testMessageId]],
        ['fr', [testMessageId2]]
      ]);
    });

    it('ne touche pas aux langues quand aucune n\'est rapportée', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId, createdAt: new Date('2025-01-01T00:00:00Z') });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: null });
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId, {
        messageIds: [testMessageId]
      });

      expect(mockPrisma.messageStatusEntry.createMany).toHaveBeenCalledWith({
        data: [expect.not.objectContaining({ viewedLanguages: expect.anything() })]
      });
    });

    it('exact mode: freezes ONLY the reported messages, not the whole window', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId, createdAt: new Date('2025-01-01T00:00:00Z') });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: new Date('2024-12-01T00:00:00Z') });
      // La requête est bornée par la liste d'ids : seul le message rapporté revient.
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId, {
        messageIds: [testMessageId]
      });

      const readFreezeWhere = mockPrisma.message.findMany.mock.calls[0][0].where;
      expect(readFreezeWhere).toEqual(expect.objectContaining({ id: { in: [testMessageId] } }));
      // Aucune fenêtre temporelle : c'est l'affichage réel qui fait foi.
      expect(readFreezeWhere.createdAt).toBeUndefined();

      // testMessageId2 était dans la fenêtre mais n'a jamais été affiché.
      expect(mockPrisma.messageStatusEntry.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({ messageId: testMessageId, participantId: testParticipantId, readAt: expect.any(Date) })
        ]
      });
    });

    // `markedCount` doit compter ce qui a RÉELLEMENT été figé. Ni le nombre
    // d'ids rapportés (certains étaient déjà lus), ni le compteur de non-lus
    // (il inclut des messages non rapportés) ne disent la vérité.
    it('exact mode: returns the number of entries actually frozen', async () => {
      const msgA = '507f1f77bcf86cd799439021';
      const msgB = '507f1f77bcf86cd799439022';
      mockPrisma.message.findFirst.mockResolvedValue({ id: msgB, createdAt: new Date('2025-01-02T00:00:00Z') });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: new Date('2024-12-01T00:00:00Z') });
      mockPrisma.message.findMany.mockResolvedValue([{ id: msgA }, { id: msgB }]);
      // msgB porte déjà un readAt : seul msgA sera effectivement figé.
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        { messageId: msgB, deliveredAt: new Date('2025-01-02T00:00:01Z'), readAt: new Date('2025-01-02T00:00:02Z') }
      ]);
      mockPrisma.messageStatusEntry.createMany.mockResolvedValue({ count: 1 });

      const frozen = await service.markMessagesAsRead(testParticipantId, testConversationId, undefined, {
        messageIds: [msgA, msgB]
      });

      expect(frozen).toBe(1);
    });

    it('exact mode: reports zero when every reported message was already read', async () => {
      const msgA = '507f1f77bcf86cd799439021';
      mockPrisma.message.findFirst.mockResolvedValue({ id: msgA, createdAt: new Date('2025-01-02T00:00:00Z') });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: new Date('2024-12-01T00:00:00Z') });
      mockPrisma.message.findMany.mockResolvedValue([{ id: msgA }]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        { messageId: msgA, deliveredAt: new Date('2025-01-02T00:00:01Z'), readAt: new Date('2025-01-02T00:00:02Z') }
      ]);

      const frozen = await service.markMessagesAsRead(testParticipantId, testConversationId, undefined, {
        messageIds: [msgA]
      });

      expect(frozen).toBe(0);
    });

    it('exact mode: keeps the ownership guards so a client cannot mark arbitrary messages read', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId, createdAt: new Date('2025-01-01T00:00:00Z') });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId, {
        messageIds: [testMessageId, 'ffffffffffffffffffffffff']
      });

      // Un id forgé hors conversation, supprimé, ou émis par le participant
      // lui-même reste filtré par la base — la liste d'ids ne contourne rien.
      expect(mockPrisma.message.findMany.mock.calls[0][0].where).toEqual(
        expect.objectContaining({
          conversationId: testConversationId,
          deletedAt: null,
          senderId: { not: testParticipantId }
        })
      );
    });

    // Rattrapage — « je suis arrivé au dernier message ». Le badge tombe, les
    // accusés de lecture ne bougent pas d'un pouce.
    it('rattrapage : fait sauter le curseur au dernier message et remet le compteur à zéro', async () => {
      const msgSeen = '507f1f77bcf86cd799439021';
      const msgNewest = '507f1f77bcf86cd799439099';
      mockPrisma.message.findFirst.mockResolvedValue({ id: msgNewest, createdAt: new Date('2025-01-02T00:00:00Z') });
      // #4179 — anti-spoof : `caughtUpToMessageId` doit désormais résoudre à un
      // message de LA MÊME conversation avant que le curseur ne saute dessus.
      mockPrisma.message.findUnique.mockResolvedValue({ conversationId: testConversationId });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: new Date('2024-12-01T00:00:00Z') });
      mockPrisma.message.findMany.mockResolvedValue([{ id: msgSeen }]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, msgNewest, {
        messageIds: [msgSeen],
        caughtUpToMessageId: msgNewest
      });

      const cursorWrites = mockPrisma.conversationReadCursor.updateMany.mock.calls
        .map((c: any[]) => c[0].data)
        .filter((d: any) => d.lastReadMessageId !== undefined);
      expect(cursorWrites).toContainEqual(
        expect.objectContaining({ lastReadMessageId: msgNewest, unreadCount: 0 })
      );
    });

    // #4179 — anti-spoof généralisé. `freezeMessageStatus` borne déjà
    // `messageIds` à `conversationId` directement dans sa clause Prisma ;
    // `caughtUpToMessageId` en était dispensé et alimentait `_advanceCursor`
    // SANS AUCUNE vérification d'appartenance — `_advanceCursor` résout le
    // `createdAt` du message par son seul id, sans filtre `conversationId`.
    // Un id forgé pointant vers une AUTRE conversation aurait donc fait
    // sauter le curseur de CETTE conversation sur l'horloge d'un message
    // qu'elle n'a jamais contenu, ET remis son badge à zéro
    // (`resetUnreadCount: true`) sur la foi de cette date arbitraire. Ce
    // témoin prouve le refus : la MUTATION qui retire la vérification (ou qui
    // compare la mauvaise conversation) le fait tomber, en montrant le
    // curseur AVANCÉ sur `msgForeign` — jamais un « rien n'a été écrit », ce
    // qu'un test qui ne regarderait que l'ABSENCE d'écriture ne pourrait pas
    // distinguer d'un défaut de câblage du témoin lui-même.
    // Le champ est OPTIONNEL, et la lecture qui le vérifie doit l'être aussi.
    //
    // Mesuré sur staging le 2026-08-31 (build `60bc4c2`) :
    // `POST /conversations/:id/receipts {"type":"read","messageIds":[…]}` sans
    // `caughtUpToMessageId` rendait « Erreur lors de l'écriture de l'accusé »,
    // et le journal du conteneur donnait la cause —
    // `prisma.message.findUnique({ where: { id: undefined } })`, refusé par
    // Prisma. La garde anti-usurpation ci-dessus partait sur CHAQUE appel
    // portant `messageIds`, alors que son propre commentaire annonce qu'elle
    // ne coûte une lecture « que quand ce champ optionnel est fourni » : le
    // `if` que la phrase décrit n'existait pas.
    //
    // Pourquoi aucun témoin ne l'avait vu : `mockPrisma.message.findUnique`
    // est un `jest.fn()` nu, qui REND quel que soit le `where`. **Un double
    // qui ignore le `where` ne peut pas faire tomber une requête invalide** —
    // il répond là où le vrai Prisma lève. Ce témoin mesure donc l'APPEL, pas
    // la réponse : la seule forme qui distingue « la lecture n'a pas lieu »
    // de « la lecture a lieu et le double la couvre ».
    it("n'interroge PAS Prisma quand `caughtUpToMessageId` est absent", async () => {
      const msgSeen = '507f1f77bcf86cd799439021';
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: new Date('2024-12-01T00:00:00Z') });
      mockPrisma.message.findMany.mockResolvedValue([{ id: msgSeen }]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);
      mockPrisma.message.findUnique.mockClear();

      await service.markMessagesAsRead(testParticipantId, testConversationId, msgSeen, {
        messageIds: [msgSeen],
      });

      const appelsSansId = mockPrisma.message.findUnique.mock.calls.filter(
        (appel: any[]) => appel[0]?.where?.id === undefined
      );
      expect(appelsSansId).toEqual([]);
    });

    it("rattrapage : refuse un caughtUpToMessageId d'une AUTRE conversation", async () => {
      const msgSeen = '507f1f77bcf86cd799439021';
      const msgForeign = '507f1f77bcf86cd799439098';
      const otherConversationId = '507f1f77bcf86cd799439055';
      mockPrisma.message.findFirst.mockResolvedValue({ id: msgSeen, createdAt: new Date('2025-01-02T00:00:00Z') });
      // Le message visé par `caughtUpToMessageId` appartient à une AUTRE
      // conversation que celle sur laquelle porte cet appel.
      mockPrisma.message.findUnique.mockResolvedValue({ conversationId: otherConversationId });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: new Date('2024-12-01T00:00:00Z') });
      mockPrisma.message.findMany.mockResolvedValue([{ id: msgSeen }]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, msgSeen, {
        messageIds: [msgSeen],
        caughtUpToMessageId: msgForeign
      });

      const cursorWrites = mockPrisma.conversationReadCursor.updateMany.mock.calls
        .map((c: any[]) => c[0].data)
        .filter((d: any) => d.lastReadMessageId !== undefined);
      expect(cursorWrites).not.toContainEqual(
        expect.objectContaining({ lastReadMessageId: msgForeign })
      );
    });

    // Le badge et les coches bleues répondent à deux questions différentes.
    // Vider le premier ne doit RIEN ajouter aux secondes, sinon l'expéditeur
    // voit « lu » sur des messages que personne n'a affichés.
    it('rattrapage : ne fige aucun readAt au-delà des messages réellement affichés', async () => {
      const msgSeen = '507f1f77bcf86cd799439021';
      const msgNewest = '507f1f77bcf86cd799439099';
      mockPrisma.message.findFirst.mockResolvedValue({ id: msgNewest, createdAt: new Date('2025-01-02T00:00:00Z') });
      // #4179 — même garde anti-spoof que le témoin précédent (voir son commentaire).
      mockPrisma.message.findUnique.mockResolvedValue({ conversationId: testConversationId });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: new Date('2024-12-01T00:00:00Z') });
      mockPrisma.message.findMany.mockResolvedValue([{ id: msgSeen }]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, msgNewest, {
        messageIds: [msgSeen],
        caughtUpToMessageId: msgNewest
      });

      const readFreezeWhere = mockPrisma.message.findMany.mock.calls[0][0].where;
      expect(readFreezeWhere).toEqual(expect.objectContaining({ id: { in: [msgSeen] } }));
      expect(mockPrisma.messageStatusEntry.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ messageId: msgSeen, readAt: expect.any(Date) })]
      });
    });

    it('exact mode: the delivered freeze stays window-based (delivered = fetched)', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId, createdAt: new Date('2025-01-01T00:00:00Z') });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
        lastReadAt: new Date('2024-12-01T00:00:00Z'),
        lastDeliveredAt: new Date('2024-12-01T00:00:00Z')
      });
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId, {
        messageIds: [testMessageId]
      });

      // Second appel = gel de la livraison : un message récupéré EST livré,
      // même s'il n'a pas été affiché. La fenêtre y reste correcte.
      const deliveredFreezeWhere = mockPrisma.message.findMany.mock.calls[1][0].where;
      expect(deliveredFreezeWhere.createdAt).toEqual(
        expect.objectContaining({ gt: new Date('2024-12-01T00:00:00Z') })
      );
      expect(deliveredFreezeWhere.id).toBeUndefined();
    });

    // Curseur exact — le curseur borne le compteur de non-lus, il ne doit donc
    // jamais franchir un message que le participant n'a pas vu.

    it('exact mode: advances the read cursor only up to the contiguous read prefix', async () => {
      const msgA = '507f1f77bcf86cd799439021';
      const msgB = '507f1f77bcf86cd799439022';
      const msgC = '507f1f77bcf86cd799439023';
      mockPrisma.message.findFirst.mockResolvedValue({ id: msgC, createdAt: new Date('2025-01-03T00:00:00Z') });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: new Date('2024-12-01T00:00:00Z') });

      mockPrisma.message.findMany
        .mockResolvedValueOnce([{ id: msgA }, { id: msgC }])            // gel borné
        .mockResolvedValueOnce([{ id: msgA }, { id: msgB }, { id: msgC }]) // balayage du préfixe
        .mockResolvedValue([]);
      mockPrisma.messageStatusEntry.findMany
        .mockResolvedValueOnce([])                                       // gel : rien de figé
        .mockResolvedValueOnce([{ messageId: msgA }, { messageId: msgC }]) // A et C lus, B non
        .mockResolvedValue([]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, undefined, {
        messageIds: [msgA, msgC]
      });

      // C a bien été lu et figé, mais B ne l'a pas été : le curseur s'arrête à A.
      const readAdvance = mockPrisma.conversationReadCursor.updateMany.mock.calls.find(
        (c: any) => c[0].data?.lastReadMessageId !== undefined
      );
      expect(readAdvance[0].data.lastReadMessageId).toBe(msgA);
    });

    it('exact mode: leaves the read cursor untouched when the very next message is unread', async () => {
      const msgA = '507f1f77bcf86cd799439021';
      const msgB = '507f1f77bcf86cd799439022';
      mockPrisma.message.findFirst.mockResolvedValue({ id: msgB, createdAt: new Date('2025-01-02T00:00:00Z') });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: new Date('2024-12-01T00:00:00Z') });

      mockPrisma.message.findMany
        .mockResolvedValueOnce([{ id: msgB }])
        .mockResolvedValueOnce([{ id: msgA }, { id: msgB }])
        .mockResolvedValue([]);
      mockPrisma.messageStatusEntry.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ messageId: msgB }]) // A jamais affiché
        .mockResolvedValue([]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, undefined, {
        messageIds: [msgB]
      });

      // Sauter au bas d'une conversation ne vide pas le badge : A reste non lu.
      const readAdvance = mockPrisma.conversationReadCursor.updateMany.mock.calls.find(
        (c: any) => c[0].data?.lastReadMessageId !== undefined
      );
      expect(readAdvance).toBeUndefined();
      // Le message affiché est malgré tout figé comme lu.
      expect(mockPrisma.messageStatusEntry.createMany).toHaveBeenCalled();
    });

    it('exact mode: read still implies delivered when no cursor exists yet and the read cursor stays put', async () => {
      // Régression « lu mais pas livré » (état impossible) : un participant sans
      // aucun ConversationReadCursor (jamais livré — hors ligne à l'arrivée)
      // saute au bas de la conversation et ne rapporte QUE msgB. msgA reste non
      // lu, donc le curseur de lecture ne bouge pas (cursorTarget === null) et
      // n'est jamais créé. Le gel « lu implique livré » DOIT malgré tout créer le
      // curseur de livraison — sinon msgB porte un readAt figé sans deliveredAt,
      // et l'auteur voit la coche « lu » devant la coche « livré ».
      const msgA = '507f1f77bcf86cd799439021';
      const msgB = '507f1f77bcf86cd799439022';
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      // Aucun curseur → l'avance gardée ne matche rien.
      mockPrisma.conversationReadCursor.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.conversationReadCursor.create.mockResolvedValue({});

      mockPrisma.message.findMany
        .mockResolvedValueOnce([{ id: msgB }])                  // gel readAt borné à msgB
        .mockResolvedValueOnce([{ id: msgA }, { id: msgB }])    // balayage du préfixe : A précède B
        .mockResolvedValueOnce([{ id: msgB }])                  // gel deliveredAt (fenêtre)
        .mockResolvedValue([]);
      mockPrisma.messageStatusEntry.findMany
        .mockResolvedValueOnce([])                              // gel readAt : rien de figé
        .mockResolvedValueOnce([{ messageId: msgB }])           // A jamais affiché → préfixe vide → cursorTarget null
        .mockResolvedValueOnce([])                              // gel deliveredAt : rien de figé
        .mockResolvedValue([]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, msgB, {
        messageIds: [msgB]
      });

      // Le curseur de lecture ne bouge pas (A reste non lu)…
      const readAdvance = mockPrisma.conversationReadCursor.updateMany.mock.calls.find(
        (c: any) => c[0].data?.lastReadMessageId !== undefined
      );
      expect(readAdvance).toBeUndefined();
      // …mais le curseur de livraison est bel et bien CRÉÉ, sinon « lu > livré ».
      expect(mockPrisma.conversationReadCursor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastDeliveredMessageId: msgB })
        })
      );
      // Et le deliveredAt est figé par message pour msgB.
      const deliveredFreeze = mockPrisma.messageStatusEntry.createMany.mock.calls.find(
        (c: any) => Array.isArray(c[0]?.data) && c[0].data.some((d: any) => d.deliveredAt)
      );
      expect(deliveredFreeze).toBeDefined();
    });

    it('exact mode: two successive batches are both applied (dedup must not swallow the second)', async () => {
      const msgA = '507f1f77bcf86cd799439021';
      const msgB = '507f1f77bcf86cd799439022';
      // Le message le plus récent est le MÊME pour les deux lots : une clé de
      // dédup fondée sur lui seul avalerait silencieusement le second lot.
      mockPrisma.message.findFirst.mockResolvedValue({ id: msgB, createdAt: new Date('2025-01-02T00:00:00Z') });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: new Date('2024-12-01T00:00:00Z') });
      mockPrisma.message.findMany.mockResolvedValue([{ id: msgA }]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, undefined, { messageIds: [msgA] });
      const afterFirst = mockPrisma.messageStatusEntry.createMany.mock.calls.length;

      mockPrisma.message.findMany.mockResolvedValue([{ id: msgB }]);
      await service.markMessagesAsRead(testParticipantId, testConversationId, undefined, { messageIds: [msgB] });

      expect(mockPrisma.messageStatusEntry.createMany.mock.calls.length).toBeGreaterThan(afterFirst);
    });

    it('should set readAt on a delivery-created entry without overwriting deliveredAt (write-once)', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId, createdAt: new Date('2025-01-01T00:00:00Z') });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }]);
      // Entry already exists from delivery: deliveredAt set, readAt still null.
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        { messageId: testMessageId, deliveredAt: new Date('2025-01-01T00:00:01Z'), readAt: null }
      ]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      // No create (entry exists); update only the null readAt field.
      expect(mockPrisma.messageStatusEntry.createMany).not.toHaveBeenCalled();
      expect(mockPrisma.messageStatusEntry.updateMany).toHaveBeenCalledWith({
        where: { messageId: { in: [testMessageId] }, participantId: testParticipantId, readAt: null },
        data: { readAt: expect.any(Date) }
      });
    });

    it('should not re-freeze a message whose readAt is already set (write-once)', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId, createdAt: new Date('2025-01-01T00:00:00Z') });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        { messageId: testMessageId, deliveredAt: new Date('2025-01-01T00:00:01Z'), readAt: new Date('2025-01-02T00:00:00Z') }
      ]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      expect(mockPrisma.messageStatusEntry.createMany).not.toHaveBeenCalled();
      expect(mockPrisma.messageStatusEntry.updateMany).not.toHaveBeenCalled();
    });

    it('read implies delivered: also advances the delivery cursor to the read message', async () => {
      // Recipient opens a conversation whose newest message was never delivered
      // to them (they were offline when it arrived, so no delivery receipt ran).
      // Reading it must NOT leave the delivery frontier behind the read frontier —
      // read strictly implies delivered. Otherwise the sender sees the "read"
      // tick ahead of the "delivered" tick (readCount 1, deliveredCount 0), an
      // impossible state.
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId, createdAt: new Date('2025-01-01T00:00:00Z') });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({ lastReadAt: new Date('2024-12-01'), lastDeliveredAt: null });
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      // The delivery cursor is advanced to the same message, not just the read cursor.
      expect(mockPrisma.conversationReadCursor.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lastDeliveredMessageId: testMessageId,
            lastDeliveredAt: expect.any(Date)
          })
        })
      );
    });

    it('read implies delivered: frozen status entries carry deliveredAt/receivedAt, not readAt alone', async () => {
      // A read-without-prior-delivery must still stamp deliveredAt/receivedAt on
      // the per-message status entry, so getMessageStatusDetails lists the reader
      // under BOTH the "delivered" and "read" filters (never read-only).
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId, createdAt: new Date('2025-01-01T00:00:00Z') });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.findMany.mockResolvedValue([{ id: testMessageId }]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      const createStampsDelivered = mockPrisma.messageStatusEntry.createMany.mock.calls
        .flatMap((call: any[]) => call[0].data)
        .some((row: any) => row.deliveredAt != null && row.receivedAt != null);
      const updateStampsDelivered = mockPrisma.messageStatusEntry.updateMany.mock.calls
        .some((call: any[]) => call[0]?.data && 'deliveredAt' in call[0].data);
      expect(createStampsDelivered || updateStampsDelivered).toBe(true);
    });

    it('should sync notifications when marking as read', async () => {
      const mockMessage = { id: testMessageId, createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      // Notification sync happens after main operation (logged via enhancedLogger)
      expect(mockPrisma.conversationReadCursor.updateMany).toHaveBeenCalled();
    });
  });

  // ==============================================
  // DEDUP KEY REFLECTS THE RESOLVED MESSAGE (regression)
  // ==============================================
  //
  // The 2s dedup gate must key on the ACTUAL newest message, not the constant
  // string "latest". When a caller omits latestMessageId, resolving the newest
  // message has to happen BEFORE the dedup check — otherwise two argument-less
  // calls that resolve to DIFFERENT newest messages collide on one key and the
  // second is silently dropped, stalling the read/delivery advance for up to
  // the full TTL even though a genuinely newer message arrived in between.

  describe('dedup key reflects the resolved latest message (regression)', () => {
    it('markMessagesAsRead advances to a newer message after an argument-less mark deduped, when a newer message arrived', async () => {
      // 1st argument-less mark resolves latest = testMessageId and advances.
      mockPrisma.message.findFirst.mockResolvedValueOnce({ id: testMessageId, createdAt: new Date('2025-01-01') });
      await service.markMessagesAsRead(testParticipantId, testConversationId);

      // A newer message arrives; a 2nd argument-less mark (well within the 2s
      // TTL) now resolves latest = testMessageId2. It MUST NOT be swallowed by
      // the dedup gate, because its resolved key differs from the first call's.
      mockPrisma.message.findFirst.mockResolvedValueOnce({ id: testMessageId2, createdAt: new Date('2025-01-02') });
      await service.markMessagesAsRead(testParticipantId, testConversationId);

      expect(mockPrisma.message.findFirst).toHaveBeenCalledTimes(2);
      expect(mockPrisma.conversationReadCursor.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastReadMessageId: testMessageId2 })
        })
      );
    });

    it('markMessagesAsRead still dedups a repeat argument-less mark that resolves the SAME latest message', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId, createdAt: new Date('2025-01-01') });

      await service.markMessagesAsRead(testParticipantId, testConversationId);
      await service.markMessagesAsRead(testParticipantId, testConversationId);

      // Second call resolves the same newest message → same key → deduped: the
      // first mark runs both cursor advances (read + read-implies-delivered),
      // the deduped second mark adds none.
      expect(mockPrisma.conversationReadCursor.updateMany).toHaveBeenCalledTimes(2);
    });

    it('markMessagesAsReceived advances to a newer message after an argument-less mark deduped, when a newer message arrived', async () => {
      mockPrisma.message.findFirst.mockResolvedValueOnce({ id: testMessageId, createdAt: new Date('2025-01-01') });
      await service.markMessagesAsReceived(testParticipantId, testConversationId);

      mockPrisma.message.findFirst.mockResolvedValueOnce({ id: testMessageId2, createdAt: new Date('2025-01-02') });
      await service.markMessagesAsReceived(testParticipantId, testConversationId);

      expect(mockPrisma.message.findFirst).toHaveBeenCalledTimes(2);
      expect(mockPrisma.conversationReadCursor.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastDeliveredMessageId: testMessageId2 })
        })
      );
    });
  });

  // ==============================================
  // DEDUP KEY RELEASED ON FAILURE (regression)
  // ==============================================
  //
  // The 2s dedup gate stamps its key with `now` BEFORE the cursor write runs.
  // If that write throws (transient DB error), the key must be released so a
  // retry within the TTL can actually record the receipt — otherwise the gate
  // swallows every retry until the window expires and the delivery/read tick
  // is silently lost. Burst-dedup on the SUCCESS path is unchanged: the key
  // is only released when the operation threw.

  describe('dedup key is released when the cursor write fails (regression)', () => {
    it('markMessagesAsRead retries the advance after a transient failure instead of being suppressed by the dedup gate', async () => {
      // First advance attempt throws (transient DB error); the mark rejects.
      mockPrisma.conversationReadCursor.updateMany.mockRejectedValueOnce(
        new Error('transient db error')
      );

      await expect(
        service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId)
      ).rejects.toThrow('transient db error');

      // A retry for the SAME message, well within the 2s TTL, must reach the DB
      // again — nothing was recorded by the failed attempt. Without releasing
      // the poisoned dedup key, this retry would be swallowed at the gate.
      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      const readAdvanceCalls = mockPrisma.conversationReadCursor.updateMany.mock.calls.filter(
        ([arg]: [{ data?: { lastReadMessageId?: string } }]) =>
          arg?.data?.lastReadMessageId === testMessageId
      );
      // Two read-cursor advances: the failed original + the successful retry.
      expect(readAdvanceCalls).toHaveLength(2);
    });

    it('markMessagesAsReceived retries the advance after a transient failure instead of being suppressed by the dedup gate', async () => {
      mockPrisma.conversationReadCursor.updateMany.mockRejectedValueOnce(
        new Error('transient db error')
      );

      await expect(
        service.markMessagesAsReceived(testParticipantId, testConversationId, testMessageId)
      ).rejects.toThrow('transient db error');

      await service.markMessagesAsReceived(testParticipantId, testConversationId, testMessageId);

      const deliveredAdvanceCalls = mockPrisma.conversationReadCursor.updateMany.mock.calls.filter(
        ([arg]: [{ data?: { lastDeliveredMessageId?: string } }]) =>
          arg?.data?.lastDeliveredMessageId === testMessageId
      );
      expect(deliveredAdvanceCalls).toHaveLength(2);
    });

    it('markMessagesAsRead still dedups a successful mark repeated within the TTL (success path unchanged)', async () => {
      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);
      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      const readAdvanceCalls = mockPrisma.conversationReadCursor.updateMany.mock.calls.filter(
        ([arg]: [{ data?: { lastReadMessageId?: string } }]) =>
          arg?.data?.lastReadMessageId === testMessageId
      );
      // The first mark advances; the second is deduped and adds nothing.
      expect(readAdvanceCalls).toHaveLength(1);
    });
  });

  // ==============================================
  // GET MESSAGE READ STATUS TESTS
  // ==============================================

  describe('getMessageReadStatus', () => {
    it('should return detailed read status for a message using cursors', async () => {
      const messageCreatedAt = new Date('2025-01-01T10:00:00Z');
      const mockMessage = {
        id: testMessageId,
        createdAt: messageCreatedAt,
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId
      };

      const mockMembers = [
        { id: testParticipantId, displayName: 'User1' },
        { id: testParticipantId2, displayName: 'User2' }
      ];

      // Cursors with lastDeliveredAt and lastReadAt >= message.createdAt
      const mockCursors = [
        {
          participantId: testParticipantId2,
          lastDeliveredAt: new Date('2025-01-01T10:05:00Z'),
          lastReadAt: new Date('2025-01-01T10:10:00Z'),
          participant: { id: testParticipantId2, displayName: 'User2' }
        }
      ];

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.participant.findMany.mockResolvedValue(mockMembers);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue(mockCursors);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.messageId).toBe(testMessageId);
      expect(result.totalMembers).toBe(1); // 2 members - 1 sender = 1
      expect(result.receivedCount).toBe(1);
      expect(result.readCount).toBe(1);
      expect(result.receivedBy).toHaveLength(1);
      expect(result.readBy).toHaveLength(1);
    });

    it('should throw error when message not found', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(null);

      await expect(
        service.getMessageReadStatus('nonexistent-id', testConversationId)
      ).rejects.toThrow('Message nonexistent-id not found');
    });

    it('should exclude sender from counts using cursor-based approach', async () => {
      const messageCreatedAt = new Date('2025-01-01T10:00:00Z');
      const mockMessage = {
        id: testMessageId,
        createdAt: messageCreatedAt,
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId
      };

      const mockMembers = [
        { id: testParticipantId, displayName: 'User1' },
        { id: testParticipantId2, displayName: 'User2' }
      ];

      // Cursor for non-sender user with timestamps >= message.createdAt
      const mockCursors = [
        {
          participantId: testParticipantId2,
          lastDeliveredAt: new Date('2025-01-01T10:05:00Z'),
          lastReadAt: new Date('2025-01-01T10:10:00Z'),
          participant: { id: testParticipantId2, displayName: 'User2' }
        }
      ];

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.participant.findMany.mockResolvedValue(mockMembers);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue(mockCursors);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      // Should only count non-sender users
      expect(result.receivedCount).toBe(1);
      expect(result.readCount).toBe(1);
      expect(result.receivedBy[0].participantId).toBe(testParticipantId2);
    });

    // Regression: a cursor whose participant has been deleted/banned/marked
    // inactive must be silently skipped instead of crashing the endpoint.
    // Production was returning HTTP 500 with
    //   PrismaClientUnknownRequestError: Inconsistent query result: Field
    //   participant is required to return data, got `null` instead
    // before we stopped relying on a strict `include` and started joining
    // participants in JS.
    it('should skip cursors whose participant no longer exists or is inactive', async () => {
      const messageCreatedAt = new Date('2025-01-01T10:00:00Z');
      const mockMessage = {
        id: testMessageId,
        createdAt: messageCreatedAt,
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId
      };

      // Only User2 is active; orphan-cursor participant ID has no matching row.
      const mockMembers = [
        { id: testParticipantId, displayName: 'User1', avatar: null, user: null },
        { id: testParticipantId2, displayName: 'User2', avatar: 'av2.jpg', user: null }
      ];

      const mockCursors = [
        // Valid cursor — User2
        {
          participantId: testParticipantId2,
          lastDeliveredAt: new Date('2025-01-01T10:05:00Z'),
          lastReadAt: new Date('2025-01-01T10:10:00Z'),
        },
        // Orphan cursor — points at a participant that no longer exists
        {
          participantId: 'orphan-participant-id',
          lastDeliveredAt: new Date('2025-01-01T10:05:00Z'),
          lastReadAt: new Date('2025-01-01T10:10:00Z'),
        }
      ];

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.participant.findMany.mockResolvedValue(mockMembers);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue(mockCursors);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      // Orphan cursor must be skipped, not throw
      expect(result.receivedCount).toBe(1);
      expect(result.readCount).toBe(1);
      expect(result.receivedBy).toHaveLength(1);
      expect(result.readBy).toHaveLength(1);
      expect(result.receivedBy[0].participantId).toBe(testParticipantId2);
      expect(result.receivedBy[0].avatarURL).toBe('av2.jpg');
    });

    // Regression — "status-management-inconsistency" (2026-06).
    // The cursor `lastReadAt`/`lastDeliveredAt` re-advances to "now" every time
    // a participant re-opens the conversation, so deriving per-message receipt
    // times from it shows the participant's LAST VISIT, not when they actually
    // read THIS message. The frozen write-once `MessageStatusEntry` is the
    // precise per-message time and MUST win — matching getMessageStatusDetails.
    it('should prefer frozen per-message status times over the drifted cursor', async () => {
      const messageCreatedAt = new Date('2025-01-01T10:00:00Z');
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        createdAt: messageCreatedAt,
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId,
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId, displayName: 'User1', avatar: null, user: null },
        { id: testParticipantId2, displayName: 'User2', avatar: 'av2.jpg', user: null },
      ]);
      // Cursor has drifted forward to a later re-open of the conversation.
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        {
          participantId: testParticipantId2,
          lastDeliveredAt: new Date('2025-01-01T15:00:00Z'),
          lastReadAt: new Date('2025-01-01T15:30:00Z'),
        },
      ]);
      // But User2 actually received/read THIS message much earlier — frozen.
      const frozenDelivered = new Date('2025-01-01T10:05:00Z');
      const frozenRead = new Date('2025-01-01T10:10:00Z');
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        {
          participantId: testParticipantId2,
          deliveredAt: frozenDelivered,
          receivedAt: frozenDelivered,
          readAt: frozenRead,
        },
      ]);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.receivedBy[0].receivedAt).toEqual(frozenDelivered);
      expect(result.readBy[0].readAt).toEqual(frozenRead);
    });

    // Edge case: `cleanupObsoleteCursors` deletes a participant's cursor when its
    // `lastReadMessageId` points at a now-deleted message. The write-once frozen
    // `MessageStatusEntry` for OTHER (still-live) messages survives that cleanup.
    // The receipt must still surface from the frozen entry — enumerating only via
    // cursors would silently drop it.
    it('should still surface a frozen receipt when the participant cursor was deleted by cleanup', async () => {
      const messageCreatedAt = new Date('2025-01-01T10:00:00Z');
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        createdAt: messageCreatedAt,
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId,
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId, displayName: 'User1', avatar: null, user: null },
        { id: testParticipantId2, displayName: 'User2', avatar: 'av2.jpg', user: null },
      ]);
      // Cursor removed by cleanupObsoleteCursors — none remain.
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      // But the frozen write-once receipt for THIS message survived.
      const frozenDelivered = new Date('2025-01-01T10:05:00Z');
      const frozenRead = new Date('2025-01-01T10:10:00Z');
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        {
          participantId: testParticipantId2,
          deliveredAt: frozenDelivered,
          receivedAt: frozenDelivered,
          readAt: frozenRead,
        },
      ]);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.receivedBy).toHaveLength(1);
      expect(result.receivedBy[0].participantId).toBe(testParticipantId2);
      expect(result.receivedBy[0].receivedAt).toEqual(frozenDelivered);
      expect(result.readBy).toHaveLength(1);
      expect(result.readBy[0].readAt).toEqual(frozenRead);
      // The participant is accounted as seen, not "not seen".
      expect(result.notSeenCount).toBe(0);
    });

    // Regression: the `notSeenBy` list must resolve avatars with the SAME rule as
    // `receivedBy`/`readBy` — participant-local avatar first, then the linked user
    // avatar. A participant with only a local avatar (no `user.avatar`) was showing
    // `null` in `notSeenBy` while showing its photo in the other lists for the SAME
    // message. Source of truth: resolveParticipantAvatar (@meeshy/shared).
    it('should resolve the participant-local avatar in notSeenBy, consistent with the other lists', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        createdAt: new Date('2025-01-01T10:00:00Z'),
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId,
      });
      // User2 has a local participant avatar but no linked user avatar, and has not
      // seen the message (no cursor, not the sender) → lands in notSeenBy.
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId, displayName: 'User1', avatar: null, user: null },
        { id: testParticipantId2, displayName: 'User2', avatar: 'local.jpg', user: null },
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.notSeenBy).toHaveLength(1);
      expect(result.notSeenBy[0].participantId).toBe(testParticipantId2);
      expect(result.notSeenBy[0].avatarURL).toBe('local.jpg');
    });

    it('should expose per-participant media consumption positions for the message attachments', async () => {
      const messageCreatedAt = new Date('2025-01-01T10:00:00Z');
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        createdAt: messageCreatedAt,
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId,
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId, displayName: 'User1', avatar: null, user: null },
        { id: testParticipantId2, displayName: 'User2', avatar: 'av2.jpg', user: null },
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      // User2 listened to ~45s of the audio attachment, not yet complete.
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([
        {
          attachmentId: testAttachmentId,
          participantId: testParticipantId2,
          lastPlayPositionMs: 45000,
          listenedComplete: false,
          lastWatchPositionMs: null,
          watchedComplete: false,
        },
      ]);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      // Query is scoped to this message — AUTHOR INCLUDED (user 2026-08-18 :
      // « remonter les lectures de l'audio même si c'est l'auteur qui le
      // lit »). L'ancien filtre `participantId: { not: senderId }` cachait
      // les écoutes de l'auteur dans la feuille « Vues ».
      expect(mockPrisma.attachmentStatusEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { messageId: testMessageId },
        })
      );
      expect(result.attachmentConsumption).toHaveLength(1);
      expect(result.attachmentConsumption[0]).toEqual({
        attachmentId: testAttachmentId,
        participants: [
          {
            participantId: testParticipantId2,
            displayName: 'User2',
            avatarURL: 'av2.jpg',
            lastPlayPositionMs: 45000,
            listenedComplete: false,
            lastWatchPositionMs: null,
            watchedComplete: false,
            listenCoverage: [],
            watchCoverage: [],
            listenStretchCount: 0,
            watchStretchCount: 0,
            viewCount: 0,
            viewedLanguages: [],
          },
        ],
        languageBreakdown: [],
      });
    });

    // user 2026-08-18 : « il faut remonter les lectures de l'audio même si
    // c'est l'auteur qui le lit » — l'écoute de l'AUTEUR sur son propre
    // vocal apparaît dans attachmentConsumption comme celle de n'importe
    // quel participant.
    it('surfaces the AUTHOR own listen in attachmentConsumption', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        createdAt: new Date('2025-01-01T10:00:00Z'),
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId,
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId, displayName: 'Auteur', avatar: null, user: null },
        { id: testParticipantId2, displayName: 'User2', avatar: null, user: null },
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      // L'auteur a réécouté son propre vocal en entier.
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([
        {
          attachmentId: testAttachmentId,
          participantId: testParticipantId,
          lastPlayPositionMs: 62000,
          listenedComplete: true,
          lastWatchPositionMs: null,
          watchedComplete: false,
        },
      ]);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.attachmentConsumption).toHaveLength(1);
      expect(result.attachmentConsumption[0].participants).toHaveLength(1);
      expect(result.attachmentConsumption[0].participants[0].participantId).toBe(testParticipantId);
      expect(result.attachmentConsumption[0].participants[0].listenedComplete).toBe(true);
    });

    // ── Enrichissements du lot 2 ─────────────────────────────────────────

    it('dit dans quelle langue chaque lecteur a lu le message', async () => {
      const readAt = new Date('2025-01-01T10:05:00Z');
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        createdAt: new Date('2025-01-01T10:00:00Z'),
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId,
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId, displayName: 'Sender', avatar: null, user: null },
        { id: testParticipantId2, displayName: 'Bob', avatar: null, user: null },
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        {
          participantId: testParticipantId2,
          deliveredAt: readAt,
          receivedAt: readAt,
          readAt,
          viewedLanguages: ['fr', 'en'],
        },
      ]);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.readBy[0].viewedLanguages).toEqual(['fr', 'en']);
      // Un lecteur qui a basculé compte dans CHAQUE version : la somme des
      // compteurs peut dépasser `readCount`, et c'est exact.
      expect(result.languageBreakdown).toEqual([
        { language: 'en', count: 1 },
        { language: 'fr', count: 1 },
      ]);
      expect(result.readCount).toBe(1);
    });

    it('rend une répartition vide quand aucun client ne rapporte sa langue', async () => {
      const readAt = new Date('2025-01-01T10:05:00Z');
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        createdAt: new Date('2025-01-01T10:00:00Z'),
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId,
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId, displayName: 'Sender', avatar: null, user: null },
        { id: testParticipantId2, displayName: 'Bob', avatar: null, user: null },
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        { participantId: testParticipantId2, deliveredAt: readAt, receivedAt: readAt, readAt, viewedLanguages: [] },
      ]);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.readBy[0].viewedLanguages).toEqual([]);
      expect(result.languageBreakdown).toEqual([]);
    });

    it('résume la consommation par la couverture, pas par le point d\'arrêt', async () => {
      // `lastPlayPositionMs` ne dit que là où le lecteur s'est arrêté : celui
      // qui saute au générique est indistinguable de celui qui a tout écouté.
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        createdAt: new Date('2025-01-01T10:00:00Z'),
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId,
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId, displayName: 'User1', avatar: null, user: null },
        { id: testParticipantId2, displayName: 'User2', avatar: null, user: null },
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([
        {
          attachmentId: testAttachmentId,
          participantId: testParticipantId2,
          lastPlayPositionMs: 9500,
          listenedComplete: false,
          lastWatchPositionMs: null,
          watchedComplete: false,
          // Il a écouté le début, puis sauté à la fin : deux écoutes, une
          // couverture trouée, un point d'arrêt qui ment.
          listenSegments: [
            { startMs: 0, endMs: 1000, endedBy: 'seek' },
            { startMs: 9000, endMs: 9500, endedBy: 'pause' },
          ],
          watchSegments: null,
          viewCount: 0,
          viewedLanguages: [],
        },
      ]);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);
      const consumer = result.attachmentConsumption[0].participants[0];

      expect(consumer.listenStretchCount).toBe(2);
      expect(consumer.listenCoverage).toEqual([
        { startMs: 0, endMs: 1000 },
        { startMs: 9000, endMs: 9500 },
      ]);
    });

    it('remonte une image ouverte plusieurs fois, sans piste de lecture', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        createdAt: new Date('2025-01-01T10:00:00Z'),
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId,
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId, displayName: 'User1', avatar: null, user: null },
        { id: testParticipantId2, displayName: 'User2', avatar: null, user: null },
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([
        {
          attachmentId: testAttachmentId,
          participantId: testParticipantId2,
          lastPlayPositionMs: null,
          listenedComplete: false,
          lastWatchPositionMs: null,
          watchedComplete: false,
          listenSegments: null,
          watchSegments: null,
          viewCount: 3,
          viewedLanguages: [],
        },
      ]);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.attachmentConsumption[0].participants[0].viewCount).toBe(3);
    });

    it('répartit les consommateurs du média par langue', async () => {
      const thirdParticipantId = '507f1f77bcf86cd799439099';
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        createdAt: new Date('2025-01-01T10:00:00Z'),
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId,
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId, displayName: 'Sender', avatar: null, user: null },
        { id: testParticipantId2, displayName: 'Bob', avatar: null, user: null },
        { id: thirdParticipantId, displayName: 'Carol', avatar: null, user: null },
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([
        {
          attachmentId: testAttachmentId,
          participantId: testParticipantId2,
          lastPlayPositionMs: 1000,
          listenedComplete: false,
          lastWatchPositionMs: null,
          watchedComplete: false,
          listenSegments: null,
          watchSegments: null,
          viewCount: 0,
          viewedLanguages: ['fr'],
        },
        {
          attachmentId: testAttachmentId,
          participantId: thirdParticipantId,
          lastPlayPositionMs: 2000,
          listenedComplete: true,
          lastWatchPositionMs: null,
          watchedComplete: false,
          listenSegments: null,
          watchSegments: null,
          viewCount: 0,
          // Carol a basculé : les deux versions comptent.
          viewedLanguages: ['fr', 'en'],
        },
      ]);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.attachmentConsumption[0].languageBreakdown).toEqual([
        { language: 'fr', count: 2 },
        { language: 'en', count: 1 },
      ]);
    });

    it('should group multiple participants under the same attachment', async () => {
      const thirdParticipantId = '507f1f77bcf86cd799439099';
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        createdAt: new Date('2025-01-01T10:00:00Z'),
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId,
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId, displayName: 'Sender', avatar: null, user: null },
        { id: testParticipantId2, displayName: 'Bob', avatar: null, user: null },
        { id: thirdParticipantId, displayName: 'Carol', avatar: null, user: null },
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([
        {
          attachmentId: testAttachmentId,
          participantId: testParticipantId2,
          lastPlayPositionMs: null,
          listenedComplete: true,
          lastWatchPositionMs: null,
          watchedComplete: false,
        },
        {
          attachmentId: testAttachmentId,
          participantId: thirdParticipantId,
          lastPlayPositionMs: 12000,
          listenedComplete: false,
          lastWatchPositionMs: null,
          watchedComplete: false,
        },
      ]);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.attachmentConsumption).toHaveLength(1);
      expect(result.attachmentConsumption[0].participants).toHaveLength(2);
      const byId = Object.fromEntries(
        result.attachmentConsumption[0].participants.map(p => [p.participantId, p])
      );
      expect(byId[testParticipantId2].listenedComplete).toBe(true);
      expect(byId[thirdParticipantId].lastPlayPositionMs).toBe(12000);
    });

    it('should skip consumption rows with no audio/video signal (download/image-only)', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        createdAt: new Date('2025-01-01T10:00:00Z'),
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId,
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId, displayName: 'Sender', avatar: null, user: null },
        { id: testParticipantId2, displayName: 'Bob', avatar: null, user: null },
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      // Bob downloaded but never played → no playback signal to surface.
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([
        {
          attachmentId: testAttachmentId,
          participantId: testParticipantId2,
          lastPlayPositionMs: null,
          listenedComplete: false,
          lastWatchPositionMs: null,
          watchedComplete: false,
        },
      ]);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.attachmentConsumption).toHaveLength(0);
    });

    it('should skip consumption rows whose participant no longer exists', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        createdAt: new Date('2025-01-01T10:00:00Z'),
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId,
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId, displayName: 'Sender', avatar: null, user: null },
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([
        {
          attachmentId: testAttachmentId,
          participantId: 'orphan-participant-id',
          lastPlayPositionMs: 5000,
          listenedComplete: false,
          lastWatchPositionMs: null,
          watchedComplete: false,
        },
      ]);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.attachmentConsumption).toHaveLength(0);
    });

    it('should return an empty consumption list when there are no attachment status rows', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        createdAt: new Date('2025-01-01T10:00:00Z'),
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId,
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId, displayName: 'Sender', avatar: null, user: null },
        { id: testParticipantId2, displayName: 'Bob', avatar: null, user: null },
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([]);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.attachmentConsumption).toEqual([]);
    });
  });

  // ==============================================
  // AUDIO STATUS TESTS
  // ==============================================

  describe('markAudioAsListened', () => {
    it('should create/update attachment status for audio', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'audio/mp3',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      // Mock for updateAttachmentComputedStatus
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ listenedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markAudioAsListened(testParticipantId, testAttachmentId, {
        playPositionMs: 5000,
        listenDurationMs: 10000,
        complete: false
      });

      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledWith({
        where: {
          attachment_participant_status: { attachmentId: testAttachmentId, participantId: testParticipantId }
        },
        create: expect.objectContaining({
          attachmentId: testAttachmentId,
          messageId: testMessageId,
          participantId: testParticipantId,
          listenedAt: expect.any(Date),
          listenCount: 1,
          lastPlayPositionMs: 5000,
          totalListenDurationMs: 10000,
          listenedComplete: false
        }),
        update: expect.objectContaining({
          listenedAt: expect.any(Date),
          listenCount: { increment: 1 }
        })
      });
    });

    it('should throw error when attachment not found', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      await expect(
        service.markAudioAsListened(testParticipantId, 'nonexistent')
      ).rejects.toThrow('Attachment nonexistent not found');
    });

    it('should track listen completion', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'audio/mp3',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ listenedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markAudioAsListened(testParticipantId, testAttachmentId, { complete: true });

      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ listenedComplete: true }),
          update: expect.objectContaining({ listenedComplete: true })
        })
      );
    });
  });

  // ==============================================
  // TRACE DE L'INTERACTION ET PRISME LINGUISTIQUE
  // ==============================================

  describe('Trace de l\'interaction média', () => {
    const anAudioAttachment = () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'audio/mp3',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ listenedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});
    };

    const lastUpsert = () =>
      mockPrisma.attachmentStatusEntry.upsert.mock.calls.at(-1)?.[0] as any;

    it('persiste la trace du premier rapport', async () => {
      anAudioAttachment();

      await service.markAudioAsListened(testParticipantId, testAttachmentId, {
        stretches: [{ startMs: 0, endMs: 500, endedBy: 'pause' }]
      });

      expect(lastUpsert().create.listenSegments).toEqual([
        { startMs: 0, endMs: 500, endedBy: 'pause' }
      ]);
    });

    it('ajoute à la suite de la trace déjà connue, sans la trier', async () => {
      anAudioAttachment();
      mockPrisma.attachmentStatusEntry.findUnique.mockResolvedValue({
        listenSegments: [{ startMs: 9000, endMs: 9500, endedBy: 'seek' }],
        viewedLanguages: []
      });

      await service.markAudioAsListened(testParticipantId, testAttachmentId, {
        stretches: [{ startMs: 0, endMs: 400, endedBy: 'pause' }]
      });

      expect(lastUpsert().update.listenSegments).toEqual([
        { startMs: 9000, endMs: 9500, endedBy: 'seek' },
        { startMs: 0, endMs: 400, endedBy: 'pause' }
      ]);
    });

    it('ne recompte pas une écoute re-postée par la file hors-ligne', async () => {
      anAudioAttachment();
      mockPrisma.attachmentStatusEntry.findUnique.mockResolvedValue({
        listenSegments: [{ startMs: 0, endMs: 500, endedBy: 'pause' }],
        viewedLanguages: []
      });

      await service.markAudioAsListened(testParticipantId, testAttachmentId, {
        stretches: [{ startMs: 0, endMs: 500, endedBy: 'pause' }]
      });

      expect(lastUpsert().update.listenSegments).toHaveLength(1);
    });

    it('écarte une écoute malformée sans perdre les valides', async () => {
      anAudioAttachment();

      await service.markAudioAsListened(testParticipantId, testAttachmentId, {
        stretches: [
          { startMs: 500, endMs: 100, endedBy: 'pause' },
          { startMs: 0, endMs: 300, endedBy: 'pause' }
        ]
      });

      expect(lastUpsert().create.listenSegments).toEqual([
        { startMs: 0, endMs: 300, endedBy: 'pause' }
      ]);
    });

    it('sépare la trace vidéo de la trace audio', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'video/mp4',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ watchedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markVideoAsWatched(testParticipantId, testAttachmentId, {
        stretches: [{ startMs: 0, endMs: 800, endedBy: 'completed' }]
      });

      expect(lastUpsert().create.watchSegments).toEqual([
        { startMs: 0, endMs: 800, endedBy: 'completed' }
      ]);
      expect(lastUpsert().create.listenSegments).toBeUndefined();
    });

    it('compte les ouvertures d\'une image', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'image/png',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ viewedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markImageAsViewed(testParticipantId, testAttachmentId, {});

      expect(lastUpsert().create.viewCount).toBe(1);
      expect(lastUpsert().update.viewCount).toEqual({ increment: 1 });
    });
  });

  describe('recordMessageLanguageView — bascule sur une bulle', () => {
    it('ajoute la langue à l\'entrée du message', async () => {
      mockPrisma.messageStatusEntry.findFirst.mockResolvedValue({
        id: 'entry1',
        viewedLanguages: ['fr']
      });

      await service.recordMessageLanguageView(testParticipantId, testMessageId, 'en');

      expect(mockPrisma.messageStatusEntry.update).toHaveBeenCalledWith({
        where: { id: 'entry1' },
        data: { viewedLanguages: { push: 'en' } }
      });
    });

    it('ne recrée pas une entrée absente — un choix de langue n\'est pas une lecture', async () => {
      mockPrisma.messageStatusEntry.findFirst.mockResolvedValue(null);

      await service.recordMessageLanguageView(testParticipantId, testMessageId, 'en');

      expect(mockPrisma.messageStatusEntry.update).not.toHaveBeenCalled();
    });

    it('n\'écrit pas une langue déjà présente', async () => {
      mockPrisma.messageStatusEntry.findFirst.mockResolvedValue({
        id: 'entry1',
        viewedLanguages: ['fr', 'en']
      });

      await service.recordMessageLanguageView(testParticipantId, testMessageId, 'en-GB');

      expect(mockPrisma.messageStatusEntry.update).not.toHaveBeenCalled();
    });

    it('ignore une langue illisible sans interroger la base', async () => {
      await service.recordMessageLanguageView(testParticipantId, testMessageId, '@@@');

      expect(mockPrisma.messageStatusEntry.findFirst).not.toHaveBeenCalled();
    });

    it('ne fait pas échouer la requête si la base tombe', async () => {
      mockPrisma.messageStatusEntry.findFirst.mockRejectedValue(new Error('DB down'));

      await expect(
        service.recordMessageLanguageView(testParticipantId, testMessageId, 'en')
      ).resolves.toBeUndefined();
    });
  });

  describe('Prisme linguistique — attachements', () => {
    const anAudioAttachment = () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'audio/mp3',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ listenedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});
    };

    const lastUpsert = () =>
      mockPrisma.attachmentStatusEntry.upsert.mock.calls.at(-1)?.[0] as any;

    it('retient la langue de la piste écoutée', async () => {
      anAudioAttachment();

      await service.markAudioAsListened(testParticipantId, testAttachmentId, {
        language: 'fr'
      });

      expect(lastUpsert().create.viewedLanguages).toEqual(['fr']);
    });

    it('accumule les bascules plutôt que de garder la dernière', async () => {
      anAudioAttachment();
      mockPrisma.attachmentStatusEntry.findUnique.mockResolvedValue({
        listenSegments: null,
        viewedLanguages: ['fr']
      });

      await service.markAudioAsListened(testParticipantId, testAttachmentId, {
        language: 'en'
      });

      expect(lastUpsert().update.viewedLanguages).toEqual(['fr', 'en']);
    });

    it('normalise la locale complète envoyée par iOS', async () => {
      anAudioAttachment();

      await service.markAudioAsListened(testParticipantId, testAttachmentId, {
        language: 'fr_FR'
      });

      expect(lastUpsert().create.viewedLanguages).toEqual(['fr']);
    });

    it('ignore une langue illisible sans perdre le reste du rapport', async () => {
      anAudioAttachment();

      await service.markAudioAsListened(testParticipantId, testAttachmentId, {
        language: '@@@',
        stretches: [{ startMs: 0, endMs: 500, endedBy: 'pause' }]
      });

      expect(lastUpsert().create.viewedLanguages).toEqual([]);
      expect(lastUpsert().create.listenSegments).toHaveLength(1);
    });
  });

  // ==============================================
  // VIDEO STATUS TESTS
  // ==============================================

  describe('markVideoAsWatched', () => {
    it('should create/update attachment status for video', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'video/mp4',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ watchedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markVideoAsWatched(testParticipantId, testAttachmentId, {
        watchPositionMs: 30000,
        watchDurationMs: 60000,
        complete: true
      });

      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledWith({
        where: {
          attachment_participant_status: { attachmentId: testAttachmentId, participantId: testParticipantId }
        },
        create: expect.objectContaining({
          watchedAt: expect.any(Date),
          watchCount: 1,
          lastWatchPositionMs: 30000,
          totalWatchDurationMs: 60000,
          watchedComplete: true
        }),
        update: expect.objectContaining({
          watchedAt: expect.any(Date),
          watchCount: { increment: 1 }
        })
      });
    });

    it('should throw error when attachment not found', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      await expect(
        service.markVideoAsWatched(testParticipantId, 'nonexistent')
      ).rejects.toThrow('Attachment nonexistent not found');
    });
  });

  // ==============================================
  // IMAGE STATUS TESTS
  // ==============================================

  describe('markImageAsViewed', () => {
    it('should create/update attachment status for image', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'image/jpeg',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ viewedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markImageAsViewed(testParticipantId, testAttachmentId, {
        viewDurationMs: 5000,
        wasZoomed: true
      });

      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledWith({
        where: {
          attachment_participant_status: { attachmentId: testAttachmentId, participantId: testParticipantId }
        },
        create: expect.objectContaining({
          viewedAt: expect.any(Date),
          viewDurationMs: 5000,
          wasZoomed: true
        }),
        update: expect.objectContaining({
          viewedAt: expect.any(Date),
          viewDurationMs: 5000,
          wasZoomed: true
        })
      });
    });

    it('should throw error when attachment not found', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      await expect(
        service.markImageAsViewed(testParticipantId, 'nonexistent')
      ).rejects.toThrow('Attachment nonexistent not found');
    });
  });

  // ==============================================
  // DOWNLOAD STATUS TESTS
  // ==============================================

  describe('markAttachmentAsDownloaded', () => {
    it('should create/update download status', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'application/pdf',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ downloadedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markAttachmentAsDownloaded(testParticipantId, testAttachmentId);

      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledWith({
        where: {
          attachment_participant_status: { attachmentId: testAttachmentId, participantId: testParticipantId }
        },
        create: expect.objectContaining({
          downloadedAt: expect.any(Date)
        }),
        update: expect.objectContaining({
          downloadedAt: expect.any(Date)
        })
      });
    });

    it('should throw error when attachment not found', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue(null);

      await expect(
        service.markAttachmentAsDownloaded(testParticipantId, 'nonexistent')
      ).rejects.toThrow('Attachment nonexistent not found');
    });
  });

  // ==============================================
  // GET ATTACHMENT STATUS TESTS
  // ==============================================

  describe('getAttachmentStatus', () => {
    it('should return full attachment status', async () => {
      mockPrisma.attachmentStatusEntry.findUnique.mockResolvedValue({
        viewedAt: new Date(),
        downloadedAt: new Date(),
        listenedAt: new Date(),
        watchedAt: null,
        listenCount: 3,
        watchCount: 0,
        listenedComplete: true,
        watchedComplete: false,
        lastPlayPositionMs: 10000,
        lastWatchPositionMs: null
      });

      const result = await service.getAttachmentStatus(testAttachmentId, testParticipantId);

      expect(result).toEqual({
        viewed: true,
        downloaded: true,
        listened: true,
        watched: false,
        listenCount: 3,
        watchCount: 0,
        listenedComplete: true,
        watchedComplete: false,
        lastPlayPositionMs: 10000,
        lastWatchPositionMs: null
      });
    });

    it('should return null when no status exists', async () => {
      mockPrisma.attachmentStatusEntry.findUnique.mockResolvedValue(null);

      const result = await service.getAttachmentStatus(testAttachmentId, testParticipantId);

      expect(result).toBeNull();
    });

    it('should return null on database error', async () => {
      mockPrisma.attachmentStatusEntry.findUnique.mockRejectedValue(new Error('DB error'));

      const result = await service.getAttachmentStatus(testAttachmentId, testParticipantId);

      expect(result).toBeNull();
      // Le service utilise maintenant enhancedLogger au lieu de console.error
    });
  });

  // ==============================================
  // GET CONVERSATION READ STATUSES TESTS
  // ==============================================

  describe('getConversationReadStatuses', () => {
    it('should return status map for multiple messages using cursors', async () => {
      const messageIds = [testMessageId, testMessageId2];
      const message1CreatedAt = new Date('2025-01-01T10:00:00Z');
      const message2CreatedAt = new Date('2025-01-01T11:00:00Z');

      // Mock messages with createdAt timestamps
      mockPrisma.message.findMany.mockResolvedValue([
        { id: testMessageId, createdAt: message1CreatedAt, senderId: 'sender-1' },
        { id: testMessageId2, createdAt: message2CreatedAt, senderId: 'sender-2' }
      ]);

      // Mock cursors: 2 users with different read/delivered timestamps
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        {
          participantId: testParticipantId,
          lastDeliveredAt: new Date('2025-01-01T12:00:00Z'), // After both messages
          lastReadAt: new Date('2025-01-01T12:00:00Z') // After both messages
        },
        {
          participantId: testParticipantId2,
          lastDeliveredAt: new Date('2025-01-01T10:30:00Z'), // After message1, before message2
          lastReadAt: null // Never read
        }
      ]);

      const result = await service.getConversationReadStatuses(testConversationId, messageIds);

      expect(result).toBeInstanceOf(Map);
      // message1: user1 delivered+read, user2 delivered only (but user2 is sender so excluded)
      // Actually sender is 'sender-1', so both testParticipantId and testParticipantId2 are counted
      // testParticipantId: delivered+read, testParticipantId2: delivered only
      expect(result.get(testMessageId)).toEqual(expect.objectContaining({ receivedCount: 2, readCount: 1 }));
      // message2: only testParticipantId delivered+read (testParticipantId2's delivered is before message2)
      expect(result.get(testMessageId2)).toEqual(expect.objectContaining({ receivedCount: 1, readCount: 1 }));
    });

    it('should return empty counts for messages without cursors', async () => {
      mockPrisma.message.findMany.mockResolvedValue([
        { id: testMessageId, createdAt: new Date(), senderId: 'sender-1' }
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);

      const result = await service.getConversationReadStatuses(testConversationId, [testMessageId]);

      expect(result.get(testMessageId)).toEqual(expect.objectContaining({ receivedCount: 0, readCount: 0 }));
    });

    // Parity with the single-message siblings (getMessageReadStatus /
    // getMessageStatusDetails), which enumerate the UNION of cursors + frozen
    // MessageStatusEntry rows. cleanupObsoleteCursors deletes a cursor whose
    // lastReadMessageId points at a now-deleted message but NEVER touches the
    // write-once frozen entry — so a valid delivery/read receipt survives its
    // cursor. This batch method must still count it, otherwise it under-reports
    // relative to the single-message endpoint for the exact same data.
    it('counts a frozen receipt whose cursor was deleted by cleanup (union parity)', async () => {
      const msgCreatedAt = new Date('2025-01-01T10:00:00Z');
      mockPrisma.message.findMany.mockResolvedValue([
        { id: testMessageId, createdAt: msgCreatedAt, senderId: 'sender-1' }
      ]);
      // Both recipients are active members.
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId },
        { id: testParticipantId2 }
      ]);
      // Only participant1 still has a cursor — participant2's was cleaned up.
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        {
          participantId: testParticipantId,
          lastDeliveredAt: new Date('2025-01-01T10:05:00Z'),
          lastReadAt: new Date('2025-01-01T10:06:00Z')
        }
      ]);
      // participant2's write-once frozen receipt for THIS message survived.
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        {
          messageId: testMessageId,
          participantId: testParticipantId2,
          deliveredAt: new Date('2025-01-01T10:04:00Z'),
          receivedAt: new Date('2025-01-01T10:04:00Z'),
          readAt: new Date('2025-01-01T10:07:00Z')
        }
      ]);

      const result = await service.getConversationReadStatuses(testConversationId, [testMessageId]);

      // Both recipients counted — identical to getMessageReadStatus for the same data.
      expect(result.get(testMessageId)).toEqual(
        expect.objectContaining({ receivedCount: 2, readCount: 2 })
      );
    });

    // A frozen entry for a participant who is no longer active must be ignored,
    // mirroring getMessageReadStatus's `if (!participant) continue` gate.
    it('ignores a frozen receipt from a participant who is no longer active', async () => {
      const msgCreatedAt = new Date('2025-01-01T10:00:00Z');
      mockPrisma.message.findMany.mockResolvedValue([
        { id: testMessageId, createdAt: msgCreatedAt, senderId: 'sender-1' }
      ]);
      // Only participant1 is still active.
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId }
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      // Frozen entry belongs to an inactive/removed participant2.
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        {
          messageId: testMessageId,
          participantId: testParticipantId2,
          deliveredAt: new Date('2025-01-01T10:04:00Z'),
          receivedAt: new Date('2025-01-01T10:04:00Z'),
          readAt: new Date('2025-01-01T10:07:00Z')
        }
      ]);

      const result = await service.getConversationReadStatuses(testConversationId, [testMessageId]);

      expect(result.get(testMessageId)).toEqual(
        expect.objectContaining({ receivedCount: 0, readCount: 0 })
      );
    });

    // ------------------------------------------------------------------
    // `deliveredToAllAt` / `readByAllAt` — les DATES du seuil « tous servis ».
    // Les colonnes homonymes de la ligne `Message` n'ont aucun écrivain
    // (`updateMessageComputedStatus` est un no-op assumé depuis le passage aux
    // curseurs) : les trois routes qui les servaient rendaient donc toujours
    // `null`, y compris quand la conversation entière avait lu. C'est le même
    // défaut que les compteurs — corrigé au cycle 102 — une couche plus haut.
    // La date se DÉRIVE de la même union curseur/reçu figé que les compteurs.
    // ------------------------------------------------------------------
    it('stamps deliveredToAllAt with the LAST recipient receipt once every recipient has one', async () => {
      mockPrisma.message.findMany.mockResolvedValue([
        { id: testMessageId, createdAt: new Date('2025-01-01T10:00:00Z'), senderId: 'sender-1' }
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId },
        { id: testParticipantId2 }
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        {
          messageId: testMessageId,
          participantId: testParticipantId,
          deliveredAt: new Date('2025-01-01T10:04:00Z'),
          receivedAt: new Date('2025-01-01T10:04:00Z'),
          readAt: null
        },
        {
          messageId: testMessageId,
          participantId: testParticipantId2,
          deliveredAt: new Date('2025-01-01T10:09:00Z'),
          receivedAt: new Date('2025-01-01T10:09:00Z'),
          readAt: null
        }
      ]);

      const result = await service.getConversationReadStatuses(testConversationId, [testMessageId]);

      // « Livré à TOUS » date du DERNIER servi, pas du premier.
      expect(result.get(testMessageId)?.deliveredToAllAt).toEqual(new Date('2025-01-01T10:09:00Z'));
      // Personne n'a lu : le seuil de lecture n'est pas franchi.
      expect(result.get(testMessageId)?.readByAllAt).toBeNull();
    });

    it('leaves deliveredToAllAt null while one recipient is still missing', async () => {
      mockPrisma.message.findMany.mockResolvedValue([
        { id: testMessageId, createdAt: new Date('2025-01-01T10:00:00Z'), senderId: 'sender-1' }
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId },
        { id: testParticipantId2 }
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        {
          messageId: testMessageId,
          participantId: testParticipantId,
          deliveredAt: new Date('2025-01-01T10:04:00Z'),
          receivedAt: new Date('2025-01-01T10:04:00Z'),
          readAt: new Date('2025-01-01T10:05:00Z')
        }
      ]);

      const result = await service.getConversationReadStatuses(testConversationId, [testMessageId]);

      expect(result.get(testMessageId)).toEqual(
        expect.objectContaining({ receivedCount: 1, readCount: 1 })
      );
      // Un destinataire sur deux : ni « livré à tous » ni « lu par tous ».
      expect(result.get(testMessageId)?.deliveredToAllAt).toBeNull();
      expect(result.get(testMessageId)?.readByAllAt).toBeNull();
    });

    it('stamps readByAllAt with the LAST recipient read once every recipient has read', async () => {
      mockPrisma.message.findMany.mockResolvedValue([
        { id: testMessageId, createdAt: new Date('2025-01-01T10:00:00Z'), senderId: 'sender-1' }
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId },
        { id: testParticipantId2 }
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        {
          messageId: testMessageId,
          participantId: testParticipantId,
          deliveredAt: new Date('2025-01-01T10:04:00Z'),
          receivedAt: new Date('2025-01-01T10:04:00Z'),
          readAt: new Date('2025-01-01T10:20:00Z')
        },
        {
          messageId: testMessageId,
          participantId: testParticipantId2,
          deliveredAt: new Date('2025-01-01T10:09:00Z'),
          receivedAt: new Date('2025-01-01T10:09:00Z'),
          readAt: new Date('2025-01-01T10:11:00Z')
        }
      ]);

      const result = await service.getConversationReadStatuses(testConversationId, [testMessageId]);

      expect(result.get(testMessageId)?.deliveredToAllAt).toEqual(new Date('2025-01-01T10:09:00Z'));
      expect(result.get(testMessageId)?.readByAllAt).toEqual(new Date('2025-01-01T10:20:00Z'));
    });

    // Le dénominateur est `computeRecipientCount` — expéditeur exclu. Une
    // conversation sans AUCUN destinataire actif (l'expéditeur est resté seul)
    // a `totalMembers === 0`, donc un seuil `count >= totalMembers`
    // trivialement franchi. Ce témoin fige que « livré/lu par tous » ne
    // s'allume pas pour autant sur un message que personne n'a reçu.
    it('never stamps the all-served dates when the message has no active recipient', async () => {
      mockPrisma.message.findMany.mockResolvedValue([
        { id: testMessageId, createdAt: new Date('2025-01-01T10:00:00Z'), senderId: testParticipantId }
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([{ id: testParticipantId }]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);

      const result = await service.getConversationReadStatuses(testConversationId, [testMessageId]);

      expect(result.get(testMessageId)?.totalMembers).toBe(0);
      expect(result.get(testMessageId)?.deliveredToAllAt).toBeNull();
      expect(result.get(testMessageId)?.readByAllAt).toBeNull();
    });

    // Même règle que les compteurs : l'opt-out `showReadReceipts` sort du
    // numérateur ET du dénominateur. Il ne doit donc pas RETENIR le seuil —
    // sinon un seul destinataire discret empêcherait à jamais l'expéditeur de
    // voir « lu par tous », alors que le compteur, lui, affiche déjà 1/1.
    it('does not let a read-receipt opt-out hold back the all-read date', async () => {
      mockPrisma.message.findMany.mockResolvedValue([
        { id: testMessageId, createdAt: new Date('2025-01-01T10:00:00Z'), senderId: 'sender-p' }
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p-optout', userId: 'u-optout' },
        { id: 'p-normal', userId: 'u-normal' }
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        {
          messageId: testMessageId,
          participantId: 'p-normal',
          deliveredAt: new Date('2025-01-01T10:04:00Z'),
          receivedAt: new Date('2025-01-01T10:04:00Z'),
          readAt: new Date('2025-01-01T10:05:00Z')
        }
      ]);
      mockPrisma.userPreference.findMany.mockResolvedValue(
        [{ userId: 'u-optout', key: 'show-read-receipts', value: 'false' }]
      );

      const result = await service.getConversationReadStatuses(testConversationId, [testMessageId]);

      expect(result.get(testMessageId)).toEqual(
        expect.objectContaining({ totalMembers: 1, receivedCount: 1, readCount: 1 })
      );
      expect(result.get(testMessageId)?.deliveredToAllAt).toEqual(new Date('2025-01-01T10:04:00Z'));
      expect(result.get(testMessageId)?.readByAllAt).toEqual(new Date('2025-01-01T10:05:00Z'));
    });
  });

  // ==============================================
  // CLEANUP OBSOLETE CURSORS TESTS
  // ==============================================

  describe('cleanupObsoleteCursors', () => {
    it('should return 0 when no cursors exist', async () => {
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);

      const count = await service.cleanupObsoleteCursors(testConversationId);

      expect(count).toBe(0);
      expect(mockPrisma.conversationReadCursor.deleteMany).not.toHaveBeenCalled();
    });

    it('should delete cursors pointing to deleted messages', async () => {
      const cursors = [
        { id: 'cursor-1', lastReadMessageId: 'deleted-msg' },
        { id: 'cursor-2', lastReadMessageId: 'existing-msg' }
      ];

      mockPrisma.conversationReadCursor.findMany.mockResolvedValue(cursors);
      mockPrisma.message.findMany.mockResolvedValue([{ id: 'existing-msg' }]);
      mockPrisma.conversationReadCursor.deleteMany.mockResolvedValue({ count: 1 });

      const count = await service.cleanupObsoleteCursors(testConversationId);

      expect(count).toBe(1);
      expect(mockPrisma.conversationReadCursor.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['cursor-1'] } }
      });
    });

    it('should not delete any cursors when all messages exist', async () => {
      const cursors = [
        { id: 'cursor-1', lastReadMessageId: 'msg-1' },
        { id: 'cursor-2', lastReadMessageId: 'msg-2' }
      ];

      mockPrisma.conversationReadCursor.findMany.mockResolvedValue(cursors);
      mockPrisma.message.findMany.mockResolvedValue([{ id: 'msg-1' }, { id: 'msg-2' }]);

      const count = await service.cleanupObsoleteCursors(testConversationId);

      expect(count).toBe(0);
      expect(mockPrisma.conversationReadCursor.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ==============================================
  // COMPUTED STATUS FIELDS TESTS
  // ==============================================

  describe('Computed Status Fields', () => {
    describe('updateMessageComputedStatus is now a no-op', () => {
      it('should NOT update message computed fields (cursor-based approach)', async () => {
        // In the new cursor-based architecture, updateMessageComputedStatus is a no-op
        // Read statuses are computed dynamically via cursors, not stored on Message
        const mockMessage = { id: testMessageId, createdAt: new Date() };

        mockPrisma.message.findFirst.mockResolvedValue(mockMessage);

        await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

        // message.update should NOT be called for computed status fields
        expect(mockPrisma.message.update).not.toHaveBeenCalled();
      });

      it('should NOT create messageStatusEntry records (cursor-based approach)', async () => {
        const mockMessage = { id: testMessageId, createdAt: new Date() };

        mockPrisma.message.findFirst.mockResolvedValue(mockMessage);

        await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

        // messageStatusEntry.upsert should NOT be called
        expect(mockPrisma.messageStatusEntry.upsert).not.toHaveBeenCalled();
      });
    });

    describe('updateAttachmentComputedStatus (via markAudioAsListened)', () => {
      // Contrat 2026-08-18 (« remonter les lectures même si c'est l'auteur ») :
      // 8 counts — d'abord les 4 compteurs AFFICHÉS (auteur INCLUS), puis les
      // 4 compteurs de COMPLÉTUDE (auteur exclu, comparés à totalParticipants
      // lui-même auteur-exclu).
      it('should update listenedByAllAt when all participants listened, storing author-inclusive counters', async () => {
        mockPrisma.messageAttachment.findUnique.mockResolvedValue({
          id: testAttachmentId,
          messageId: testMessageId,
          mimeType: 'audio/mp3',
          message: {
            conversationId: testConversationId,
            senderId: testParticipantId2,
            anonymousSenderId: null
          }
        });
        mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});

        mockPrisma.participant.count.mockResolvedValue(2);

        mockPrisma.attachmentStatusEntry.count
          .mockResolvedValueOnce(3) // viewedCount (auteur inclus)
          .mockResolvedValueOnce(3) // downloadedCount (auteur inclus)
          .mockResolvedValueOnce(3) // listenedCount (auteur inclus)
          .mockResolvedValueOnce(0) // watchedCount (auteur inclus)
          .mockResolvedValueOnce(2) // viewedCountOthers
          .mockResolvedValueOnce(2) // downloadedCountOthers
          .mockResolvedValueOnce(2) // listenedCountOthers
          .mockResolvedValueOnce(0); // watchedCountOthers

        const listenedByAllDate = new Date('2025-01-01T14:00:00Z');

        mockPrisma.attachmentStatusEntry.findFirst
          .mockResolvedValueOnce({ viewedAt: new Date() })
          .mockResolvedValueOnce({ downloadedAt: new Date() })
          .mockResolvedValueOnce({ listenedAt: listenedByAllDate });

        mockPrisma.messageAttachment.update.mockResolvedValue({});

        await service.markAudioAsListened(testParticipantId, testAttachmentId, { complete: true });

        expect(mockPrisma.messageAttachment.update).toHaveBeenCalledWith({
          where: { id: testAttachmentId },
          data: expect.objectContaining({
            viewedCount: 3,
            downloadedCount: 3,
            consumedCount: 3, // listenedCount (auteur inclus) pour un audio
            listenedByAllAt: listenedByAllDate
          })
        });

        // PROBANT contre l'ancien code (qui ne faisait que 4 counts, tous
        // auteur-exclus) : 8 appels — les 4 premiers SANS exclusion auteur
        // (compteurs affichés), les 4 suivants AVEC (complétude). Tous
        // filtrent les lignes orphelines héritées (participantId = User.id)
        // par la relation participant→conversation.
        const countWheres = mockPrisma.attachmentStatusEntry.count.mock.calls.map(
          (c: any[]) => c[0].where
        );
        expect(countWheres).toHaveLength(8);
        for (const where of countWheres.slice(0, 4)) {
          expect(where.participantId).toBeUndefined();
          expect(where.participant).toEqual({ conversationId: testConversationId });
        }
        for (const where of countWheres.slice(4)) {
          expect(where.participantId).toEqual({ not: testParticipantId2 });
          expect(where.participant).toEqual({ conversationId: testConversationId });
        }
      });

      // L'écoute de l'AUTEUR compte dans consumedCount mais n'allume JAMAIS
      // « écouté par tous » : la complétude reste jugée sur les seuls
      // destinataires.
      it('author own listen increments consumedCount without lighting listenedByAllAt', async () => {
        mockPrisma.messageAttachment.findUnique.mockResolvedValue({
          id: testAttachmentId,
          messageId: testMessageId,
          mimeType: 'audio/mp3',
          message: {
            conversationId: testConversationId,
            senderId: testParticipantId2,
            anonymousSenderId: null
          }
        });
        mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});

        mockPrisma.participant.count.mockResolvedValue(2);

        mockPrisma.attachmentStatusEntry.count
          .mockResolvedValueOnce(0) // viewedCount
          .mockResolvedValueOnce(0) // downloadedCount
          .mockResolvedValueOnce(1) // listenedCount — l'auteur seul
          .mockResolvedValueOnce(0) // watchedCount
          .mockResolvedValueOnce(0) // viewedCountOthers
          .mockResolvedValueOnce(0) // downloadedCountOthers
          .mockResolvedValueOnce(0) // listenedCountOthers — aucun destinataire
          .mockResolvedValueOnce(0); // watchedCountOthers

        mockPrisma.messageAttachment.update.mockResolvedValue({});

        await service.markAudioAsListened(testParticipantId2, testAttachmentId, { complete: true });

        expect(mockPrisma.messageAttachment.update).toHaveBeenCalledWith({
          where: { id: testAttachmentId },
          data: expect.objectContaining({
            consumedCount: 1,
            listenedByAllAt: null
          })
        });
      });
    });
  });

  // ==============================================
  // EDGE CASES AND ERROR HANDLING
  // ==============================================

  describe('Edge Cases', () => {
    it('should handle empty participantId gracefully', async () => {
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.count.mockResolvedValue(0);

      const count = await service.getUnreadCount('', testConversationId);

      expect(count).toBe(0);
    });

    it('should handle concurrent operations', async () => {
      const lastReadAt = new Date('2026-05-21T10:00:00Z');
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
        id: 'c', participantId: testParticipantId, conversationId: testConversationId,
        unreadCount: 99, lastReadAt,
      });
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: testParticipantId, joinedAt: new Date('2026-04-01'),
      });
      mockPrisma.message.count.mockResolvedValue(5);

      const promises = [
        service.getUnreadCount(testParticipantId, testConversationId),
        service.getUnreadCount(testParticipantId, testConversationId),
        service.getUnreadCount(testParticipantId, testConversationId)
      ];

      const results = await Promise.all(promises);

      expect(results).toEqual([5, 5, 5]);
    });
  });

  // ==============================================
  // WORKFLOW TESTS
  // ==============================================

  describe('Workflow Tests', () => {
    it('should correctly track message status progression (cursor-based)', async () => {
      const joinedAt = new Date('2026-04-01');
      const participant = { id: testParticipantId, joinedAt };
      // 1. Initial: No cursor, but participant exists — count from joinedAt
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.participant.findFirst.mockResolvedValue(participant);
      mockPrisma.message.count.mockResolvedValue(5);

      let unreadCount = await service.getUnreadCount(testParticipantId, testConversationId);
      expect(unreadCount).toBe(5);

      // 2. Mark as received: cursor created (cursor-only approach)
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.count.mockResolvedValue(4);

      await service.markMessagesAsReceived(testParticipantId, testConversationId, testMessageId);

      // Verify cursor-only approach: no messageStatusEntry or message.update
      expect(mockPrisma.messageStatusEntry.upsert).not.toHaveBeenCalled();
      expect(mockPrisma.message.update).not.toHaveBeenCalled();

      // 3. After received, cursor exists with lastReadAt → count returns 4
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
        id: 'c', participantId: testParticipantId, conversationId: testConversationId,
        unreadCount: 99, lastReadAt: new Date('2026-05-21T10:00:00Z'),
      });
      mockPrisma.participant.findFirst.mockResolvedValue(participant);
      mockPrisma.message.count.mockResolvedValue(4);

      unreadCount = await service.getUnreadCount(testParticipantId, testConversationId);
      expect(unreadCount).toBe(4);
    });

    it('should correctly track attachment status progression', async () => {
      const attachmentSetup = {
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'audio/mp3',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      };

      mockPrisma.messageAttachment.findUnique.mockResolvedValue(attachmentSetup);
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ listenedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      // 1. First listen (partial)
      await service.markAudioAsListened(testParticipantId, testAttachmentId, {
        playPositionMs: 5000,
        listenDurationMs: 5000,
        complete: false
      });

      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            listenCount: 1,
            listenedComplete: false
          })
        })
      );

      // 2. Second listen (complete)
      await service.markAudioAsListened(testParticipantId, testAttachmentId, {
        playPositionMs: 10000,
        listenDurationMs: 10000,
        complete: true
      });

      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            listenCount: { increment: 1 },
            listenedComplete: true
          })
        })
      );
    });
  });

  // ==============================================
  // DATA ACCURACY & CONSISTENCY TESTS
  // ==============================================

  describe('Data Accuracy & Consistency', () => {
    it('should maintain accurate unread count after marking messages as read', async () => {
      // Setup: User has 5 unread messages (cursor with stale unreadCount but
      // lastReadAt is honoured + message.count returns 5)
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
        id: 'c', participantId: testParticipantId, conversationId: testConversationId,
        unreadCount: 99, lastReadAt: new Date('2026-05-21T10:00:00Z'),
      });
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: testParticipantId, joinedAt: new Date('2026-04-01'),
      });
      mockPrisma.message.count.mockResolvedValue(5);

      let unreadCount = await service.getUnreadCount(testParticipantId, testConversationId);
      expect(unreadCount).toBe(5);

      // Mark all as read
      const mockMessage = { id: testMessageId, createdAt: new Date() };
      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      // After reading, cursor should be updated to 0
      expect(mockPrisma.conversationReadCursor.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            unreadCount: 0
          })
        })
      );
    });

    it('should NOT compute deliveredToAllAt (cursor-based approach does not track individual message delivery)', async () => {
      // In the new cursor-based architecture, deliveredToAllAt is no longer computed
      // Read statuses are determined dynamically via cursors
      const mockMessage = { id: testMessageId, createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      // message.update should NOT be called in cursor-based approach
      expect(mockPrisma.message.update).not.toHaveBeenCalled();
    });

    it('should NOT set readByAllAt (cursor-based approach)', async () => {
      // In the new cursor-based architecture, readByAllAt is no longer computed
      const mockMessage = { id: testMessageId, createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      // message.update should NOT be called in cursor-based approach
      expect(mockPrisma.message.update).not.toHaveBeenCalled();
    });

    it('should maintain accurate attachment status counts', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'audio/mp3',
        message: {
          conversationId: testConversationId,
          senderId: 'sender-id',
          anonymousSenderId: null
        }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});

      // 4 participants, 3 viewed, 2 downloaded, 3 listened
      mockPrisma.participant.count.mockResolvedValue(4);
      mockPrisma.attachmentStatusEntry.count
        .mockResolvedValueOnce(3) // viewedCount
        .mockResolvedValueOnce(2) // downloadedCount
        .mockResolvedValueOnce(3) // listenedCount
        .mockResolvedValueOnce(0); // watchedCount

      mockPrisma.attachmentStatusEntry.findFirst
        .mockResolvedValueOnce({ viewedAt: new Date() })
        .mockResolvedValueOnce({ downloadedAt: new Date() });

      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markAudioAsListened(testParticipantId, testAttachmentId);

      expect(mockPrisma.messageAttachment.update).toHaveBeenCalledWith({
        where: { id: testAttachmentId },
        data: expect.objectContaining({
          viewedCount: 3,
          downloadedCount: 2,
          consumedCount: 3, // listenedCount for audio
          listenedByAllAt: null // Only 3 of 4 listened
        })
      });
    });
  });

  // ==============================================
  // IDEMPOTENCY TESTS
  // ==============================================

  describe('Idempotency', () => {
    it('should handle marking same message as read twice without errors (cursor-based)', async () => {
      const mockMessage = { id: testMessageId, createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);

      // First read
      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      // Clear the dedup cache to allow second call
      (MessageReadStatusService as any).recentActionCache.clear();

      // Second read - should use the guarded cursor-advance path again
      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      // Each markMessagesAsRead advances two cursors (read + read-implies-delivered);
      // two calls → four advances.
      expect(mockPrisma.conversationReadCursor.updateMany).toHaveBeenCalledTimes(4);
      // No messageStatusEntry.upsert in cursor-based approach
      expect(mockPrisma.messageStatusEntry.upsert).not.toHaveBeenCalled();
    });

    it('should not increment listen count when using upsert create (first listen)', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'audio/mp3',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ listenedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markAudioAsListened(testParticipantId, testAttachmentId);

      // Create should start with listenCount: 1, not increment
      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            listenCount: 1 // Fixed value, not increment
          }),
          update: expect.objectContaining({
            listenCount: { increment: 1 } // Increment for subsequent listens
          })
        })
      );
    });

    it('should handle marking attachment as downloaded multiple times', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'application/pdf',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ downloadedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      // Download twice
      await service.markAttachmentAsDownloaded(testParticipantId, testAttachmentId);
      await service.markAttachmentAsDownloaded(testParticipantId, testAttachmentId);

      // Both calls should succeed via upsert
      expect(mockPrisma.attachmentStatusEntry.upsert).toHaveBeenCalledTimes(2);
    });
  });

  // ==============================================
  // CONCURRENCY & RACE CONDITION TESTS
  // ==============================================

  describe('Concurrency & Race Conditions', () => {
    it('should handle multiple users marking same message as read simultaneously', async () => {
      // The service now uses cursor-based approach - each user gets their own cursor
      const mockMessage = { id: testMessageId, createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);

      const user1 = 'user-1';
      const user2 = 'user-2';
      const user3 = 'user-3';

      // Simulate concurrent reads
      const promises = [
        service.markMessagesAsRead(user1, testConversationId, testMessageId),
        service.markMessagesAsRead(user2, testConversationId, testMessageId),
        service.markMessagesAsRead(user3, testConversationId, testMessageId)
      ];

      await expect(Promise.all(promises)).resolves.not.toThrow();

      // Each user gets their own read cursor advanced plus the read-implies-delivered
      // advance → two updateMany per user, three users → six.
      expect(mockPrisma.conversationReadCursor.updateMany).toHaveBeenCalledTimes(6);
    });

    it('should handle concurrent attachment status updates', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'audio/mp3',
        message: { conversationId: testConversationId, senderId: 'sender-id' }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(5);
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(3);
      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ listenedAt: new Date() });
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      // Multiple users listening simultaneously
      const promises = [
        service.markAudioAsListened('user-1', testAttachmentId),
        service.markAudioAsListened('user-2', testAttachmentId),
        service.markAudioAsListened('user-3', testAttachmentId)
      ];

      await expect(Promise.all(promises)).resolves.not.toThrow();
    });

    it('should handle rapid successive status updates', async () => {
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue({
        id: 'c', participantId: testParticipantId, conversationId: testConversationId,
        unreadCount: 999, lastReadAt: new Date('2026-05-21T10:00:00Z'),
      });
      mockPrisma.participant.findFirst.mockResolvedValue({
        id: testParticipantId, joinedAt: new Date('2026-04-01'),
      });
      mockPrisma.message.count.mockResolvedValue(10);

      // Rapid successive reads
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(service.getUnreadCount(testParticipantId, testConversationId));
      }

      const results = await Promise.all(promises);

      // All should return same value
      expect(results.every(r => r === 10)).toBe(true);
    });
  });

  // ==============================================
  // ANONYMOUS USER TESTS
  // ==============================================

  describe('Anonymous User Handling', () => {
    it('should handle messages from anonymous senders using cursor-based approach', async () => {
      const anonymousParticipantId = 'anon-sender-123';
      const messageCreatedAt = new Date('2025-01-01T10:00:00Z');
      const mockMessage = {
        id: testMessageId,
        createdAt: messageCreatedAt,
        senderId: anonymousParticipantId,
        conversationId: testConversationId
      };

      const mockMembers = [
        { id: anonymousParticipantId, displayName: 'AnonSender' },
        { id: testParticipantId, displayName: 'User1' },
        { id: testParticipantId2, displayName: 'User2' }
      ];

      // Cursor with timestamps >= message.createdAt
      const mockCursors = [
        {
          participantId: testParticipantId,
          lastDeliveredAt: new Date('2025-01-01T10:05:00Z'),
          lastReadAt: new Date('2025-01-01T10:10:00Z'),
          participant: { id: testParticipantId, displayName: 'User1' }
        }
      ];

      mockPrisma.message.findUnique.mockResolvedValue(mockMessage);
      mockPrisma.participant.findMany.mockResolvedValue(mockMembers);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue(mockCursors);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.totalMembers).toBe(2); // 3 participants minus 1 sender
      expect(result.receivedBy).toHaveLength(1);
    });

    it('should correctly handle anonymous sender in markMessagesAsRead', async () => {
      // The service now uses a simplified cursor-based approach
      // It updates conversationReadCursor instead of messageStatusEntry and message.update
      const mockMessage = { id: testMessageId, createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      // Should update the read cursor
      expect(mockPrisma.conversationReadCursor.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ participantId: testParticipantId, conversationId: testConversationId })
        })
      );
    });
  });

  // ==============================================
  // BULK OPERATIONS & PERFORMANCE TESTS
  // ==============================================

  describe('Bulk Operations & Performance', () => {
    it('should handle marking messages as read efficiently with cursor update', async () => {
      // The service now uses a simplified cursor-based approach
      // It only updates conversationReadCursor once, not individual messageStatusEntry
      const mockMessage = { id: 'msg-49', createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);

      await service.markMessagesAsRead(testParticipantId, testConversationId, 'msg-49');

      // Read + read-implies-delivered → two cursor advances, regardless of message count.
      expect(mockPrisma.conversationReadCursor.updateMany).toHaveBeenCalledTimes(2);
      expect(mockPrisma.conversationReadCursor.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ participantId: testParticipantId, conversationId: testConversationId }),
          data: expect.objectContaining({
            lastReadMessageId: 'msg-49',
            unreadCount: 0
          })
        })
      );
    });

    it('should get unread counts for many conversations efficiently (iter-4 batch)', async () => {
      const conversationCount = 20;
      const conversationIds = Array.from({ length: conversationCount }, (_, i) => `conv-${i}`);
      const joinedAt = new Date('2026-04-01');
      const lastReadAt = new Date('2026-05-21T10:00:00Z');

      // iter-4: participant.findMany returns all 20 participants, cursor.findMany returns first 10
      const expected: Record<string, number> = {};
      const participantRows = conversationIds.map((id, i) => {
        const count = i < 10 ? (i + 1) : 0;
        expected[id] = count;
        return { id: testParticipantId, conversationId: id, joinedAt };
      });
      mockPrisma.participant.findMany.mockResolvedValueOnce(participantRows);
      const cursorRows = conversationIds.slice(0, 10).map(id => ({
        participantId: testParticipantId, lastReadAt
      }));
      mockPrisma.conversationReadCursor.findMany.mockResolvedValueOnce(cursorRows);
      // message.count called once per participant (20 parallel calls)
      conversationIds.forEach((_, i) => {
        mockPrisma.message.count.mockResolvedValueOnce(i < 10 ? (i + 1) : 0);
      });

      const result = await service.getUnreadCountsForConversations([testParticipantId], conversationIds);

      expect(result.size).toBe(conversationCount);
      for (const id of conversationIds) {
        expect(result.get(id)).toBe(expected[id]);
      }
    });
  });

  // ==============================================
  // ERROR RECOVERY & DATA INTEGRITY TESTS
  // ==============================================

  describe('Error Recovery & Data Integrity', () => {
    it('should complete cursor update even if notification sync fails', async () => {
      // The service now uses a simplified cursor-based approach
      // Even if notification sync fails, the cursor update should complete
      const mockMessage = { id: testMessageId, createdAt: new Date() };

      mockPrisma.message.findFirst.mockResolvedValue(mockMessage);

      // Should not throw - notification sync errors are caught internally
      await expect(
        service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId)
      ).resolves.not.toThrow();

      // Cursor should still have been updated
      expect(mockPrisma.conversationReadCursor.updateMany).toHaveBeenCalled();
    });

    it('should handle missing message gracefully in getMessageReadStatus', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(null);

      await expect(
        service.getMessageReadStatus('missing-msg', testConversationId)
      ).rejects.toThrow('Message missing-msg not found');
    });

    it('should handle database timeout gracefully', async () => {
      mockPrisma.conversationReadCursor.findUnique.mockRejectedValue(
        new Error('Connection timeout')
      );

      const count = await service.getUnreadCount(testParticipantId, testConversationId);

      expect(count).toBe(0);
      // Le service utilise maintenant enhancedLogger au lieu de console.error
    });
  });

  // ==============================================
  // ATTACHMENT TYPE-SPECIFIC COMPUTED STATUS TESTS
  // ==============================================

  describe('Attachment Type-Specific Status', () => {
    it('should use listenedCount for consumedCount on audio attachments', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'audio/mpeg',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(5);

      // 3 viewed, 2 downloaded, 4 listened, 0 watched
      mockPrisma.attachmentStatusEntry.count
        .mockResolvedValueOnce(3) // viewedCount
        .mockResolvedValueOnce(2) // downloadedCount
        .mockResolvedValueOnce(4) // listenedCount - this should be consumedCount for audio
        .mockResolvedValueOnce(0); // watchedCount

      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue(null);
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markAudioAsListened(testParticipantId, testAttachmentId);

      // Verify consumedCount is listenedCount for audio
      const updateCall = mockPrisma.messageAttachment.update.mock.calls[0][0];
      expect(updateCall.data.consumedCount).toBe(4); // listenedCount
      expect(updateCall.data.viewedCount).toBe(3);
      expect(updateCall.data.downloadedCount).toBe(2);
    });

    it('should use watchedCount for consumedCount on video attachments', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'video/mp4',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(5);

      // 4 viewed, 3 downloaded, 0 listened, 2 watched
      mockPrisma.attachmentStatusEntry.count
        .mockResolvedValueOnce(4) // viewedCount
        .mockResolvedValueOnce(3) // downloadedCount
        .mockResolvedValueOnce(0) // listenedCount
        .mockResolvedValueOnce(2); // watchedCount - this should be consumedCount for video

      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue(null);
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markVideoAsWatched(testParticipantId, testAttachmentId);

      // Verify consumedCount is watchedCount for video
      const updateCall = mockPrisma.messageAttachment.update.mock.calls[0][0];
      expect(updateCall.data.consumedCount).toBe(2); // watchedCount
      expect(updateCall.data.viewedCount).toBe(4);
      expect(updateCall.data.downloadedCount).toBe(3);
    });

    it('should use viewedCount for consumedCount on image attachments', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'image/png',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(5);

      // 3 viewed, 2 downloaded, 0 listened, 0 watched
      mockPrisma.attachmentStatusEntry.count
        .mockResolvedValueOnce(3) // viewedCount - this should be consumedCount for image
        .mockResolvedValueOnce(2) // downloadedCount
        .mockResolvedValueOnce(0) // listenedCount
        .mockResolvedValueOnce(0); // watchedCount

      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue(null);
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markImageAsViewed(testParticipantId, testAttachmentId);

      // Verify consumedCount is viewedCount for non-audio/video
      const updateCall = mockPrisma.messageAttachment.update.mock.calls[0][0];
      expect(updateCall.data.consumedCount).toBe(3); // viewedCount
      expect(updateCall.data.viewedCount).toBe(3);
      expect(updateCall.data.downloadedCount).toBe(2);
    });

    it('should use viewedCount for consumedCount on document attachments', async () => {
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'application/pdf',
        message: { conversationId: testConversationId, senderId: testParticipantId2 }
      });
      mockPrisma.attachmentStatusEntry.upsert.mockResolvedValue({});
      mockPrisma.participant.count.mockResolvedValue(5);

      // 5 viewed, 4 downloaded, 0 listened, 0 watched
      mockPrisma.attachmentStatusEntry.count
        .mockResolvedValueOnce(5) // viewedCount
        .mockResolvedValueOnce(4) // downloadedCount
        .mockResolvedValueOnce(0) // listenedCount
        .mockResolvedValueOnce(0); // watchedCount

      mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue(null);
      mockPrisma.messageAttachment.update.mockResolvedValue({});

      await service.markAttachmentAsDownloaded(testParticipantId, testAttachmentId);

      // Verify consumedCount is viewedCount for documents
      const updateCall = mockPrisma.messageAttachment.update.mock.calls[0][0];
      expect(updateCall.data.consumedCount).toBe(5); // viewedCount (not audio/video)
    });
  });

  // ==============================================
  // DEADLOCK RETRY (P2034) TESTS - withRetry function
  // ==============================================

  describe('Deadlock Retry (P2034 - withRetry)', () => {
    // Helper to create a Prisma P2034 deadlock error
    const createDeadlockError = () => {
      const error = new Error('Transaction failed due to a write conflict or a deadlock');
      (error as any).code = 'P2034';
      return error;
    };

    // Helper to create a non-P2034 Prisma error
    const createNonDeadlockError = (code: string = 'P2025') => {
      const error = new Error('Record not found');
      (error as any).code = code;
      return error;
    };

    describe('markAudioAsListened with retry', () => {
      beforeEach(() => {
        // Setup common mocks for attachment methods
        mockPrisma.messageAttachment.findUnique.mockResolvedValue({
          id: testAttachmentId,
          messageId: testMessageId,
          mimeType: 'audio/mp3',
          message: { conversationId: testConversationId, senderId: testParticipantId2 }
        });
        mockPrisma.participant.count.mockResolvedValue(2);
        mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
        mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ listenedAt: new Date() });
        mockPrisma.messageAttachment.update.mockResolvedValue({});
      });

      it('should retry and succeed after P2034 deadlock error on first attempt', async () => {
        // First call fails with P2034, second call succeeds
        mockPrisma.$transaction
          .mockRejectedValueOnce(createDeadlockError())
          .mockImplementationOnce(async (callback: (tx: any) => Promise<any>) => {
            return callback(mockPrisma);
          });

        await service.markAudioAsListened(testParticipantId, testAttachmentId);

        // $transaction should have been called twice (1 failure + 1 success)
        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
      });

      it('should succeed after 2 P2034 failures on 3rd attempt', async () => {
        // First two calls fail with P2034, third call succeeds
        mockPrisma.$transaction
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError())
          .mockImplementationOnce(async (callback: (tx: any) => Promise<any>) => {
            return callback(mockPrisma);
          });

        await service.markAudioAsListened(testParticipantId, testAttachmentId);

        // $transaction should have been called 3 times (2 failures + 1 success)
        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
      });

      it('should throw P2034 error after exhausting all 3 retry attempts', async () => {
        // All 3 attempts fail with P2034
        mockPrisma.$transaction
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError());

        await expect(
          service.markAudioAsListened(testParticipantId, testAttachmentId)
        ).rejects.toMatchObject({ code: 'P2034' });

        // $transaction should have been called 3 times (all failures)
        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
      });

      it('should throw non-P2034 error immediately without retry', async () => {
        // First call fails with non-P2034 error
        mockPrisma.$transaction.mockRejectedValueOnce(createNonDeadlockError('P2025'));

        await expect(
          service.markAudioAsListened(testParticipantId, testAttachmentId)
        ).rejects.toMatchObject({ code: 'P2025' });

        // $transaction should have been called only once (no retry for non-P2034)
        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      });
    });

    describe('markVideoAsWatched with retry', () => {
      beforeEach(() => {
        mockPrisma.messageAttachment.findUnique.mockResolvedValue({
          id: testAttachmentId,
          messageId: testMessageId,
          mimeType: 'video/mp4',
          message: { conversationId: testConversationId, senderId: testParticipantId2 }
        });
        mockPrisma.participant.count.mockResolvedValue(2);
        mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
        mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ watchedAt: new Date() });
        mockPrisma.messageAttachment.update.mockResolvedValue({});
      });

      it('should retry and succeed after P2034 deadlock error', async () => {
        mockPrisma.$transaction
          .mockRejectedValueOnce(createDeadlockError())
          .mockImplementationOnce(async (callback: (tx: any) => Promise<any>) => {
            return callback(mockPrisma);
          });

        await service.markVideoAsWatched(testParticipantId, testAttachmentId);

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
      });

      it('should throw P2034 error after exhausting retries', async () => {
        mockPrisma.$transaction
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError());

        await expect(
          service.markVideoAsWatched(testParticipantId, testAttachmentId)
        ).rejects.toMatchObject({ code: 'P2034' });

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
      });

      it('should throw non-P2034 error immediately', async () => {
        mockPrisma.$transaction.mockRejectedValueOnce(createNonDeadlockError('P2002'));

        await expect(
          service.markVideoAsWatched(testParticipantId, testAttachmentId)
        ).rejects.toMatchObject({ code: 'P2002' });

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      });
    });

    describe('markImageAsViewed with retry', () => {
      beforeEach(() => {
        mockPrisma.messageAttachment.findUnique.mockResolvedValue({
          id: testAttachmentId,
          messageId: testMessageId,
          mimeType: 'image/jpeg',
          message: { conversationId: testConversationId, senderId: testParticipantId2 }
        });
        mockPrisma.participant.count.mockResolvedValue(2);
        mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
        mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ viewedAt: new Date() });
        mockPrisma.messageAttachment.update.mockResolvedValue({});
      });

      it('should retry and succeed after P2034 deadlock error', async () => {
        mockPrisma.$transaction
          .mockRejectedValueOnce(createDeadlockError())
          .mockImplementationOnce(async (callback: (tx: any) => Promise<any>) => {
            return callback(mockPrisma);
          });

        await service.markImageAsViewed(testParticipantId, testAttachmentId);

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
      });

      it('should throw P2034 error after exhausting retries', async () => {
        mockPrisma.$transaction
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError());

        await expect(
          service.markImageAsViewed(testParticipantId, testAttachmentId)
        ).rejects.toMatchObject({ code: 'P2034' });

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
      });

      it('should throw non-P2034 error immediately', async () => {
        mockPrisma.$transaction.mockRejectedValueOnce(createNonDeadlockError('P2003'));

        await expect(
          service.markImageAsViewed(testParticipantId, testAttachmentId)
        ).rejects.toMatchObject({ code: 'P2003' });

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      });
    });

    describe('markAttachmentAsDownloaded with retry', () => {
      beforeEach(() => {
        mockPrisma.messageAttachment.findUnique.mockResolvedValue({
          id: testAttachmentId,
          messageId: testMessageId,
          mimeType: 'application/pdf',
          message: { conversationId: testConversationId, senderId: testParticipantId2 }
        });
        mockPrisma.participant.count.mockResolvedValue(2);
        mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
        mockPrisma.attachmentStatusEntry.findFirst.mockResolvedValue({ downloadedAt: new Date() });
        mockPrisma.messageAttachment.update.mockResolvedValue({});
      });

      it('should retry and succeed after P2034 deadlock error', async () => {
        mockPrisma.$transaction
          .mockRejectedValueOnce(createDeadlockError())
          .mockImplementationOnce(async (callback: (tx: any) => Promise<any>) => {
            return callback(mockPrisma);
          });

        await service.markAttachmentAsDownloaded(testParticipantId, testAttachmentId);

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
      });

      it('should succeed after 2 P2034 failures on 3rd attempt', async () => {
        mockPrisma.$transaction
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError())
          .mockImplementationOnce(async (callback: (tx: any) => Promise<any>) => {
            return callback(mockPrisma);
          });

        await service.markAttachmentAsDownloaded(testParticipantId, testAttachmentId);

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
      });

      it('should throw P2034 error after exhausting retries', async () => {
        mockPrisma.$transaction
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError())
          .mockRejectedValueOnce(createDeadlockError());

        await expect(
          service.markAttachmentAsDownloaded(testParticipantId, testAttachmentId)
        ).rejects.toMatchObject({ code: 'P2034' });

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(3);
      });

      it('should throw non-P2034 error immediately without retry', async () => {
        const uniqueConstraintError = createNonDeadlockError('P2002');
        mockPrisma.$transaction.mockRejectedValueOnce(uniqueConstraintError);

        await expect(
          service.markAttachmentAsDownloaded(testParticipantId, testAttachmentId)
        ).rejects.toMatchObject({ code: 'P2002' });

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      });

      it('should throw error without code property immediately without retry', async () => {
        const genericError = new Error('Generic database error');
        mockPrisma.$transaction.mockRejectedValueOnce(genericError);

        await expect(
          service.markAttachmentAsDownloaded(testParticipantId, testAttachmentId)
        ).rejects.toThrow('Generic database error');

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ==========================================================================
  // GAP-FILL: uncovered methods / branches
  // ==========================================================================

  describe('dedup cache and cleanupDedupCache (static)', () => {
    it('markMessagesAsReceived returns early on duplicate call within TTL', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.count.mockResolvedValue(0);

      await service.markMessagesAsReceived(testParticipantId, testConversationId, testMessageId);
      const updateManyCallsAfterFirst = mockPrisma.conversationReadCursor.updateMany.mock.calls.length;

      // Second call with same args within 2 s → should be a no-op (dedup hit)
      await service.markMessagesAsReceived(testParticipantId, testConversationId, testMessageId);

      expect(mockPrisma.conversationReadCursor.updateMany.mock.calls.length).toBe(updateManyCallsAfterFirst);
    });

    it('markMessagesAsRead returns early on duplicate call within TTL', async () => {
      mockPrisma.participant.findUnique.mockResolvedValue({ userId: null });

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);
      const updateManyCallsAfterFirst = mockPrisma.conversationReadCursor.updateMany.mock.calls.length;

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      expect(mockPrisma.conversationReadCursor.updateMany.mock.calls.length).toBe(updateManyCallsAfterFirst);
    });

    it('does NOT dedup markMessagesAsRead calls for a DIFFERENT messageId within the TTL window', async () => {
      mockPrisma.participant.findUnique.mockResolvedValue({ userId: null });

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);
      // A second, newer message arrives and is read < 2s later: must NOT be dropped by dedup.
      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId2);

      // Two non-deduped marks, each advancing read + read-implies-delivered cursors → four.
      expect(mockPrisma.conversationReadCursor.updateMany).toHaveBeenCalledTimes(4);
      // The second mark's read cursor advanced to the newer message (not swallowed by dedup).
      expect(mockPrisma.conversationReadCursor.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastReadMessageId: testMessageId2 }),
        })
      );
    });

    it('does NOT dedup markMessagesAsReceived calls for a DIFFERENT messageId within the TTL window', async () => {
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.count.mockResolvedValue(0);

      await service.markMessagesAsReceived(testParticipantId, testConversationId, testMessageId);
      await service.markMessagesAsReceived(testParticipantId, testConversationId, testMessageId2);

      expect(mockPrisma.conversationReadCursor.updateMany).toHaveBeenCalledTimes(2);
      expect(mockPrisma.conversationReadCursor.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastDeliveredMessageId: testMessageId2 }),
        })
      );
    });

    it('triggers cleanupDedupCache when cache exceeds 100 entries', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({ id: testMessageId });
      mockPrisma.conversationReadCursor.findUnique.mockResolvedValue(null);
      mockPrisma.message.count.mockResolvedValue(0);

      const cache: Map<string, number> = (MessageReadStatusService as any).recentActionCache;
      const now = Date.now();
      for (let i = 0; i < 101; i++) {
        cache.set(`fill-key-${i}:conv:received`, now - 5000);
      }
      expect(cache.size).toBeGreaterThan(100);

      // This call triggers cleanupDedupCache internally (cache.size > 100)
      await service.markMessagesAsReceived('new-participant', testConversationId, testMessageId);

      expect(cache.size).toBeLessThan(110);
    });
  });

  describe('getUnreadCountsForParticipants', () => {
    // Candidate messages from the single `message.findMany`. Each row carries createdAt +
    // senderId so the service can exclude each participant's OWN messages (senderId ≠ p.id).
    const mockCandidates = (rows: ReadonlyArray<{ at: string; from: string }>) =>
      mockPrisma.message.findMany.mockResolvedValue(
        rows.map((r) => ({ createdAt: new Date(r.at), senderId: r.from }))
      );

    it('returns empty map for empty participants array', async () => {
      const result = await service.getUnreadCountsForParticipants([], testConversationId);
      expect(result).toEqual(new Map());
      expect(mockPrisma.conversationReadCursor.findMany).not.toHaveBeenCalled();
    });

    it('collapses N counts into ONE message.findMany and buckets per participant', async () => {
      // p1 floor = 10:00 (cursor) → 2 candidates strictly after (11:00, 12:00) from others
      // p2 floor = 11:30 (joinedAt, no cursor) → 1 candidate strictly after (12:00) from others
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastReadAt: new Date('2024-01-01T10:00:00Z') },
      ]);
      mockCandidates([
        { at: '2024-01-01T11:00:00Z', from: 'other' },
        { at: '2024-01-01T12:00:00Z', from: 'other' },
      ]);

      const participants = [
        { id: 'p1', joinedAt: new Date('2024-01-01T00:00:00Z') },
        { id: 'p2', joinedAt: new Date('2024-01-01T11:30:00Z') },
      ];

      const result = await service.getUnreadCountsForParticipants(
        participants, testConversationId
      );

      // Distinct floors → distinct counts, from a SINGLE candidate fetch
      expect(result.get('p1')).toBe(2);
      expect(result.get('p2')).toBe(1);
      expect(mockPrisma.message.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.message.count).not.toHaveBeenCalled();
    });

    // Régression Prisme lecture-exacte sur le chemin le plus chaud
    // (`_updateUnreadCounts` à CHAQUE `message:new`). Le curseur exact s'arrête au
    // préfixe contigu — position 10:00 — mais `lastReadAt` vaut 18:00 (ouverture).
    // Deux messages d'autrui existent à 11:00 et 12:00, tous deux ANTÉRIEURS à
    // `lastReadAt`. Plancher sur `lastReadAt` → 0 (badge effacé à tort) ; plancher
    // sur la position chronologique → 2 (le badge reste haut).
    it('floors each participant on the cursor position (lastReadMessageCreatedAt), not the wall-clock lastReadAt', async () => {
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        {
          participantId: 'p1',
          lastReadAt: new Date('2024-01-01T18:00:00Z'),
          lastReadMessageCreatedAt: new Date('2024-01-01T10:00:00Z'),
        },
      ]);
      mockCandidates([
        { at: '2024-01-01T11:00:00Z', from: 'other' },
        { at: '2024-01-01T12:00:00Z', from: 'other' },
      ]);

      const result = await service.getUnreadCountsForParticipants(
        [{ id: 'p1', joinedAt: new Date('2024-01-01T00:00:00Z') }],
        testConversationId
      );

      expect(result.get('p1')).toBe(2);
    });

    it("excludes each participant's OWN messages, counting everyone else's (incl. the message sender)", async () => {
      // Two messages above floor: one Alice sent, one p1 sent themselves.
      // For p1: only Alice's counts (own message excluded). For p2: both count.
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      mockCandidates([
        { at: '2024-01-01T11:00:00Z', from: 'alice' },
        { at: '2024-01-01T12:00:00Z', from: 'p1' },
      ]);

      const result = await service.getUnreadCountsForParticipants(
        [
          { id: 'p1', joinedAt: new Date('2024-01-01T10:00:00Z') },
          { id: 'p2', joinedAt: new Date('2024-01-01T10:00:00Z') },
        ],
        testConversationId
      );

      expect(result.get('p1')).toBe(1); // alice's only — p1's own message excluded
      expect(result.get('p2')).toBe(2); // both — neither was sent by p2
    });

    it('does NOT filter by senderId in the query (own-message cut is in memory)', async () => {
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastReadAt: new Date('2024-01-01T10:00:00Z') },
        { participantId: 'p2', lastReadAt: new Date('2024-01-01T08:00:00Z') },
      ]);
      mockCandidates([]);

      await service.getUnreadCountsForParticipants(
        [
          { id: 'p1', joinedAt: null },
          { id: 'p2', joinedAt: null },
        ],
        testConversationId
      );

      const where = mockPrisma.message.findMany.mock.calls[0][0].where;
      expect(where.conversationId).toBe(testConversationId);
      expect(where.deletedAt).toBeNull();
      expect(where.senderId).toBeUndefined();
      // Oldest floor (08:00) bounds the fetch — everything any participant could count
      expect(where.createdAt).toEqual({ gt: new Date('2024-01-01T08:00:00Z') });
    });

    it('drops the createdAt bound when a participant has a null floor (unbounded)', async () => {
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastReadAt: new Date('2024-01-01T10:00:00Z') },
      ]);
      mockCandidates([
        { at: '2024-01-01T09:00:00Z', from: 'other' },
        { at: '2024-01-01T11:00:00Z', from: 'other' },
        { at: '2024-01-01T12:00:00Z', from: 'other' },
      ]);

      const result = await service.getUnreadCountsForParticipants(
        [
          { id: 'p1', joinedAt: new Date('2024-01-01T10:00:00Z') },
          { id: 'p2', joinedAt: null }, // no cursor, no joinedAt → unbounded
        ],
        testConversationId
      );

      // Unbounded participant: full fetch, no createdAt bound on the query
      expect(mockPrisma.message.findMany.mock.calls[0][0].where.createdAt).toBeUndefined();
      // p2 counts ALL candidates; p1 only those strictly after 10:00 (11:00, 12:00)
      expect(result.get('p2')).toBe(3);
      expect(result.get('p1')).toBe(2);
    });

    it('does not count a message whose createdAt equals the floor (strict gt)', async () => {
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastReadAt: new Date('2024-01-01T10:00:00Z') },
      ]);
      mockCandidates([
        { at: '2024-01-01T10:00:00Z', from: 'other' }, // exactly at floor → excluded
        { at: '2024-01-01T10:00:01Z', from: 'other' }, // after floor → counted
      ]);

      const result = await service.getUnreadCountsForParticipants(
        [{ id: 'p1', joinedAt: null }],
        testConversationId
      );

      expect(result.get('p1')).toBe(1);
    });

    it('returns 0 when the floor is at or after every candidate', async () => {
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastReadAt: new Date('2024-01-01T23:00:00Z') },
      ]);
      mockCandidates([
        { at: '2024-01-01T11:00:00Z', from: 'other' },
        { at: '2024-01-01T12:00:00Z', from: 'other' },
      ]);

      const result = await service.getUnreadCountsForParticipants(
        [{ id: 'p1', joinedAt: null }],
        testConversationId
      );

      expect(result.get('p1')).toBe(0);
    });

    it('returns zero-count map when DB throws', async () => {
      mockPrisma.conversationReadCursor.findMany.mockRejectedValue(new Error('DB error'));
      const participants = [{ id: 'p1', joinedAt: null }];

      const result = await service.getUnreadCountsForParticipants(
        participants, testConversationId
      );

      expect(result.get('p1')).toBe(0);
    });

    it("subtracts a participant's OWN messages correctly even when rows arrive out of createdAt order", async () => {
      // Defensive-ordering contract: `countAbove` is a binary search that assumes the
      // arrays it walks are ascending. The service sorts BOTH the merged `allTimestamps`
      // AND every per-sender bucket precisely so the counts hold "regardless of source
      // ordering". If only the total were defensively sorted (leaving the per-sender
      // subtrahend in raw row order), the own-message cut would miscount the moment rows
      // are unordered — producing a bogus unread count.
      //
      // All three candidates are p2's OWN messages, so p2's unread MUST be 0. p2's floor
      // (13:00) falls in the MIDDLE of them, so an unsorted own-bucket binary search
      // undercounts p2's own messages after the floor and leaves phantom unread.
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      mockCandidates([
        { at: '2024-01-01T15:00:00Z', from: 'p2' },
        { at: '2024-01-01T11:00:00Z', from: 'p2' },
        { at: '2024-01-01T14:00:00Z', from: 'p2' },
      ]);

      const result = await service.getUnreadCountsForParticipants(
        [
          { id: 'p1', joinedAt: new Date('2024-01-01T10:00:00Z') },
          { id: 'p2', joinedAt: new Date('2024-01-01T13:00:00Z') },
        ],
        testConversationId
      );

      // p1 (floor 10:00, no own messages) sees all three of p2's messages.
      expect(result.get('p1')).toBe(3);
      // p2 authored every candidate → zero unread, whatever order the rows arrived in.
      expect(result.get('p2')).toBe(0);
    });

    it('computes the min counting floor without an argument-spread overflow at 100k+ scale (regression)', async () => {
      // This fires on the hottest path (`_updateUnreadCounts` on EVERY `message:new`).
      // `floors` carries one entry per participant, so a public/global conversation at the
      // platform's 100k+ scale would blow `Math.min(...floors)` past V8's argument-spread
      // ceiling (~131k) → `RangeError: Maximum call stack size exceeded` → swallowed by the
      // service's catch → an all-ZERO unread map for the whole conversation. A reduce-based
      // min holds for any group size, so the real counts survive.
      const PARTICIPANT_COUNT = 200_000; // safely above the spread ceiling in Node 22
      const baseFloor = Date.parse('2024-01-01T10:00:00Z');
      // Distinct per-participant floors so the min is a genuine reduction, not a constant.
      // The OLDEST floor belongs to the last participant (baseFloor − PARTICIPANT_COUNT ms).
      const participants = Array.from({ length: PARTICIPANT_COUNT }, (_, i) => ({
        id: `p${i}`,
        joinedAt: new Date(baseFloor - i),
      }));
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      // One candidate strictly after every floor (so every participant has exactly 1 unread),
      // sent by someone none of them are, so no own-message cut applies.
      mockCandidates([{ at: '2024-01-01T12:00:00Z', from: 'someone-else' }]);

      const result = await service.getUnreadCountsForParticipants(
        participants, testConversationId
      );

      // The fetch is bounded by the OLDEST floor — proof the min reduction ran, not the
      // unbounded (undefined) branch and not the swallowed-error zero map.
      expect(mockPrisma.message.findMany.mock.calls[0][0].where.createdAt).toEqual({
        gt: new Date(baseFloor - (PARTICIPANT_COUNT - 1)),
      });
      // Real counts survived (the RangeError path would have made every entry 0).
      expect(result.size).toBe(PARTICIPANT_COUNT);
      expect(result.get('p0')).toBe(1);
      expect(result.get(`p${PARTICIPANT_COUNT - 1}`)).toBe(1);
    });
  });

  describe('markMessagesAsReceived error path', () => {
    it('throws when cursor advance fails', async () => {
      (MessageReadStatusService as any).recentActionCache.clear();
      mockPrisma.conversationReadCursor.updateMany.mockRejectedValue(new Error('updateMany fail'));

      await expect(
        service.markMessagesAsReceived(testParticipantId, testConversationId, testMessageId)
      ).rejects.toThrow('updateMany fail');
    });
  });

  describe('markMessagesAsRead', () => {
    it('returns early when no latestMessageId and findFirst returns null', async () => {
      mockPrisma.message.findFirst.mockResolvedValue(null);

      // Should not throw and should not advance the cursor
      await service.markMessagesAsRead(testParticipantId, testConversationId);
      expect(mockPrisma.conversationReadCursor.updateMany).not.toHaveBeenCalled();
    });

    it('resolves latestMessageId from DB when not provided', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({ id: 'resolved-msg' });
      mockPrisma.participant.findUnique.mockResolvedValue({ userId: null });

      await service.markMessagesAsRead(testParticipantId, testConversationId);

      const updateManyCall = mockPrisma.conversationReadCursor.updateMany.mock.calls[0][0];
      expect(updateManyCall.data.lastReadMessageId).toBe('resolved-msg');
    });

    it('calls NotificationService when participant has userId', async () => {
      mockPrisma.participant.findUnique.mockResolvedValue({ userId: 'user-with-id' });

      await service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId);

      // No error thrown means the notification path was reached and succeeded
      expect(mockPrisma.participant.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: testParticipantId } })
      );
    });

    it('throws when cursor advance fails', async () => {
      (MessageReadStatusService as any).recentActionCache.clear();
      mockPrisma.conversationReadCursor.updateMany.mockRejectedValue(new Error('read updateMany fail'));

      await expect(
        service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId)
      ).rejects.toThrow('read updateMany fail');
    });
  });

  describe('getConversationReadStatuses error path', () => {
    it('throws when message.findMany fails', async () => {
      mockPrisma.message.findMany.mockRejectedValue(new Error('findMany fail'));

      await expect(
        service.getConversationReadStatuses(testConversationId, [testMessageId])
      ).rejects.toThrow('findMany fail');
    });
  });

  describe('getMessageStatusDetails', () => {
    it('throws when message is not found', async () => {
      mockPrisma.message.findUnique.mockResolvedValue(null);

      await expect(
        service.getMessageStatusDetails(testMessageId)
      ).rejects.toThrow('Message not found');
    });

    // #4179 — cette vue NOMINATIVE (qui a reçu/lu, et quand) était la seule
    // des trois lectures du service à n'avoir AUCUN moyen de respecter le
    // plancher d'historique du lecteur, alors que `GET /conversations/:id/status`
    // l'applique pour la même donnée. Un message antérieur au plancher rend le
    // même verdict qu'un message absent — jamais un verdict distinct, qui
    // révélerait depuis l'extérieur qu'il existe.
    it('treats a message older than the reader history floor as not found', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        createdAt: new Date('2024-01-01T00:00:00Z'),
        conversationId: testConversationId,
      });

      await expect(
        service.getMessageStatusDetails(testMessageId, {
          historyFloor: new Date('2024-06-01T00:00:00Z'),
        })
      ).rejects.toThrow('Message not found');
    });

    it('still resolves a message at or after the reader history floor', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        createdAt: new Date('2024-06-01T10:00:00Z'),
        conversationId: testConversationId,
      });
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      mockPrisma.participant.findMany.mockResolvedValue([]);

      const result = await service.getMessageStatusDetails(testMessageId, {
        historyFloor: new Date('2024-01-01T00:00:00Z'),
      });

      expect(result.statuses).toEqual([]);
    });

    it('returns paginated statuses for a found message', async () => {
      const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
      mockPrisma.message.findUnique.mockResolvedValue({
        createdAt: msgCreatedAt,
        conversationId: testConversationId,
      });
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        {
          participantId: 'p1',
          lastDeliveredAt: new Date('2024-06-01T10:01:00Z'),
          lastReadAt: new Date('2024-06-01T10:02:00Z'),
        },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p1', displayName: 'Alice', avatar: null },
      ]);

      const result = await service.getMessageStatusDetails(testMessageId);

      expect(result.statuses).toHaveLength(1);
      expect(result.statuses[0].displayName).toBe('Alice');
      expect(result.statuses[0].deliveredAt).not.toBeNull();
      expect(result.statuses[0].readAt).not.toBeNull();
      expect(result.pagination.total).toBe(1);
    });

    // Regression: this detail sheet must resolve avatars with the SAME rule as
    // its sibling getMessageReadStatus — participant-local avatar first, then the
    // linked account avatar, with blank/whitespace strings treated as absent.
    // A raw `participant.avatar` (a) dropped the account fallback and (b) leaked
    // `''` to the client, rendering a parasitic `<img src="">`.
    it('falls back to the linked account avatar when the participant-local avatar is blank', async () => {
      const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
      mockPrisma.message.findUnique.mockResolvedValue({
        createdAt: msgCreatedAt,
        conversationId: testConversationId,
      });
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: null },
        { participantId: 'p2', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: null },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        // Local avatar empty → account avatar wins.
        { id: 'p1', displayName: 'Alice', avatar: '', user: { avatar: 'account-alice.png' } },
        // Both blank → null (no parasitic <img src="">).
        { id: 'p2', displayName: 'Bob', avatar: '   ', user: { avatar: null } },
      ]);

      const result = await service.getMessageStatusDetails(testMessageId);

      const alice = result.statuses.find(s => s.participantId === 'p1');
      const bob = result.statuses.find(s => s.participantId === 'p2');
      expect(alice?.avatar).toBe('account-alice.png');
      expect(bob?.avatar).toBeNull();
    });

    it('prefers the frozen per-message timestamps over the moving cursor', async () => {
      const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
      // Cursor has moved far forward (e.g. conversation re-opened today).
      const movedCursorAt = new Date('2024-09-01T09:00:00Z');
      // But the message was actually read right after it was sent.
      const frozenReadAt = new Date('2024-06-01T10:02:00Z');
      const frozenDeliveredAt = new Date('2024-06-01T10:01:00Z');

      mockPrisma.message.findUnique.mockResolvedValue({
        createdAt: msgCreatedAt,
        conversationId: testConversationId,
      });
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastDeliveredAt: movedCursorAt, lastReadAt: movedCursorAt },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p1', displayName: 'Alice', avatar: null },
      ]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        { participantId: 'p1', deliveredAt: frozenDeliveredAt, receivedAt: frozenDeliveredAt, readAt: frozenReadAt, readDevice: 'ios' },
      ]);

      const result = await service.getMessageStatusDetails(testMessageId);

      // The frozen historical times win — NOT the re-advanced cursor value.
      expect(result.statuses[0].readAt).toEqual(frozenReadAt);
      expect(result.statuses[0].deliveredAt).toEqual(frozenDeliveredAt);
      expect(result.statuses[0].readDevice).toBe('ios');
    });

    // Mirror of getMessageReadStatus: a cursor deleted by cleanupObsoleteCursors
    // must not erase a surviving frozen receipt. The participant row is resolved
    // from the frozen entry's id (not only from cursor ids).
    it('still surfaces a frozen receipt when the participant cursor was deleted by cleanup', async () => {
      const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
      const frozenDeliveredAt = new Date('2024-06-01T10:01:00Z');
      const frozenReadAt = new Date('2024-06-01T10:02:00Z');

      mockPrisma.message.findUnique.mockResolvedValue({
        createdAt: msgCreatedAt,
        conversationId: testConversationId,
      });
      // No cursors remain (deleted by cleanup).
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      // Participant row still active, resolved via the frozen-entry id.
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p1', displayName: 'Alice', avatar: null },
      ]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        { participantId: 'p1', deliveredAt: frozenDeliveredAt, receivedAt: frozenDeliveredAt, readAt: frozenReadAt, readDevice: 'ios' },
      ]);

      const result = await service.getMessageStatusDetails(testMessageId);

      expect(result.statuses).toHaveLength(1);
      expect(result.statuses[0].participantId).toBe('p1');
      expect(result.statuses[0].deliveredAt).toEqual(frozenDeliveredAt);
      expect(result.statuses[0].readAt).toEqual(frozenReadAt);
      expect(result.pagination.total).toBe(1);
    });

    it('skips orphan cursors (participant not found)', async () => {
      const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
      mockPrisma.message.findUnique.mockResolvedValue({
        createdAt: msgCreatedAt,
        conversationId: testConversationId,
      });
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        {
          participantId: 'orphan-p',
          lastDeliveredAt: new Date('2024-06-01T10:01:00Z'),
          lastReadAt: null,
        },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([]);

      const result = await service.getMessageStatusDetails(testMessageId);

      expect(result.statuses).toHaveLength(0);
    });

    it('applies delivered filter correctly', async () => {
      const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
      mockPrisma.message.findUnique.mockResolvedValue({
        createdAt: msgCreatedAt,
        conversationId: testConversationId,
      });
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: null },
        { participantId: 'p2', lastDeliveredAt: null, lastReadAt: null },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p1', displayName: 'Alice', avatar: null },
        { id: 'p2', displayName: 'Bob', avatar: null },
      ]);

      const result = await service.getMessageStatusDetails(testMessageId, { filter: 'delivered' });
      expect(result.statuses).toHaveLength(1);
      expect(result.statuses[0].displayName).toBe('Alice');
    });

    it('applies read filter correctly', async () => {
      const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
      mockPrisma.message.findUnique.mockResolvedValue({
        createdAt: msgCreatedAt,
        conversationId: testConversationId,
      });
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastDeliveredAt: null, lastReadAt: new Date('2024-06-01T10:02:00Z') },
        { participantId: 'p2', lastDeliveredAt: null, lastReadAt: null },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p1', displayName: 'Alice', avatar: null },
        { id: 'p2', displayName: 'Bob', avatar: null },
      ]);

      const result = await service.getMessageStatusDetails(testMessageId, { filter: 'read' });
      expect(result.statuses).toHaveLength(1);
      expect(result.statuses[0].readAt).not.toBeNull();
    });

    it('applies unread filter correctly', async () => {
      const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
      mockPrisma.message.findUnique.mockResolvedValue({
        createdAt: msgCreatedAt,
        conversationId: testConversationId,
      });
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastDeliveredAt: null, lastReadAt: new Date('2024-06-01T10:02:00Z') },
        { participantId: 'p2', lastDeliveredAt: null, lastReadAt: null },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p1', displayName: 'Alice', avatar: null },
        { id: 'p2', displayName: 'Bob', avatar: null },
      ]);

      const result = await service.getMessageStatusDetails(testMessageId, { filter: 'unread' });
      expect(result.statuses).toHaveLength(1);
      expect(result.statuses[0].displayName).toBe('Bob');
    });

    it('handles pagination correctly', async () => {
      const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
      mockPrisma.message.findUnique.mockResolvedValue({ createdAt: msgCreatedAt, conversationId: testConversationId });
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: null },
        { participantId: 'p2', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: null },
        { participantId: 'p3', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: null },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p1', displayName: 'A', avatar: null },
        { id: 'p2', displayName: 'B', avatar: null },
        { id: 'p3', displayName: 'C', avatar: null },
      ]);

      const result = await service.getMessageStatusDetails(testMessageId, { offset: 1, limit: 1 });
      expect(result.statuses).toHaveLength(1);
      expect(result.pagination.total).toBe(3);
      expect(result.pagination.hasMore).toBe(true);
    });

    it('throws when DB query fails', async () => {
      mockPrisma.message.findUnique.mockRejectedValue(new Error('DB error'));
      await expect(service.getMessageStatusDetails(testMessageId)).rejects.toThrow('DB error');
    });

    it('returns empty statuses when no cursors found', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        createdAt: new Date(),
        conversationId: testConversationId,
      });
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);

      const result = await service.getMessageStatusDetails(testMessageId);
      expect(result.statuses).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
      expect(mockPrisma.participant.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getAttachmentStatusDetails', () => {
    it('returns paginated attachment statuses', async () => {
      const viewedAt = new Date('2024-06-01T11:00:00Z');
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([
        {
          participantId: 'p1',
          viewedAt,
          downloadedAt: null,
          listenedAt: null,
          watchedAt: null,
          listenCount: 0,
          watchCount: 0,
          listenedComplete: false,
          watchedComplete: false,
          lastPlayPositionMs: null,
          lastWatchPositionMs: null,
        },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p1', displayName: 'Charlie', avatar: 'avatar.png' },
      ]);

      const result = await service.getAttachmentStatusDetails(testAttachmentId);

      expect(result.statuses).toHaveLength(1);
      expect(result.statuses[0].username).toBe('Charlie');
      expect(result.statuses[0].viewedAt).toBe(viewedAt);
      expect(result.pagination.total).toBe(1);
    });

    it('sert la trace détaillée, avec les motifs d\'arrêt', async () => {
      // La vue de détail est la seule à porter la trace complète : c'est elle
      // qui dit qu'une écoute s'est arrêtée en pause plutôt qu'en abandon.
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([
        {
          participantId: 'p1',
          viewedAt: null,
          downloadedAt: null,
          listenedAt: new Date('2025-01-01T10:00:00Z'),
          watchedAt: null,
          listenCount: 2,
          watchCount: 0,
          listenedComplete: false,
          watchedComplete: false,
          lastPlayPositionMs: 9500,
          lastWatchPositionMs: null,
          listenSegments: [
            { startMs: 0, endMs: 1000, endedBy: 'seek' },
            { startMs: 9000, endMs: 9500, endedBy: 'dismissed' },
          ],
          watchSegments: null,
          viewCount: 0,
          viewedLanguages: ['fr'],
        },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p1', displayName: 'Dana', avatar: null },
      ]);

      const result = await service.getAttachmentStatusDetails(testAttachmentId);
      const status = result.statuses[0];

      expect(status.listenStretches).toEqual([
        { startMs: 0, endMs: 1000, endedBy: 'seek' },
        { startMs: 9000, endMs: 9500, endedBy: 'dismissed' },
      ]);
      // 1000 + 500 : la couverture ne compte pas le trou entre les deux.
      expect(status.coveredListenMs).toBe(1500);
      expect(status.viewedLanguages).toEqual(['fr']);
      expect(result.languageBreakdown).toEqual([{ language: 'fr', count: 1 }]);
    });

    it('ne casse pas sur une trace corrompue en base', async () => {
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(1);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([
        {
          participantId: 'p1',
          viewedAt: null,
          downloadedAt: null,
          listenedAt: new Date('2025-01-01T10:00:00Z'),
          watchedAt: null,
          listenCount: 1,
          watchCount: 0,
          listenedComplete: false,
          watchedComplete: false,
          lastPlayPositionMs: null,
          lastWatchPositionMs: null,
          listenSegments: 'pas un tableau',
          watchSegments: [{ startMs: 'nope' }],
          viewCount: 0,
          viewedLanguages: null,
        },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p1', displayName: 'Dana', avatar: null },
      ]);

      const result = await service.getAttachmentStatusDetails(testAttachmentId);

      expect(result.statuses[0].listenStretches).toEqual([]);
      expect(result.statuses[0].watchStretches).toEqual([]);
      expect(result.statuses[0].viewedLanguages).toEqual([]);
    });

    // Regression: same avatar-resolution rule as the message read-status lists —
    // local avatar first, account avatar fallback, blank/whitespace = absent.
    it('falls back to the linked account avatar when the participant-local avatar is blank', async () => {
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([
        {
          participantId: 'p1',
          viewedAt: new Date('2024-06-01T11:00:00Z'),
          downloadedAt: null, listenedAt: null, watchedAt: null,
          listenCount: 0, watchCount: 0, listenedComplete: false, watchedComplete: false,
          lastPlayPositionMs: null, lastWatchPositionMs: null,
        },
        {
          participantId: 'p2',
          viewedAt: new Date('2024-06-01T11:00:00Z'),
          downloadedAt: null, listenedAt: null, watchedAt: null,
          listenCount: 0, watchCount: 0, listenedComplete: false, watchedComplete: false,
          lastPlayPositionMs: null, lastWatchPositionMs: null,
        },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p1', displayName: 'Charlie', avatar: '', user: { avatar: 'account-charlie.png' } },
        { id: 'p2', displayName: 'Dana', avatar: '   ', user: { avatar: null } },
      ]);

      const result = await service.getAttachmentStatusDetails(testAttachmentId);

      const charlie = result.statuses.find(s => s.participantId === 'p1');
      const dana = result.statuses.find(s => s.participantId === 'p2');
      expect(charlie?.avatar).toBe('account-charlie.png');
      expect(dana?.avatar).toBeNull();
    });

    it('filters by viewed status', async () => {
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(0);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([]);

      await service.getAttachmentStatusDetails(testAttachmentId, { filter: 'viewed' });

      expect(mockPrisma.attachmentStatusEntry.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ viewedAt: { not: null } }),
        })
      );
    });

    it('filters by downloaded status', async () => {
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(0);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([]);

      await service.getAttachmentStatusDetails(testAttachmentId, { filter: 'downloaded' });

      expect(mockPrisma.attachmentStatusEntry.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ downloadedAt: { not: null } }),
        })
      );
    });

    it('filters by listened status', async () => {
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(0);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([]);

      await service.getAttachmentStatusDetails(testAttachmentId, { filter: 'listened' });

      expect(mockPrisma.attachmentStatusEntry.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ listenedAt: { not: null } }),
        })
      );
    });

    it('filters by watched status', async () => {
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(0);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([]);

      await service.getAttachmentStatusDetails(testAttachmentId, { filter: 'watched' });

      expect(mockPrisma.attachmentStatusEntry.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ watchedAt: { not: null } }),
        })
      );
    });

    it('skips orphan participant rows', async () => {
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(2);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([
        {
          participantId: 'orphan',
          viewedAt: null, downloadedAt: null, listenedAt: null, watchedAt: null,
          listenCount: 0, watchCount: 0, listenedComplete: false, watchedComplete: false,
          lastPlayPositionMs: null, lastWatchPositionMs: null,
        },
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([]);

      const result = await service.getAttachmentStatusDetails(testAttachmentId);
      expect(result.statuses).toHaveLength(0);
    });

    it('returns empty when no statuses found', async () => {
      mockPrisma.attachmentStatusEntry.count.mockResolvedValue(0);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([]);

      const result = await service.getAttachmentStatusDetails(testAttachmentId);

      expect(result.statuses).toHaveLength(0);
      expect(mockPrisma.participant.findMany).not.toHaveBeenCalled();
    });

    it('throws when DB query fails', async () => {
      mockPrisma.attachmentStatusEntry.count.mockRejectedValue(new Error('att DB fail'));
      await expect(service.getAttachmentStatusDetails(testAttachmentId)).rejects.toThrow('att DB fail');
    });
  });

  describe('getLatestMessageSummary', () => {
    it('returns zeros when no messages found', async () => {
      mockPrisma.message.findFirst.mockResolvedValue(null);

      const result = await service.getLatestMessageSummary(testConversationId);

      expect(result).toEqual({ totalMembers: 0, deliveredCount: 0, readCount: 0 });
    });

    it('returns summary based on active participants and cursors', async () => {
      const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
      mockPrisma.message.findFirst.mockResolvedValue({
        createdAt: msgCreatedAt,
        senderId: 'sender-id',
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p1' }, { id: 'p2' },
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: new Date('2024-06-01T10:02:00Z') },
        { participantId: 'p2', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: null },
      ]);

      const result = await service.getLatestMessageSummary(testConversationId);

      expect(result.totalMembers).toBe(2);
      expect(result.deliveredCount).toBe(2);
      expect(result.readCount).toBe(1);
    });

    it('only counts cursors from active participants', async () => {
      const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
      mockPrisma.message.findFirst.mockResolvedValue({
        createdAt: msgCreatedAt,
        senderId: 'sender-id',
      });
      mockPrisma.participant.findMany.mockResolvedValue([{ id: 'p1' }]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'inactive-p', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: null },
        { participantId: 'p1', lastDeliveredAt: null, lastReadAt: null },
      ]);

      const result = await service.getLatestMessageSummary(testConversationId);

      expect(result.deliveredCount).toBe(0);
    });

    it('counts a frozen delivery entry when the cursor row was cleaned up (frozen-union parity)', async () => {
      const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
      mockPrisma.message.findFirst.mockResolvedValue({
        id: 'm-latest',
        createdAt: msgCreatedAt,
        senderId: 'sender-id',
      });
      mockPrisma.participant.findMany.mockResolvedValue([{ id: 'p1' }]);
      // cleanupObsoleteCursors deleted p1's cursor (its lastReadMessageId pointed
      // at a since-deleted message), but the write-once frozen delivery entry for
      // the latest message survives.
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        { participantId: 'p1', deliveredAt: new Date('2024-06-01T10:01:00Z'), receivedAt: null, readAt: null },
      ]);

      const result = await service.getLatestMessageSummary(testConversationId);

      expect(result.totalMembers).toBe(1);
      expect(result.deliveredCount).toBe(1);
      expect(result.readCount).toBe(0);
    });

    it('counts a frozen read entry when the cursor row was cleaned up', async () => {
      const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
      mockPrisma.message.findFirst.mockResolvedValue({
        id: 'm-latest',
        createdAt: msgCreatedAt,
        senderId: 'sender-id',
      });
      mockPrisma.participant.findMany.mockResolvedValue([{ id: 'p1' }]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        { participantId: 'p1', deliveredAt: new Date('2024-06-01T10:01:00Z'), receivedAt: null, readAt: new Date('2024-06-01T10:02:00Z') },
      ]);

      const result = await service.getLatestMessageSummary(testConversationId);

      expect(result.deliveredCount).toBe(1);
      expect(result.readCount).toBe(1);
    });

    it('ignores a frozen entry from an inactive participant', async () => {
      const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
      mockPrisma.message.findFirst.mockResolvedValue({
        id: 'm-latest',
        createdAt: msgCreatedAt,
        senderId: 'sender-id',
      });
      mockPrisma.participant.findMany.mockResolvedValue([{ id: 'p1' }]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        { participantId: 'left-the-conversation', deliveredAt: new Date('2024-06-01T10:01:00Z'), receivedAt: null, readAt: null },
      ]);

      const result = await service.getLatestMessageSummary(testConversationId);

      expect(result.deliveredCount).toBe(0);
      expect(result.readCount).toBe(0);
    });

    it('does not double-count a participant present in both cursor and frozen entry', async () => {
      const msgCreatedAt = new Date('2024-06-01T10:00:00Z');
      mockPrisma.message.findFirst.mockResolvedValue({
        id: 'm-latest',
        createdAt: msgCreatedAt,
        senderId: 'sender-id',
      });
      mockPrisma.participant.findMany.mockResolvedValue([{ id: 'p1' }]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: new Date('2024-06-01T10:02:00Z') },
      ]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([
        { participantId: 'p1', deliveredAt: new Date('2024-06-01T10:01:00Z'), receivedAt: null, readAt: new Date('2024-06-01T10:02:00Z') },
      ]);

      const result = await service.getLatestMessageSummary(testConversationId);

      expect(result.deliveredCount).toBe(1);
      expect(result.readCount).toBe(1);
    });

    it('returns zeros and logs error on DB failure', async () => {
      mockPrisma.message.findFirst.mockRejectedValue(new Error('connection lost'));

      const result = await service.getLatestMessageSummary(testConversationId);

      expect(result).toEqual({ totalMembers: 0, deliveredCount: 0, readCount: 0 });
    });
  });

  describe('updateAttachmentComputedStatus — video all-watched path', () => {
    beforeEach(() => {
      // Reset these mocks fully to clear any queued Once handlers from prior tests
      mockPrisma.attachmentStatusEntry.count.mockReset();
      mockPrisma.attachmentStatusEntry.findFirst.mockReset();
      mockPrisma.$transaction.mockReset();
      mockPrisma.messageAttachment.findUnique.mockResolvedValue({
        id: testAttachmentId,
        messageId: testMessageId,
        mimeType: 'video/mp4',
        message: { conversationId: testConversationId, senderId: 'sender-id' },
      });
      mockPrisma.participant.count.mockResolvedValue(1);
      mockPrisma.messageAttachment.update.mockResolvedValue({});
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
    });

    it('sets watchedByAllAt when all participants watched (video)', async () => {
      const watchedAt = new Date('2024-06-01T12:00:00Z');
      mockPrisma.attachmentStatusEntry.count.mockImplementation((args: any) => {
        if (args?.where?.watchedAt) return Promise.resolve(1);
        return Promise.resolve(0);
      });
      mockPrisma.attachmentStatusEntry.findFirst.mockImplementation(() =>
        Promise.resolve({ watchedAt })
      );

      await service.markVideoAsWatched(testParticipantId, testAttachmentId);

      const updateData = mockPrisma.messageAttachment.update.mock.calls[0]?.[0]?.data;
      expect(updateData?.watchedByAllAt).toEqual(watchedAt);
    });

    it('logs error when updateAttachmentComputedStatus DB call fails', async () => {
      mockPrisma.attachmentStatusEntry.count.mockRejectedValue(new Error('count fail'));
      mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));

      // Should not throw — error is caught and logged inside updateAttachmentComputedStatus
      await service.markVideoAsWatched(testParticipantId, testAttachmentId);
    });
  });

  describe('cleanupObsoleteCursors error path', () => {
    it('throws when conversationReadCursor.findMany fails', async () => {
      mockPrisma.conversationReadCursor.findMany.mockRejectedValue(new Error('cursor error'));

      await expect(
        service.cleanupObsoleteCursors(testConversationId)
      ).rejects.toThrow('cursor error');
    });
  });

  // ===========================================================
  // BRANCH GAP-FILL: uncovered catch blocks + no-op method
  // ===========================================================

  describe('markMessagesAsReceived — cursor read error swallowed', () => {
    it('completes even when the best-effort prev-cursor lookup fails', async () => {
      // The best-effort findUnique (prevDeliveredAt window) throws — must be swallowed.
      mockPrisma.conversationReadCursor.findUnique.mockRejectedValue(new Error('cursor lookup fail'));

      // #4179 — la méthode rend désormais le nombre d'entrées RÉELLEMENT
      // figées (markedCount) plutôt que `undefined` ; le contrat vérifié ici
      // reste « ne jette pas » malgré la panne best-effort.
      await expect(
        service.markMessagesAsReceived(testParticipantId, testConversationId, testMessageId)
      ).resolves.toEqual(expect.any(Number));
    });
  });

  describe('markMessagesAsRead — notification sync error swallowed', () => {
    it('completes normally when participant.findUnique throws during notification sync', async () => {
      // participant.findUnique throws inside the notification-sync try block
      mockPrisma.participant.findUnique.mockRejectedValue(new Error('participant lookup fail'));

      // L'intention est « ne jette pas » : la panne de synchronisation des
      // notifications est avalée. La méthode rend désormais le nombre d'entrées
      // figées plutôt que `undefined` — le contrat vérifié ici est la résolution.
      await expect(
        service.markMessagesAsRead(testParticipantId, testConversationId, testMessageId)
      ).resolves.toEqual(expect.any(Number));
    });
  });

  describe('updateMessageComputedStatus — no-op legacy method', () => {
    it('resolves to undefined without side effects', async () => {
      await expect(
        service.updateMessageComputedStatus(testMessageId)
      ).resolves.toBeUndefined();
    });
  });

  describe('getUnreadCountsForConversations — empty participantIds guard', () => {
    it('returns empty Map when participantIds array is empty', async () => {
      const result = await service.getUnreadCountsForConversations([], [testConversationId]);
      expect(result).toEqual(new Map());
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Bascule EXACT_READ_TRACKING_SINCE
  //
  // Armée, un message dépourvu de `readAt` figé cesse d'être déclaré lu au seul
  // motif que le curseur l'a dépassé. Les tests voisins n'exercent JAMAIS ce
  // chemin — la bascule étant désarmée par défaut — d'où ce bloc dédié : sans
  // lui, un câblage incorrect passerait inaperçu.
  //
  // `deliveredAt` conserve son repli curseur : un message récupéré est livré.
  // @see docs/superpowers/specs/2026-07-24-read-exactness-design.md
  // ───────────────────────────────────────────────────────────────────────────
  describe('bascule du suivi exact (EXACT_READ_TRACKING_SINCE)', () => {
    const ENV_KEY = 'EXACT_READ_TRACKING_SINCE';
    const originalEnv = process.env[ENV_KEY];

    // Tous les messages des montages ci-dessous sont postérieurs à cette date,
    // donc soumis au suivi exact une fois la bascule armée.
    const armCutover = () => { process.env[ENV_KEY] = '2024-01-01T00:00:00.000Z'; };

    afterEach(() => {
      if (originalEnv === undefined) delete process.env[ENV_KEY];
      else process.env[ENV_KEY] = originalEnv;
    });

    it('getMessageReadStatus: a cursor-only read no longer counts', async () => {
      armCutover();
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        createdAt: new Date('2025-01-01T10:00:00Z'),
        senderId: testParticipantId,
        anonymousSenderId: null,
        conversationId: testConversationId
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: testParticipantId, displayName: 'User1' },
        { id: testParticipantId2, displayName: 'User2' }
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([{
        participantId: testParticipantId2,
        lastDeliveredAt: new Date('2025-01-01T10:05:00Z'),
        lastReadAt: new Date('2025-01-01T10:10:00Z'),
        participant: { id: testParticipantId2, displayName: 'User2' }
      }]);

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      expect(result.readCount).toBe(0);
      expect(result.readBy).toHaveLength(0);
      // La livraison, elle, reste établie par le curseur.
      expect(result.receivedCount).toBe(1);
    });

    it('getConversationReadStatuses: a cursor-only read no longer counts', async () => {
      armCutover();
      mockPrisma.message.findMany.mockResolvedValue([
        { id: testMessageId, createdAt: new Date('2025-01-01T10:00:00Z'), senderId: 'sender-1' }
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([{
        participantId: testParticipantId,
        lastDeliveredAt: new Date('2025-01-01T12:00:00Z'),
        lastReadAt: new Date('2025-01-01T12:00:00Z')
      }]);

      const result = await service.getConversationReadStatuses(testConversationId, [testMessageId]);

      expect(result.get(testMessageId)).toEqual(
        expect.objectContaining({ receivedCount: 1, readCount: 0 })
      );
    });

    it('getMessageStatusDetails: readAt falls back to null, deliveredAt survives', async () => {
      armCutover();
      mockPrisma.message.findUnique.mockResolvedValue({
        createdAt: new Date('2024-06-01T10:00:00Z'),
        conversationId: testConversationId
      });
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([{
        participantId: 'p1',
        lastDeliveredAt: new Date('2024-06-01T10:01:00Z'),
        lastReadAt: new Date('2024-06-01T10:02:00Z')
      }]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p1', displayName: 'Alice', avatar: null }
      ]);

      const result = await service.getMessageStatusDetails(testMessageId);

      expect(result.statuses[0].readAt).toBeNull();
      expect(result.statuses[0].deliveredAt).not.toBeNull();
    });

    it('getLatestMessageSummary: a cursor-only read no longer counts', async () => {
      armCutover();
      mockPrisma.message.findFirst.mockResolvedValue({
        createdAt: new Date('2024-06-01T10:00:00Z'),
        senderId: 'sender-id'
      });
      mockPrisma.participant.findMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: new Date('2024-06-01T10:02:00Z') },
        { participantId: 'p2', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: null }
      ]);

      const result = await service.getLatestMessageSummary(testConversationId);

      expect(result.readCount).toBe(0);
      expect(result.deliveredCount).toBe(2);
    });

    it('a message PREDATING the cutover keeps the legacy cursor fallback', async () => {
      armCutover();
      // Créé avant la bascule : il n'a jamais eu l'occasion d'être gelé, le
      // priver du repli le ferait basculer à tort en « jamais vu ».
      mockPrisma.message.findFirst.mockResolvedValue({
        createdAt: new Date('2023-06-01T10:00:00Z'),
        senderId: 'sender-id'
      });
      mockPrisma.participant.findMany.mockResolvedValue([{ id: 'p1' }]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p1', lastDeliveredAt: new Date('2023-06-01T10:01:00Z'), lastReadAt: new Date('2023-06-01T10:02:00Z') }
      ]);

      const result = await service.getLatestMessageSummary(testConversationId);

      expect(result.readCount).toBe(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // showReadReceipts — le participant opt-out sort du NUMÉRATEUR et du
  // DÉNOMINATEUR.
  //
  // Le retirer du seul numérateur rendrait le total définitivement
  // inatteignable, ce qui trahirait son existence ; garder le compteur en
  // masquant son nom laisserait déduire trivialement qu'il a lu. L'exclure des
  // deux le rend simplement invisible, et « lu par tous » reste atteignable.
  //
  // Ce versant-ci protège une donnée personnelle : il est donc autoritaire côté
  // serveur. Le versant réciproque (« je ne partage pas, je ne vois pas ») est
  // une règle d'équité — ce qu'elle masquerait est consenti par les autres —
  // et vit côté client, où il s'applique uniformément au REST et au temps réel.
  // @see docs/superpowers/specs/2026-07-24-read-exactness-design.md
  // ───────────────────────────────────────────────────────────────────────────
  describe('showReadReceipts — exclusion du participant opt-out', () => {
    // Forme HÉRITÉE : les lignes clé/valeur de `/user-preferences/privacy`,
    // endpoint retiré en janvier 2026. Ces témoins gardent le repli vivant —
    // un opt-out posé pendant cette fenêtre doit rester honoré.
    const optOutRows = (userId: string) => [
      { userId, key: 'show-read-receipts', value: 'false' },
    ];

    // Forme VIVANTE : le document JSON qu'écrit `PATCH /me/preferences/privacy`,
    // seule porte que le web et iOS appellent.
    const optOutDocument = (userId: string) => [
      { userId, privacy: { showReadReceipts: false } },
    ];

    it('getMessageReadStatus: excluded from readCount AND totalMembers', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        id: testMessageId,
        createdAt: new Date('2025-01-01T10:00:00Z'),
        senderId: 'sender-p',
        anonymousSenderId: null,
        conversationId: testConversationId
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'sender-p', userId: 'u-sender', displayName: 'Sender' },
        { id: 'p-optout', userId: 'u-optout', displayName: 'Discret' },
        { id: 'p-normal', userId: 'u-normal', displayName: 'Normal' }
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p-optout', lastDeliveredAt: new Date('2025-01-01T10:05:00Z'), lastReadAt: new Date('2025-01-01T10:10:00Z') },
        { participantId: 'p-normal', lastDeliveredAt: new Date('2025-01-01T10:05:00Z'), lastReadAt: new Date('2025-01-01T10:10:00Z') }
      ]);
      mockPrisma.userPreference.findMany.mockResolvedValue(optOutRows('u-optout'));

      const result = await service.getMessageReadStatus(testMessageId, testConversationId);

      // Dénominateur : 3 membres − l'expéditeur − l'opt-out = 1
      expect(result.totalMembers).toBe(1);
      expect(result.readCount).toBe(1);
      expect(result.readBy.map((r: any) => r.participantId)).toEqual(['p-normal']);
      // « lu par tous » reste atteignable : 1/1.
      expect(result.readCount).toBe(result.totalMembers);
    });

    it('getLatestMessageSummary: the opt-out read no longer leaks into the broadcast summary', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({
        createdAt: new Date('2024-06-01T10:00:00Z'),
        senderId: 'sender-p'
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p-optout', userId: 'u-optout' },
        { id: 'p-normal', userId: 'u-normal' }
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p-optout', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: new Date('2024-06-01T10:02:00Z') },
        { participantId: 'p-normal', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: null }
      ]);
      mockPrisma.userPreference.findMany.mockResolvedValue(optOutRows('u-optout'));

      const result = await service.getLatestMessageSummary(testConversationId);

      expect(result.totalMembers).toBe(1);
      expect(result.readCount).toBe(0);
    });

    it('getMessageStatusDetails: the opt-out participant is absent from the list', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        createdAt: new Date('2024-06-01T10:00:00Z'),
        conversationId: testConversationId
      });
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p-optout', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: new Date('2024-06-01T10:02:00Z') },
        { participantId: 'p-normal', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: null }
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p-optout', userId: 'u-optout', displayName: 'Discret', avatar: null },
        { id: 'p-normal', userId: 'u-normal', displayName: 'Normal', avatar: null }
      ]);
      mockPrisma.userPreference.findMany.mockResolvedValue(optOutRows('u-optout'));

      const result = await service.getMessageStatusDetails(testMessageId);

      expect(result.statuses.map((s: any) => s.participantId)).toEqual(['p-normal']);
      expect(result.pagination.total).toBe(1);
    });

    it('getConversationReadStatuses: the opt-out is excluded from the batch counts', async () => {
      mockPrisma.message.findMany.mockResolvedValue([
        { id: testMessageId, createdAt: new Date('2025-01-01T10:00:00Z'), senderId: 'sender-p' }
      ]);
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p-optout', userId: 'u-optout' },
        { id: 'p-normal', userId: 'u-normal' }
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p-optout', lastDeliveredAt: new Date('2025-01-01T12:00:00Z'), lastReadAt: new Date('2025-01-01T12:00:00Z') },
        { participantId: 'p-normal', lastDeliveredAt: new Date('2025-01-01T12:00:00Z'), lastReadAt: new Date('2025-01-01T12:00:00Z') }
      ]);
      mockPrisma.userPreference.findMany.mockResolvedValue(optOutRows('u-optout'));

      const result = await service.getConversationReadStatuses(testConversationId, [testMessageId]);

      expect(result.get(testMessageId)).toEqual(
        expect.objectContaining({ receivedCount: 1, readCount: 1 })
      );
    });

    it('does not re-query the preference for a user already resolved', async () => {
      // getLatestMessageSummary est appelée à CHAQUE accusé de lecture (5 sites,
      // dont des handlers socket) : une requête de plus par appel y serait payée
      // en permanence. Le résultat est donc mémoïsé par utilisateur.
      const summaryFixture = () => {
        mockPrisma.message.findFirst.mockResolvedValue({
          createdAt: new Date('2024-06-01T10:00:00Z'),
          senderId: 'sender-p'
        });
        mockPrisma.participant.findMany.mockResolvedValue([
          { id: 'p-cached', userId: 'u-cached' }
        ]);
        mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
          { participantId: 'p-cached', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: null }
        ]);
      };

      summaryFixture();
      await service.getLatestMessageSummary(testConversationId);
      const afterFirst = mockPrisma.userPreference.findMany.mock.calls.length;
      expect(afterFirst).toBe(1);

      summaryFixture();
      await service.getLatestMessageSummary(testConversationId);

      expect(mockPrisma.userPreference.findMany.mock.calls.length).toBe(afterFirst);
    });

    it('honore un opt-out posé par l’application (document JSON), pas seulement les lignes héritées', async () => {
      // LE défaut du cycle 46 : la porte ne lisait que les lignes clé/valeur,
      // que plus aucun chemin vivant n'écrit. L'utilisateur coupait ses accusés
      // dans l'écran Confidentialité, le réglage revenait bien à l'affichage
      // (le `GET` relit le même document), et le serveur continuait de diffuser.
      mockPrisma.message.findFirst.mockResolvedValue({
        createdAt: new Date('2024-06-01T10:00:00Z'),
        senderId: 'sender-p'
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p-doc-optout', userId: 'u-doc-optout' },
        { id: 'p-doc-normal', userId: 'u-doc-normal' }
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p-doc-optout', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: new Date('2024-06-01T10:02:00Z') },
        { participantId: 'p-doc-normal', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: null }
      ]);
      mockPrisma.userPreferences.findMany.mockResolvedValue(optOutDocument('u-doc-optout'));

      const result = await service.getLatestMessageSummary(testConversationId);

      expect(result.totalMembers).toBe(1);
      expect(result.readCount).toBe(0);
    });

    it('le document JSON prime sur une ligne héritée qui le contredit', async () => {
      // Le repli hérité ne doit jamais rouvrir ce qu'un réglage COURANT a fermé,
      // ni fermer ce qu'il a rouvert : une personne qui avait coupé ses accusés
      // en janvier puis les a rétablis reste visible.
      mockPrisma.message.findFirst.mockResolvedValue({
        createdAt: new Date('2024-06-01T10:00:00Z'),
        senderId: 'sender-p'
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p-reopened', userId: 'u-reopened' }
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p-reopened', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: new Date('2024-06-01T10:02:00Z') }
      ]);
      mockPrisma.userPreference.findMany.mockResolvedValue(optOutRows('u-reopened'));
      mockPrisma.userPreferences.findMany.mockResolvedValue([
        { userId: 'u-reopened', privacy: { showReadReceipts: true } }
      ]);

      const result = await service.getLatestMessageSummary(testConversationId);

      expect(result.totalMembers).toBe(1);
      expect(result.readCount).toBe(1);
    });

    it('an anonymous participant has no stored preference and stays visible', async () => {
      mockPrisma.message.findFirst.mockResolvedValue({
        createdAt: new Date('2024-06-01T10:00:00Z'),
        senderId: 'sender-p'
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p-anon', userId: null },
        { id: 'p-normal', userId: 'u-normal' }
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p-anon', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: new Date('2024-06-01T10:02:00Z') },
        { participantId: 'p-normal', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: new Date('2024-06-01T10:02:00Z') }
      ]);

      const result = await service.getLatestMessageSummary(testConversationId);

      expect(result.totalMembers).toBe(2);
      expect(result.readCount).toBe(2);
    });

    it('a preference lookup failure keeps everyone visible rather than blanking the feature', async () => {
      // Repli ouvert, cohérent avec PrivacyPreferencesService.fetchFromDatabase
      // qui retombe déjà sur les défauts. Échouer fermé masquerait les accusés
      // de TOUS sur un incident transitoire.
      mockPrisma.message.findFirst.mockResolvedValue({
        createdAt: new Date('2024-06-01T10:00:00Z'),
        senderId: 'sender-p'
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        { id: 'p-normal', userId: 'u-normal' }
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([
        { participantId: 'p-normal', lastDeliveredAt: new Date('2024-06-01T10:01:00Z'), lastReadAt: new Date('2024-06-01T10:02:00Z') }
      ]);
      mockPrisma.userPreference.findMany.mockRejectedValue(new Error('DB down'));

      const result = await service.getLatestMessageSummary(testConversationId);

      expect(result.totalMembers).toBe(1);
      expect(result.readCount).toBe(1);
    });
  });

  describe('getMessageReadStatus — totalMembers denominator', () => {
    const activeParticipant = (id: string) => ({
      id, displayName: id, avatar: null, user: { avatar: null },
    });

    it('excludes the sender by identity (not a blind -1), so a message from a member who LEFT still counts every active recipient', async () => {
      // Alice sent the message, then left the group → she is NOT among the
      // active participants. The 3 remaining active members are all recipients,
      // so totalMembers must be 3. A blind `participants.length - 1` yields 2 and
      // lights up "received/read by all" one recipient too early.
      mockPrisma.message.findUnique.mockResolvedValue({
        createdAt: new Date('2026-07-01T00:00:00Z'),
        senderId: 'alice',
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        activeParticipant('bob'), activeParticipant('carol'), activeParticipant('dave'),
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([]);

      const status = await service.getMessageReadStatus('m1', 'c1');
      expect(status.totalMembers).toBe(3);
    });

    it('excludes the sender when the sender IS still active (normal case) — no regression', async () => {
      mockPrisma.message.findUnique.mockResolvedValue({
        createdAt: new Date('2026-07-01T00:00:00Z'),
        senderId: 'alice',
      });
      mockPrisma.participant.findMany.mockResolvedValue([
        activeParticipant('alice'), activeParticipant('bob'), activeParticipant('carol'),
      ]);
      mockPrisma.conversationReadCursor.findMany.mockResolvedValue([]);
      mockPrisma.messageStatusEntry.findMany.mockResolvedValue([]);
      mockPrisma.attachmentStatusEntry.findMany.mockResolvedValue([]);

      const status = await service.getMessageReadStatus('m1', 'c1');
      expect(status.totalMembers).toBe(2);
    });
  });
});
