import { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';

interface ParticipantStatEntry {
  messageCount: number;
  wordCount: number;
  characterCount: number;
  imageCount: number;
  audioCount: number;
  videoCount: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
}

interface CacheEntry {
  data: Record<string, unknown>;
  expiresAt: number;
}

const ATTACHMENT_TYPE_FIELDS: Record<string, string> = {
  image: 'imageCount',
  audio: 'audioCount',
  video: 'videoCount',
  file: 'fileCount',
  location: 'locationCount',
};

function countWords(content: string): number {
  if (!content || !content.trim()) return 0;
  return content.trim().split(/\s+/).length;
}

function countCharacters(content: string): number {
  return content ? content.length : 0;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentHour(): string {
  return String(new Date().getHours());
}

function pruneDailyActivity(daily: Record<string, number>): Record<string, number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffKey = cutoff.toISOString().slice(0, 10);

  const pruned: Record<string, number> = {};
  for (const [key, value] of Object.entries(daily)) {
    if (key >= cutoffKey) {
      pruned[key] = value;
    }
  }
  return pruned;
}

export class ConversationMessageStatsService {
  private static instance: ConversationMessageStatsService | null = null;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs = 5 * 60 * 1000;

  private constructor() {}

  static getInstance(): ConversationMessageStatsService {
    if (!this.instance) {
      this.instance = new ConversationMessageStatsService();
    }
    return this.instance;
  }

  invalidate(conversationId: string): void {
    this.cache.delete(conversationId);
  }

  private isValid(entry?: CacheEntry | null): entry is CacheEntry {
    return !!entry && Date.now() < entry.expiresAt;
  }

  private setCache(conversationId: string, data: Record<string, unknown>): void {
    this.cache.set(conversationId, { data, expiresAt: Date.now() + this.ttlMs });
  }

  async onNewMessage(
    prisma: PrismaClient,
    conversationId: string,
    senderId: string,
    content: string,
    attachmentTypes: string[],
    originalLanguage: string | null,
  ): Promise<void> {
    const existing = await prisma.conversationMessageStats.findUnique({
      where: { conversationId },
    });

    if (!existing) {
      await this.recompute(prisma, conversationId);
      return;
    }

    const words = countWords(content);
    const chars = countCharacters(content);
    const day = todayKey();
    const hour = currentHour();
    const now = new Date().toISOString();

    const attachmentIncrements: Record<string, number> = {};
    for (const t of attachmentTypes) {
      const field = ATTACHMENT_TYPE_FIELDS[t];
      if (field) {
        attachmentIncrements[field] = (attachmentIncrements[field] || 0) + 1;
      }
    }

    const hasTextContent = content && content.trim().length > 0;
    const isTextMessage = attachmentTypes.length === 0 && hasTextContent;

    const participantStats = (typeof existing.participantStats === 'string'
      ? JSON.parse(existing.participantStats)
      : existing.participantStats) as Record<string, ParticipantStatEntry>;

    const entry = participantStats[senderId] || {
      messageCount: 0,
      wordCount: 0,
      characterCount: 0,
      imageCount: 0,
      audioCount: 0,
      videoCount: 0,
      firstMessageAt: null,
      lastMessageAt: null,
    };

    entry.messageCount += 1;
    entry.wordCount += words;
    entry.characterCount += chars;
    for (const t of attachmentTypes) {
      if (t === 'image') entry.imageCount += 1;
      if (t === 'audio') entry.audioCount += 1;
      if (t === 'video') entry.videoCount += 1;
    }
    if (!entry.firstMessageAt) entry.firstMessageAt = now;
    entry.lastMessageAt = now;
    participantStats[senderId] = entry;

    const dailyActivity = (typeof existing.dailyActivity === 'string'
      ? JSON.parse(existing.dailyActivity)
      : existing.dailyActivity) as Record<string, number>;
    dailyActivity[day] = (dailyActivity[day] || 0) + 1;
    const prunedDaily = pruneDailyActivity(dailyActivity);

    const hourlyDistribution = (typeof existing.hourlyDistribution === 'string'
      ? JSON.parse(existing.hourlyDistribution)
      : existing.hourlyDistribution) as Record<string, number>;
    hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;

    const languageDistribution = (typeof existing.languageDistribution === 'string'
      ? JSON.parse(existing.languageDistribution)
      : existing.languageDistribution) as Record<string, number>;
    if (originalLanguage) {
      languageDistribution[originalLanguage] = (languageDistribution[originalLanguage] || 0) + 1;
    }

    await prisma.conversationMessageStats.update({
      where: { conversationId },
      data: {
        totalMessages: { increment: 1 },
        totalWords: { increment: words },
        totalCharacters: { increment: chars },
        textMessages: isTextMessage ? { increment: 1 } : undefined,
        ...Object.fromEntries(
          Object.entries(attachmentIncrements).map(([field, count]) => [field, { increment: count }]),
        ),
        participantStats: participantStats as unknown as Prisma.InputJsonValue,
        dailyActivity: prunedDaily as unknown as Prisma.InputJsonValue,
        hourlyDistribution: hourlyDistribution as unknown as Prisma.InputJsonValue,
        languageDistribution: languageDistribution as unknown as Prisma.InputJsonValue,
      },
    });

    this.invalidate(conversationId);
  }

  async onMessageEdited(
    prisma: PrismaClient,
    conversationId: string,
    senderId: string,
    oldContent: string,
    newContent: string,
  ): Promise<void> {
    const existing = await prisma.conversationMessageStats.findUnique({
      where: { conversationId },
    });

    if (!existing) {
      await this.recompute(prisma, conversationId);
      return;
    }

    const oldWords = countWords(oldContent);
    const newWords = countWords(newContent);
    const oldChars = countCharacters(oldContent);
    const newChars = countCharacters(newContent);

    const wordDiff = newWords - oldWords;
    const charDiff = newChars - oldChars;

    const participantStats = (typeof existing.participantStats === 'string'
      ? JSON.parse(existing.participantStats)
      : existing.participantStats) as Record<string, ParticipantStatEntry>;

    const entry = participantStats[senderId];
    if (entry) {
      entry.wordCount = Math.max(0, entry.wordCount + wordDiff);
      entry.characterCount = Math.max(0, entry.characterCount + charDiff);
      participantStats[senderId] = entry;
    }

    const newTotalWords = Math.max(0, existing.totalWords + wordDiff);
    const newTotalChars = Math.max(0, existing.totalCharacters + charDiff);

    await prisma.conversationMessageStats.update({
      where: { conversationId },
      data: {
        totalWords: newTotalWords,
        totalCharacters: newTotalChars,
        participantStats: participantStats as unknown as Prisma.InputJsonValue,
      },
    });

    this.invalidate(conversationId);
  }

  async onMessageDeleted(
    prisma: PrismaClient,
    conversationId: string,
    senderId: string,
    content: string,
    attachmentTypes: string[],
  ): Promise<void> {
    const existing = await prisma.conversationMessageStats.findUnique({
      where: { conversationId },
    });

    if (!existing) return;

    const words = countWords(content);
    const chars = countCharacters(content);
    const hasTextContent = content && content.trim().length > 0;
    const isTextMessage = attachmentTypes.length === 0 && hasTextContent;

    const decrements: Record<string, number> = {};
    for (const t of attachmentTypes) {
      const field = ATTACHMENT_TYPE_FIELDS[t];
      if (field) {
        decrements[field] = (decrements[field] || 0) + 1;
      }
    }

    const participantStats = (typeof existing.participantStats === 'string'
      ? JSON.parse(existing.participantStats)
      : existing.participantStats) as Record<string, ParticipantStatEntry>;

    const entry = participantStats[senderId];
    if (entry) {
      entry.messageCount = Math.max(0, entry.messageCount - 1);
      entry.wordCount = Math.max(0, entry.wordCount - words);
      entry.characterCount = Math.max(0, entry.characterCount - chars);
      for (const t of attachmentTypes) {
        if (t === 'image') entry.imageCount = Math.max(0, entry.imageCount - 1);
        if (t === 'audio') entry.audioCount = Math.max(0, entry.audioCount - 1);
        if (t === 'video') entry.videoCount = Math.max(0, entry.videoCount - 1);
      }
      participantStats[senderId] = entry;
    }

    const updateData: Record<string, unknown> = {
      totalMessages: Math.max(0, existing.totalMessages - 1),
      totalWords: Math.max(0, existing.totalWords - words),
      totalCharacters: Math.max(0, existing.totalCharacters - chars),
      participantStats: participantStats as unknown as Prisma.InputJsonValue,
    };

    if (isTextMessage) {
      updateData.textMessages = Math.max(0, existing.textMessages - 1);
    }

    for (const [field, count] of Object.entries(decrements)) {
      const currentValue = (existing as Record<string, unknown>)[field];
      updateData[field] = Math.max(0, (typeof currentValue === 'number' ? currentValue : 0) - count);
    }

    await prisma.conversationMessageStats.update({
      where: { conversationId },
      data: updateData,
    });

    this.invalidate(conversationId);
  }

  async getStats(prisma: PrismaClient, conversationId: string): Promise<Record<string, unknown>> {
    const cached = this.cache.get(conversationId);
    if (this.isValid(cached)) {
      return cached.data;
    }

    const row = await prisma.conversationMessageStats.findUnique({
      where: { conversationId },
    });

    if (!row) {
      const recomputed = await this.recompute(prisma, conversationId);
      return this.shapeResponse(recomputed);
    }

    const shaped = this.shapeResponse(row);
    this.setCache(conversationId, shaped);
    return shaped;
  }

  async recompute(prisma: PrismaClient, conversationId: string): Promise<Record<string, unknown>> {
    const messages = await prisma.message.findMany({
      where: { conversationId, deletedAt: null },
      select: {
        content: true,
        senderId: true,
        createdAt: true,
        originalLanguage: true,
        messageType: true,
        sender: { select: { userId: true } },
        attachments: { select: { mimeType: true } },
      },
    });

    let totalMessages = 0;
    let totalWords = 0;
    let totalCharacters = 0;
    let textMessages = 0;
    let imageCount = 0;
    let audioCount = 0;
    let videoCount = 0;
    let fileCount = 0;
    let locationCount = 0;

    const participantStats: Record<string, ParticipantStatEntry> = {};
    const dailyActivity: Record<string, number> = {};
    const hourlyDistribution: Record<string, number> = {};
    const languageDistribution: Record<string, number> = {};

    for (const msg of messages) {
      totalMessages += 1;
      const words = countWords(msg.content);
      const chars = countCharacters(msg.content);
      totalWords += words;
      totalCharacters += chars;

      const userId = msg.sender?.userId || msg.senderId;

      if (!participantStats[userId]) {
        participantStats[userId] = {
          messageCount: 0,
          wordCount: 0,
          characterCount: 0,
          imageCount: 0,
          audioCount: 0,
          videoCount: 0,
          firstMessageAt: null,
          lastMessageAt: null,
        };
      }
      const entry = participantStats[userId];
      entry.messageCount += 1;
      entry.wordCount += words;
      entry.characterCount += chars;

      const msgTime = msg.createdAt.toISOString();
      if (!entry.firstMessageAt || msgTime < entry.firstMessageAt) {
        entry.firstMessageAt = msgTime;
      }
      if (!entry.lastMessageAt || msgTime > entry.lastMessageAt) {
        entry.lastMessageAt = msgTime;
      }

      const msgType = msg.messageType || 'text';
      if (msgType === 'text' && msg.attachments.length === 0) {
        textMessages += 1;
      }

      for (const att of msg.attachments) {
        const resolved = resolveAttachmentType(att.mimeType);
        if (resolved === 'image') { imageCount += 1; entry.imageCount += 1; }
        else if (resolved === 'audio') { audioCount += 1; entry.audioCount += 1; }
        else if (resolved === 'video') { videoCount += 1; entry.videoCount += 1; }
        else if (resolved === 'file') { fileCount += 1; }
      }

      if (msgType === 'location') {
        locationCount += 1;
      }

      const day = msg.createdAt.toISOString().slice(0, 10);
      dailyActivity[day] = (dailyActivity[day] || 0) + 1;

      const hour = String(msg.createdAt.getHours());
      hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;

      if (msg.originalLanguage) {
        languageDistribution[msg.originalLanguage] = (languageDistribution[msg.originalLanguage] || 0) + 1;
      }
    }

    const prunedDaily = pruneDailyActivity(dailyActivity);

    const row = await prisma.conversationMessageStats.upsert({
      where: { conversationId },
      create: {
        conversationId,
        totalMessages,
        totalWords,
        totalCharacters,
        textMessages,
        imageCount,
        audioCount,
        videoCount,
        fileCount,
        locationCount,
        participantStats: participantStats as unknown as Prisma.InputJsonValue,
        dailyActivity: prunedDaily as unknown as Prisma.InputJsonValue,
        hourlyDistribution: hourlyDistribution as unknown as Prisma.InputJsonValue,
        languageDistribution: languageDistribution as unknown as Prisma.InputJsonValue,
      },
      update: {
        totalMessages,
        totalWords,
        totalCharacters,
        textMessages,
        imageCount,
        audioCount,
        videoCount,
        fileCount,
        locationCount,
        participantStats: participantStats as unknown as Prisma.InputJsonValue,
        dailyActivity: prunedDaily as unknown as Prisma.InputJsonValue,
        hourlyDistribution: hourlyDistribution as unknown as Prisma.InputJsonValue,
        languageDistribution: languageDistribution as unknown as Prisma.InputJsonValue,
      },
    });

    const shaped = this.shapeResponse(row);
    this.setCache(conversationId, shaped);
    return shaped;
  }

  private shapeResponse(row: Record<string, unknown>): Record<string, unknown> {
    return {
      conversationId: row.conversationId,
      totalMessages: row.totalMessages,
      totalWords: row.totalWords,
      totalCharacters: row.totalCharacters,
      contentTypes: {
        text: row.textMessages,
        image: row.imageCount,
        audio: row.audioCount,
        video: row.videoCount,
        file: row.fileCount,
        location: row.locationCount,
      },
      participantStats: typeof row.participantStats === 'string'
        ? JSON.parse(row.participantStats as string)
        : row.participantStats,
      dailyActivity: typeof row.dailyActivity === 'string'
        ? JSON.parse(row.dailyActivity as string)
        : row.dailyActivity,
      hourlyDistribution: typeof row.hourlyDistribution === 'string'
        ? JSON.parse(row.hourlyDistribution as string)
        : row.hourlyDistribution,
      languageDistribution: typeof row.languageDistribution === 'string'
        ? JSON.parse(row.languageDistribution as string)
        : row.languageDistribution,
      updatedAt: row.updatedAt,
    };
  }
}

function resolveAttachmentType(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
}

export const conversationMessageStatsService = ConversationMessageStatsService.getInstance();
