import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ConversationMessageStatsService } from '../../../services/ConversationMessageStatsService';

// Reset the singleton between tests to ensure isolation.
// The private static field must be cleared because there is no other way to
// force a fresh cache-less instance without touching production code.
function resetSingleton(): void {
  (ConversationMessageStatsService as any).instance = null;
}

function makePrisma() {
  return {
    conversationMessageStats: {
      findUnique: jest.fn<any>(),
      update: jest.fn<any>().mockResolvedValue({}),
      upsert: jest.fn<any>(),
    },
    message: {
      findMany: jest.fn<any>(),
    },
  };
}

function makeExistingStats(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    conversationId: CONV_ID,
    totalMessages: 10,
    totalWords: 50,
    totalCharacters: 200,
    textMessages: 8,
    imageCount: 1,
    audioCount: 1,
    videoCount: 0,
    fileCount: 0,
    locationCount: 0,
    participantStats: JSON.stringify({ [USER_A]: makePStat() }),
    dailyActivity: JSON.stringify({ '2026-06-01': 5, '2026-06-02': 5 }),
    hourlyDistribution: JSON.stringify({ '10': 5, '14': 5 }),
    languageDistribution: JSON.stringify({ en: 8, fr: 2 }),
    updatedAt: new Date('2026-06-02T00:00:00Z'),
    ...overrides,
  };
}

function makePStat(overrides: Record<string, unknown> = {}) {
  return {
    messageCount: 10,
    wordCount: 50,
    characterCount: 200,
    imageCount: 1,
    audioCount: 1,
    videoCount: 0,
    firstMessageAt: '2026-06-01T10:00:00.000Z',
    lastMessageAt: '2026-06-02T14:00:00.000Z',
    ...overrides,
  };
}

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_A = '507f1f77bcf86cd799439022';
const USER_B = '507f1f77bcf86cd799439033';

describe('ConversationMessageStatsService', () => {
  let service: ConversationMessageStatsService;

  beforeEach(() => {
    jest.useFakeTimers();
    resetSingleton();
    service = ConversationMessageStatsService.getInstance();
  });

  afterEach(() => {
    jest.useRealTimers();
    resetSingleton();
  });

  // ── Singleton ──────────────────────────────────────────────────────────────

  describe('getInstance', () => {
    it('returns the same instance on repeated calls', () => {
      const a = ConversationMessageStatsService.getInstance();
      const b = ConversationMessageStatsService.getInstance();
      expect(a).toBe(b);
    });
  });

  // ── invalidate ─────────────────────────────────────────────────────────────

  describe('invalidate', () => {
    it('clears the cache so the next getStats triggers a DB read', async () => {
      const prisma = makePrisma();
      const shaped = { conversationId: CONV_ID, totalMessages: 5 };
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats({ totalMessages: 5 }));

      const result1 = await service.getStats(prisma as any, CONV_ID);
      expect(result1.totalMessages).toBe(5);

      service.invalidate(CONV_ID);

      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats({ totalMessages: 99 }));
      const result2 = await service.getStats(prisma as any, CONV_ID);
      expect(result2.totalMessages).toBe(99);
      expect(prisma.conversationMessageStats.findUnique).toHaveBeenCalledTimes(2);
    });

    it('is a no-op when conversation was not cached', () => {
      expect(() => service.invalidate('nonexistent-id')).not.toThrow();
    });
  });

  // ── getStats ───────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns cached data when cache is valid (no DB hit on second call)', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats());

      await service.getStats(prisma as any, CONV_ID);
      await service.getStats(prisma as any, CONV_ID);

      expect(prisma.conversationMessageStats.findUnique).toHaveBeenCalledTimes(1);
    });

    it('re-reads from DB after cache TTL (5 minutes) expires', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats());

      await service.getStats(prisma as any, CONV_ID);
      jest.advanceTimersByTime(5 * 60 * 1000 + 1);

      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats({ totalMessages: 99 }));
      const result = await service.getStats(prisma as any, CONV_ID);
      expect(result.totalMessages).toBe(99);
      expect(prisma.conversationMessageStats.findUnique).toHaveBeenCalledTimes(2);
    });

    it('calls recompute when findUnique returns null', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(null);
      prisma.message.findMany.mockResolvedValue([]);
      prisma.conversationMessageStats.upsert.mockResolvedValue(makeExistingStats({ totalMessages: 0 }));

      const result = await service.getStats(prisma as any, CONV_ID);

      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { conversationId: CONV_ID, deletedAt: null } })
      );
      expect(result.totalMessages).toBe(0);
    });

    it('shapes response correctly — contentTypes, JSON parsed participantStats', async () => {
      const prisma = makePrisma();
      const existing = makeExistingStats({
        totalMessages: 3,
        participantStats: JSON.stringify({ [USER_A]: { messageCount: 3 } }),
      });
      prisma.conversationMessageStats.findUnique.mockResolvedValue(existing);

      const result = await service.getStats(prisma as any, CONV_ID);

      expect(result.conversationId).toBe(CONV_ID);
      expect(result.totalMessages).toBe(3);
      expect((result.contentTypes as any).text).toBe(8);
      expect((result.participantStats as any)[USER_A].messageCount).toBe(3);
    });

    it('parses JSON strings in participantStats, dailyActivity, hourlyDistribution, languageDistribution', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats());

      const result = await service.getStats(prisma as any, CONV_ID);

      expect(typeof result.participantStats).toBe('object');
      expect(typeof result.dailyActivity).toBe('object');
      expect(typeof result.hourlyDistribution).toBe('object');
      expect(typeof result.languageDistribution).toBe('object');
    });

    it('passes already-parsed objects through shapeResponse without double-parsing', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(
        makeExistingStats({
          participantStats: { [USER_A]: { messageCount: 7 } },
          dailyActivity: { '2026-06-01': 7 },
          hourlyDistribution: { '10': 7 },
          languageDistribution: { fr: 7 },
        })
      );

      const result = await service.getStats(prisma as any, CONV_ID);
      expect((result.participantStats as any)[USER_A].messageCount).toBe(7);
    });
  });

  // ── recompute ──────────────────────────────────────────────────────────────

  describe('recompute', () => {
    it('aggregates messages and calls upsert with computed totals', async () => {
      const prisma = makePrisma();
      prisma.message.findMany.mockResolvedValue([
        {
          content: 'hello world',
          senderId: USER_A,
          createdAt: new Date('2026-06-01T10:00:00Z'),
          originalLanguage: 'en',
          messageType: 'text',
          sender: { userId: USER_A },
          attachments: [],
        },
        {
          content: 'good morning',
          senderId: USER_B,
          createdAt: new Date('2026-06-01T11:00:00Z'),
          originalLanguage: 'fr',
          messageType: 'text',
          sender: { userId: USER_B },
          attachments: [],
        },
      ]);
      prisma.conversationMessageStats.upsert.mockResolvedValue(
        makeExistingStats({ totalMessages: 2, totalWords: 4 })
      );

      await service.recompute(prisma as any, CONV_ID);

      const upsertCall = (prisma.conversationMessageStats.upsert as jest.MockedFunction<any>).mock.calls[0][0];
      expect(upsertCall.create.totalMessages).toBe(2);
      expect(upsertCall.create.totalWords).toBe(4);
      expect(upsertCall.create.textMessages).toBe(2);
      expect(upsertCall.create.imageCount).toBe(0);
      expect(upsertCall.create.languageDistribution.en).toBe(1);
      expect(upsertCall.create.languageDistribution.fr).toBe(1);
    });

    it('resolves attachment types (image/audio/video/file) from mimeType', async () => {
      const prisma = makePrisma();
      prisma.message.findMany.mockResolvedValue([
        {
          content: '',
          senderId: USER_A,
          createdAt: new Date('2026-06-01T10:00:00Z'),
          originalLanguage: null,
          messageType: 'text',
          sender: { userId: USER_A },
          attachments: [
            { mimeType: 'image/jpeg' },
            { mimeType: 'audio/mp3' },
            { mimeType: 'video/mp4' },
            { mimeType: 'application/pdf' },
          ],
        },
      ]);
      prisma.conversationMessageStats.upsert.mockResolvedValue(
        makeExistingStats({ imageCount: 1, audioCount: 1, videoCount: 1, fileCount: 1 })
      );

      await service.recompute(prisma as any, CONV_ID);

      const upsertCall = (prisma.conversationMessageStats.upsert as jest.MockedFunction<any>).mock.calls[0][0];
      expect(upsertCall.create.imageCount).toBe(1);
      expect(upsertCall.create.audioCount).toBe(1);
      expect(upsertCall.create.videoCount).toBe(1);
      expect(upsertCall.create.fileCount).toBe(1);
    });

    it('handles messages with no sender (falls back to senderId)', async () => {
      const prisma = makePrisma();
      prisma.message.findMany.mockResolvedValue([
        {
          content: 'hi',
          senderId: USER_A,
          createdAt: new Date('2026-06-01T10:00:00Z'),
          originalLanguage: null,
          messageType: 'text',
          sender: null,
          attachments: [],
        },
      ]);
      prisma.conversationMessageStats.upsert.mockResolvedValue(makeExistingStats({ totalMessages: 1 }));

      await service.recompute(prisma as any, CONV_ID);

      const upsertCall = (prisma.conversationMessageStats.upsert as jest.MockedFunction<any>).mock.calls[0][0];
      expect(upsertCall.create.participantStats[USER_A].messageCount).toBe(1);
    });

    it('counts location messageType and does not count it as text', async () => {
      const prisma = makePrisma();
      prisma.message.findMany.mockResolvedValue([
        {
          content: '',
          senderId: USER_A,
          createdAt: new Date('2026-06-01T10:00:00Z'),
          originalLanguage: null,
          messageType: 'location',
          sender: { userId: USER_A },
          attachments: [],
        },
      ]);
      prisma.conversationMessageStats.upsert.mockResolvedValue(
        makeExistingStats({ locationCount: 1, textMessages: 0 })
      );

      await service.recompute(prisma as any, CONV_ID);

      const upsertCall = (prisma.conversationMessageStats.upsert as jest.MockedFunction<any>).mock.calls[0][0];
      expect(upsertCall.create.locationCount).toBe(1);
      expect(upsertCall.create.textMessages).toBe(0);
    });

    it('tracks firstMessageAt and lastMessageAt correctly across multiple messages from same user', async () => {
      const prisma = makePrisma();
      const early = new Date('2026-06-01T08:00:00Z');
      const late = new Date('2026-06-01T18:00:00Z');
      const middle = new Date('2026-06-01T12:00:00Z');
      prisma.message.findMany.mockResolvedValue([
        { content: 'first', senderId: USER_A, createdAt: middle, originalLanguage: null, messageType: 'text', sender: { userId: USER_A }, attachments: [] },
        { content: 'second', senderId: USER_A, createdAt: early, originalLanguage: null, messageType: 'text', sender: { userId: USER_A }, attachments: [] },
        { content: 'third', senderId: USER_A, createdAt: late, originalLanguage: null, messageType: 'text', sender: { userId: USER_A }, attachments: [] },
      ]);
      prisma.conversationMessageStats.upsert.mockResolvedValue(makeExistingStats({ totalMessages: 3 }));

      await service.recompute(prisma as any, CONV_ID);

      const upsertCall = (prisma.conversationMessageStats.upsert as jest.MockedFunction<any>).mock.calls[0][0];
      const pStat = upsertCall.create.participantStats[USER_A];
      expect(pStat.firstMessageAt).toBe(early.toISOString());
      expect(pStat.lastMessageAt).toBe(late.toISOString());
    });

    it('prunes dailyActivity entries older than 90 days', async () => {
      const prisma = makePrisma();
      const recent = new Date();
      const old = new Date();
      old.setDate(old.getDate() - 91);
      prisma.message.findMany.mockResolvedValue([
        { content: 'recent', senderId: USER_A, createdAt: recent, originalLanguage: null, messageType: 'text', sender: { userId: USER_A }, attachments: [] },
        { content: 'old', senderId: USER_A, createdAt: old, originalLanguage: null, messageType: 'text', sender: { userId: USER_A }, attachments: [] },
      ]);
      prisma.conversationMessageStats.upsert.mockResolvedValue(makeExistingStats({ totalMessages: 2 }));

      await service.recompute(prisma as any, CONV_ID);

      const upsertCall = (prisma.conversationMessageStats.upsert as jest.MockedFunction<any>).mock.calls[0][0];
      const dailyKeys = Object.keys(upsertCall.create.dailyActivity);
      const oldKey = old.toISOString().slice(0, 10);
      expect(dailyKeys).not.toContain(oldKey);
      expect(dailyKeys.length).toBe(1);
    });

    it('handles empty message list (no messages in conversation)', async () => {
      const prisma = makePrisma();
      prisma.message.findMany.mockResolvedValue([]);
      prisma.conversationMessageStats.upsert.mockResolvedValue(makeExistingStats({ totalMessages: 0 }));

      await service.recompute(prisma as any, CONV_ID);

      const upsertCall = (prisma.conversationMessageStats.upsert as jest.MockedFunction<any>).mock.calls[0][0];
      expect(upsertCall.create.totalMessages).toBe(0);
      expect(upsertCall.create.participantStats).toEqual({});
    });

    it('caches the shaped result for subsequent getStats calls', async () => {
      const prisma = makePrisma();
      prisma.message.findMany.mockResolvedValue([]);
      prisma.conversationMessageStats.upsert.mockResolvedValue(makeExistingStats({ totalMessages: 0 }));

      await service.recompute(prisma as any, CONV_ID);

      // getStats should now use the cache populated by recompute
      prisma.conversationMessageStats.findUnique.mockResolvedValue(null);
      await service.getStats(prisma as any, CONV_ID);

      expect(prisma.conversationMessageStats.findUnique).not.toHaveBeenCalled();
    });
  });

  // ── onNewMessage ───────────────────────────────────────────────────────────

  describe('onNewMessage', () => {
    it('increments totalMessages, totalWords, totalCharacters via update when stats row exists', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats());

      await service.onNewMessage(prisma as any, CONV_ID, USER_A, 'hello world', [], 'en');

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      expect(updateCall.data.totalMessages).toEqual({ increment: 1 });
      expect(updateCall.data.totalWords).toEqual({ increment: 2 });
      expect(updateCall.data.totalCharacters).toEqual({ increment: 11 });
    });

    it('increments textMessages for a text-only message', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats());

      await service.onNewMessage(prisma as any, CONV_ID, USER_A, 'hello', [], 'en');

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      expect(updateCall.data.textMessages).toEqual({ increment: 1 });
    });

    it('does not increment textMessages when message has attachments', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats());

      await service.onNewMessage(prisma as any, CONV_ID, USER_A, 'caption', ['image'], 'en');

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      expect(updateCall.data.textMessages).toBeUndefined();
      expect(updateCall.data.imageCount).toEqual({ increment: 1 });
    });

    it('increments all matched attachment type counters', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats());

      await service.onNewMessage(prisma as any, CONV_ID, USER_A, '', ['image', 'audio', 'video'], null);

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      expect(updateCall.data.imageCount).toEqual({ increment: 1 });
      expect(updateCall.data.audioCount).toEqual({ increment: 1 });
      expect(updateCall.data.videoCount).toEqual({ increment: 1 });
    });

    it('ignores unknown attachment types (no field increment)', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats());

      await service.onNewMessage(prisma as any, CONV_ID, USER_A, '', ['sticker'], null);

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      expect(updateCall.data.stickerCount).toBeUndefined();
    });

    it('creates a new participant entry when sender is not yet in participantStats', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(
        makeExistingStats({ participantStats: JSON.stringify({}) })
      );

      await service.onNewMessage(prisma as any, CONV_ID, USER_B, 'first message', [], 'fr');

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      const parsed = updateCall.data.participantStats;
      expect(parsed[USER_B].messageCount).toBe(1);
      expect(parsed[USER_B].firstMessageAt).not.toBeNull();
      expect(parsed[USER_B].lastMessageAt).not.toBeNull();
    });

    it('updates existing participant entry (increments counts, updates lastMessageAt)', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats());

      await service.onNewMessage(prisma as any, CONV_ID, USER_A, 'update', [], 'en');

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      const parsed = updateCall.data.participantStats;
      expect(parsed[USER_A].messageCount).toBe(11);
      expect(parsed[USER_A].wordCount).toBe(51);
    });

    it('updates participant imageCount/audioCount/videoCount for image/audio/video attachments', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats());

      await service.onNewMessage(prisma as any, CONV_ID, USER_A, '', ['image', 'audio', 'video'], null);

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      const pStat = updateCall.data.participantStats[USER_A];
      expect(pStat.imageCount).toBe(2);
      expect(pStat.audioCount).toBe(2);
      expect(pStat.videoCount).toBe(1);
    });

    it('updates dailyActivity and hourlyDistribution correctly', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats());

      jest.setSystemTime(new Date('2026-06-17T15:30:00Z'));
      await service.onNewMessage(prisma as any, CONV_ID, USER_A, 'hello', [], null);

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      expect(updateCall.data.dailyActivity['2026-06-17']).toBe(1);
      expect(updateCall.data.hourlyDistribution['15']).toBe(1);
    });

    it('increments languageDistribution when originalLanguage is provided', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats());

      await service.onNewMessage(prisma as any, CONV_ID, USER_A, 'bonjour', [], 'fr');

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      expect(updateCall.data.languageDistribution.fr).toBe(3);
    });

    it('does not update languageDistribution when originalLanguage is null', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats());

      await service.onNewMessage(prisma as any, CONV_ID, USER_A, 'hello', [], null);

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      const langDist = updateCall.data.languageDistribution;
      expect(Object.keys(langDist).length).toBe(2);
    });

    it('prunes dailyActivity older than 90 days before updating', async () => {
      const oldKey = '2025-01-01';
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(
        makeExistingStats({ dailyActivity: JSON.stringify({ [oldKey]: 3 }) })
      );

      await service.onNewMessage(prisma as any, CONV_ID, USER_A, 'hello', [], null);

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      expect(updateCall.data.dailyActivity[oldKey]).toBeUndefined();
    });

    it('calls recompute when stats row does not exist, then returns without updating', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(null);
      prisma.message.findMany.mockResolvedValue([]);
      prisma.conversationMessageStats.upsert.mockResolvedValue(makeExistingStats({ totalMessages: 0 }));

      await service.onNewMessage(prisma as any, CONV_ID, USER_A, 'hello', [], 'en');

      expect(prisma.message.findMany).toHaveBeenCalled();
      expect(prisma.conversationMessageStats.update).not.toHaveBeenCalled();
    });

    it('invalidates the cache after update', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats());

      // Prime the cache
      await service.getStats(prisma as any, CONV_ID);
      expect(prisma.conversationMessageStats.findUnique).toHaveBeenCalledTimes(1);

      await service.onNewMessage(prisma as any, CONV_ID, USER_A, 'hello', [], null);

      // Cache invalidated — next getStats must hit DB again
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats({ totalMessages: 11 }));
      const result = await service.getStats(prisma as any, CONV_ID);
      // first getStats (1) + onNewMessage's internal findUnique (2) + second getStats after invalidate (3)
      expect(prisma.conversationMessageStats.findUnique).toHaveBeenCalledTimes(3);
      expect(result.totalMessages).toBe(11);
    });

    it('handles participantStats stored as an object (not a JSON string)', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(
        makeExistingStats({ participantStats: { [USER_A]: makePStat() } })
      );

      await expect(
        service.onNewMessage(prisma as any, CONV_ID, USER_A, 'hello', [], null)
      ).resolves.not.toThrow();

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      expect(updateCall.data.participantStats[USER_A].messageCount).toBe(11);
    });

    it('returns empty word/char count for empty content', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats());

      await service.onNewMessage(prisma as any, CONV_ID, USER_A, '', [], null);

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      expect(updateCall.data.totalWords).toEqual({ increment: 0 });
      expect(updateCall.data.totalCharacters).toEqual({ increment: 0 });
    });
  });

  // ── onMessageEdited ────────────────────────────────────────────────────────

  describe('onMessageEdited', () => {
    it('applies word/char delta to totalWords and totalCharacters via atomic increment', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats());

      await service.onMessageEdited(prisma as any, CONV_ID, USER_A, 'hello', 'hello world');

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      // "hello" (1 word / 5 chars) → "hello world" (2 words / 11 chars): +1 word, +6 chars
      expect(updateCall.data.totalWords).toEqual({ increment: 1 });
      expect(updateCall.data.totalCharacters).toEqual({ increment: 6 });
    });

    it('applies a NEGATIVE atomic increment when the edit shrinks the message (no DB-level clamp)', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(
        makeExistingStats({ totalWords: 2, totalCharacters: 10 })
      );

      await service.onMessageEdited(prisma as any, CONV_ID, USER_A, 'hello world three', '');

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      // "hello world three" (3 words / 17 chars) → "" (0/0): -3 words, -17 chars.
      // Atomic decrement replaces the old Math.max(0, …) floor so concurrent edits
      // never lose an update; recompute() heals any residual drift.
      expect(updateCall.data.totalWords).toEqual({ increment: -3 });
      expect(updateCall.data.totalCharacters).toEqual({ increment: -17 });
    });

    it('applies delta to participant entry wordCount and characterCount', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats());

      await service.onMessageEdited(prisma as any, CONV_ID, USER_A, 'one', 'one two three');

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      const pStat = updateCall.data.participantStats[USER_A];
      expect(pStat.wordCount).toBe(52);
      expect(pStat.characterCount).toBe(210);
    });

    it('clamps participant wordCount/characterCount to 0 on negative delta', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(
        makeExistingStats({ participantStats: JSON.stringify({ [USER_A]: makePStat({ wordCount: 1, characterCount: 5 }) }) })
      );

      await service.onMessageEdited(prisma as any, CONV_ID, USER_A, 'hello world', '');

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      const pStat = updateCall.data.participantStats[USER_A];
      expect(pStat.wordCount).toBe(0);
      expect(pStat.characterCount).toBe(0);
    });

    it('does not touch participant entry when senderId not found in participantStats', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats());

      await service.onMessageEdited(prisma as any, CONV_ID, USER_B, 'old', 'new text here');

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      expect(updateCall.data.participantStats[USER_B]).toBeUndefined();
    });

    it('calls recompute when stats row does not exist', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(null);
      prisma.message.findMany.mockResolvedValue([]);
      prisma.conversationMessageStats.upsert.mockResolvedValue(makeExistingStats({ totalMessages: 0 }));

      await service.onMessageEdited(prisma as any, CONV_ID, USER_A, 'old', 'new');

      expect(prisma.message.findMany).toHaveBeenCalled();
      expect(prisma.conversationMessageStats.update).not.toHaveBeenCalled();
    });

    it('invalidates the cache after update', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats());

      await service.getStats(prisma as any, CONV_ID);
      await service.onMessageEdited(prisma as any, CONV_ID, USER_A, 'old', 'new text');

      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats({ totalWords: 52 }));
      const result = await service.getStats(prisma as any, CONV_ID);
      // first getStats (1) + onMessageEdited's internal findUnique (2) + second getStats after invalidate (3)
      expect(prisma.conversationMessageStats.findUnique).toHaveBeenCalledTimes(3);
      expect(result.totalWords).toBe(52);
    });
  });

  // ── onMessageDeleted ───────────────────────────────────────────────────────

  describe('onMessageDeleted', () => {
    it('returns early without update when stats row does not exist', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(null);

      await service.onMessageDeleted(prisma as any, CONV_ID, USER_A, 'hello', []);

      expect(prisma.conversationMessageStats.update).not.toHaveBeenCalled();
    });

    it('decrements totalMessages, totalWords, totalCharacters via atomic decrement', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats());

      await service.onMessageDeleted(prisma as any, CONV_ID, USER_A, 'hello world', []);

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      // "hello world" = 2 words / 11 chars
      expect(updateCall.data.totalMessages).toEqual({ decrement: 1 });
      expect(updateCall.data.totalWords).toEqual({ decrement: 2 });
      expect(updateCall.data.totalCharacters).toEqual({ decrement: 11 });
    });

    it('uses atomic decrement even when the stored counters are already 0 (no DB-level clamp)', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(
        makeExistingStats({ totalMessages: 0, totalWords: 0, totalCharacters: 0 })
      );

      await service.onMessageDeleted(prisma as any, CONV_ID, USER_A, 'hello world', []);

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      // Atomic decrement is independent of the read value — it never clobbers a
      // concurrent write. Balanced create/delete never underflows; drift on this
      // denormalized counter self-heals via recompute().
      expect(updateCall.data.totalMessages).toEqual({ decrement: 1 });
      expect(updateCall.data.totalWords).toEqual({ decrement: 2 });
      expect(updateCall.data.totalCharacters).toEqual({ decrement: 11 });
    });

    it('decrements textMessages when deleted message was text-only', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats());

      await service.onMessageDeleted(prisma as any, CONV_ID, USER_A, 'hello', []);

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      expect(updateCall.data.textMessages).toEqual({ decrement: 1 });
    });

    it('does not decrement textMessages when message had attachments', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats());

      await service.onMessageDeleted(prisma as any, CONV_ID, USER_A, 'caption', ['image']);

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      expect(updateCall.data.textMessages).toBeUndefined();
    });

    it('decrements attachment type counts (image/audio/video) via atomic decrement', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats());

      await service.onMessageDeleted(prisma as any, CONV_ID, USER_A, '', ['image', 'audio']);

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      expect(updateCall.data.imageCount).toEqual({ decrement: 1 });
      expect(updateCall.data.audioCount).toEqual({ decrement: 1 });
    });

    it('decrements participant messageCount, wordCount, characterCount and attachment counts', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats());

      await service.onMessageDeleted(prisma as any, CONV_ID, USER_A, 'hello', ['image', 'audio', 'video']);

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      const pStat = updateCall.data.participantStats[USER_A];
      expect(pStat.messageCount).toBe(9);
      expect(pStat.wordCount).toBe(49);
      expect(pStat.imageCount).toBe(0);
      expect(pStat.audioCount).toBe(0);
      expect(pStat.videoCount).toBe(0);
    });

    it('clamps participant counts to 0 when they would go negative', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(
        makeExistingStats({
          participantStats: JSON.stringify({
            [USER_A]: makePStat({ messageCount: 0, wordCount: 0, characterCount: 0, imageCount: 0, audioCount: 0, videoCount: 0 }),
          }),
        })
      );

      await service.onMessageDeleted(prisma as any, CONV_ID, USER_A, 'hello world', ['image', 'audio', 'video']);

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      const pStat = updateCall.data.participantStats[USER_A];
      expect(pStat.messageCount).toBe(0);
      expect(pStat.wordCount).toBe(0);
      expect(pStat.imageCount).toBe(0);
      expect(pStat.audioCount).toBe(0);
      expect(pStat.videoCount).toBe(0);
    });

    it('does not throw when sender is not found in participantStats', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(
        makeExistingStats({ participantStats: JSON.stringify({}) })
      );

      await expect(
        service.onMessageDeleted(prisma as any, CONV_ID, USER_B, 'hello', [])
      ).resolves.not.toThrow();
    });

    it('invalidates the cache after update', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats());

      await service.getStats(prisma as any, CONV_ID);
      await service.onMessageDeleted(prisma as any, CONV_ID, USER_A, 'hello', []);

      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats({ totalMessages: 9 }));
      const result = await service.getStats(prisma as any, CONV_ID);
      // first getStats (1) + onMessageDeleted's internal findUnique (2) + second getStats after invalidate (3)
      expect(prisma.conversationMessageStats.findUnique).toHaveBeenCalledTimes(3);
      expect(result.totalMessages).toBe(9);
    });
  });

  // ── Concurrency: scalar counters use atomic operators (lost-update regression) ─

  describe('scalar counters are atomic across new/edit/delete', () => {
    it('two concurrent edits both emit an independent atomic increment (neither is a read-derived absolute write)', async () => {
      const prisma = makePrisma();
      // Both handlers read the SAME pre-write snapshot (the lost-update window).
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats({ totalWords: 50 }));

      await Promise.all([
        service.onMessageEdited(prisma as any, CONV_ID, USER_A, 'a', 'a b c'),   // +2 words
        service.onMessageEdited(prisma as any, CONV_ID, USER_A, 'x', 'x y z w'), // +3 words
      ]);

      const calls = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls;
      expect(calls).toHaveLength(2);
      // Neither write is an absolute value computed from the shared snapshot (e.g. 52 / 53);
      // both are relative { increment } so the DB serializes them to +5 total — no lost update.
      const words = calls.map((c: any) => c[0].data.totalWords);
      expect(words).toContainEqual({ increment: 2 });
      expect(words).toContainEqual({ increment: 3 });
    });

    it('delete emits an atomic decrement independent of the read snapshot', async () => {
      const prisma = makePrisma();
      prisma.conversationMessageStats.findUnique.mockResolvedValue(makeExistingStats({ totalMessages: 10, totalWords: 50 }));

      await service.onMessageDeleted(prisma as any, CONV_ID, USER_A, 'one two', []);

      const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
      expect(updateCall.data.totalMessages).toEqual({ decrement: 1 });
      expect(updateCall.data.totalWords).toEqual({ decrement: 2 });
    });
  });
});

// ── Pure helper coverage (via service public API) ──────────────────────────

describe('countWords — via onNewMessage totalWords increment', () => {
  let service: ConversationMessageStatsService;

  beforeEach(() => {
    jest.useFakeTimers();
    resetSingleton();
    service = ConversationMessageStatsService.getInstance();
  });

  afterEach(() => {
    jest.useRealTimers();
    resetSingleton();
  });

  async function wordsFrom(content: string): Promise<number> {
    const prisma = makePrisma();
    prisma.conversationMessageStats.findUnique.mockResolvedValue(
      makeExistingStats({ totalWords: 0 })
    );
    await service.onNewMessage(prisma as any, CONV_ID, USER_A, content, [], null);
    const updateCall = (prisma.conversationMessageStats.update as jest.MockedFunction<any>).mock.calls[0][0];
    return updateCall.data.totalWords.increment;
  }

  it('returns 0 for empty string', async () => {
    expect(await wordsFrom('')).toBe(0);
  });

  it('returns 0 for whitespace-only string', async () => {
    expect(await wordsFrom('   ')).toBe(0);
  });

  it('returns 1 for a single word', async () => {
    expect(await wordsFrom('hello')).toBe(1);
  });

  it('returns correct count for multiple words', async () => {
    expect(await wordsFrom('one two three four')).toBe(4);
  });

  it('handles multiple consecutive spaces (splits on any whitespace)', async () => {
    expect(await wordsFrom('one  two   three')).toBe(3);
  });
});

describe('resolveAttachmentType — via recompute attachment classification', () => {
  let service: ConversationMessageStatsService;

  beforeEach(() => {
    jest.useFakeTimers();
    resetSingleton();
    service = ConversationMessageStatsService.getInstance();
  });

  afterEach(() => {
    jest.useRealTimers();
    resetSingleton();
  });

  async function typeFrom(mimeType: string): Promise<{ imageCount: number; audioCount: number; videoCount: number; fileCount: number }> {
    const prisma = makePrisma();
    prisma.message.findMany.mockResolvedValue([
      { content: '', senderId: USER_A, createdAt: new Date('2026-06-01T10:00:00Z'), originalLanguage: null, messageType: 'text', sender: { userId: USER_A }, attachments: [{ mimeType }] },
    ]);
    prisma.conversationMessageStats.upsert.mockResolvedValue(makeExistingStats());
    await service.recompute(prisma as any, CONV_ID);
    const upsertCall = (prisma.conversationMessageStats.upsert as jest.MockedFunction<any>).mock.calls[0][0];
    return { imageCount: upsertCall.create.imageCount, audioCount: upsertCall.create.audioCount, videoCount: upsertCall.create.videoCount, fileCount: upsertCall.create.fileCount };
  }

  it('resolves image/* mimeTypes to imageCount', async () => {
    const counts = await typeFrom('image/jpeg');
    expect(counts.imageCount).toBe(1);
    expect(counts.audioCount + counts.videoCount + counts.fileCount).toBe(0);
  });

  it('resolves audio/* mimeTypes to audioCount', async () => {
    const counts = await typeFrom('audio/mp3');
    expect(counts.audioCount).toBe(1);
    expect(counts.imageCount + counts.videoCount + counts.fileCount).toBe(0);
  });

  it('resolves video/* mimeTypes to videoCount', async () => {
    const counts = await typeFrom('video/mp4');
    expect(counts.videoCount).toBe(1);
    expect(counts.imageCount + counts.audioCount + counts.fileCount).toBe(0);
  });

  it('resolves unknown mimeTypes to fileCount', async () => {
    const counts = await typeFrom('application/pdf');
    expect(counts.fileCount).toBe(1);
    expect(counts.imageCount + counts.audioCount + counts.videoCount).toBe(0);
  });
});
