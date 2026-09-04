import { PrismaClient } from '@meeshy/shared/prisma/client';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';

export interface OnlineUserInfo {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  systemLanguage?: string;
  displayName?: string;
}

export interface ConversationStats {
  messagesPerLanguage: Record<string, number>;
  participantCount: number;
  participantsPerLanguage: Record<string, number>;
  onlineUsers: OnlineUserInfo[];
  updatedAt: Date;
}

interface CacheEntry {
  stats: ConversationStats;
  expiresAt: number;
}

export class ConversationStatsService {
  private static instance: ConversationStatsService | null = null;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private readonly updateLocks = new Map<string, Promise<void>>();

  private constructor(ttlMs: number = 60 * 60 * 1000) { // 1h par défaut
    this.ttlMs = ttlMs;
    this.startPeriodicCleanup();
  }

  private startPeriodicCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache) {
        if (now >= entry.expiresAt) this.cache.delete(key);
      }
    }, 15 * 60 * 1000);
    this.cleanupInterval.unref?.();
  }

  public static getInstance(): ConversationStatsService {
    if (!this.instance) {
      this.instance = new ConversationStatsService();
    }
    return this.instance;
  }

  public getActiveConversationIds(): string[] {
    return Array.from(this.cache.keys()).filter((id) => {
      const entry = this.cache.get(id)!;
      return Date.now() < entry.expiresAt;
    });
  }

  public invalidate(conversationId: string): void {
    this.cache.delete(conversationId);
  }

  private isValid(entry?: CacheEntry | null): entry is CacheEntry {
    return !!entry && Date.now() < entry.expiresAt;
  }

  public async getOrCompute(
    prisma: PrismaClient,
    conversationId: string,
    getConnectedUserIds: () => string[]
  ): Promise<ConversationStats> {
    const existing = this.cache.get(conversationId);
    if (this.isValid(existing)) {
      return existing!.stats;
    }

    const stats = await this.computeStats(prisma, conversationId, getConnectedUserIds);
    this.cache.set(conversationId, {
      stats,
      expiresAt: Date.now() + this.ttlMs
    });
    return stats;
  }

  public async updateOnNewMessage(
    prisma: PrismaClient,
    conversationId: string,
    messageLanguage: string,
    getConnectedUserIds: () => string[]
  ): Promise<ConversationStats> {
    // Serialized per conversationId: two messages landing back-to-back in the
    // same conversation must not both read the pre-increment snapshot across
    // the `await computeOnlineUsers` below, which would drop one increment.
    return this.withConversationLock(conversationId, async () => {
      const existing = this.cache.get(conversationId);
      if (!this.isValid(existing)) {
        // Recompute from DB if not present/expired
        return await this.getOrCompute(prisma, conversationId, getConnectedUserIds);
      }

      // Incremental update on message language count. Callers pass the RAW
      // persisted `originalLanguage` (`'fr-FR'`, `'FR'`, `'EN'`), so canonicalize
      // through the same SSOT the full recompute (computeStats) uses — otherwise
      // the two twins diverge and a region-tagged message opens a distinct
      // `'fr-fr'` bucket beside the `'fr'` one it should have bumped.
      const stats = { ...existing!.stats };
      stats.messagesPerLanguage = { ...stats.messagesPerLanguage };
      const incLang = messageLanguage ? normalizeLanguageForDedup(messageLanguage) : '';
      if (incLang) {
        stats.messagesPerLanguage[incLang] = (stats.messagesPerLanguage[incLang] || 0) + 1;
      }

      // Refresh online users snapshot quickly (cheap intersection)
      stats.onlineUsers = await this.computeOnlineUsers(prisma, conversationId, getConnectedUserIds());
      stats.updatedAt = new Date();

      this.cache.set(conversationId, {
        stats,
        expiresAt: Date.now() + this.ttlMs
      });
      return stats;
    });
  }

  /**
   * Chains `fn` after any in-flight update for the same key so concurrent
   * callers never interleave a read-modify-write on the same cache entry.
   * Self-cleaning: the lock entry is removed once its chain drains, so
   * `updateLocks` only holds entries for conversations with an update
   * in flight (bounded by concurrency, not by total conversations ever seen).
   */
  private async withConversationLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.updateLocks.get(key) ?? Promise.resolve();
    const result = previous.then(fn, fn);
    const settled = result.then(
      () => undefined,
      () => undefined
    );
    this.updateLocks.set(key, settled);
    settled.finally(() => {
      if (this.updateLocks.get(key) === settled) {
        this.updateLocks.delete(key);
      }
    });
    return result;
  }

  public async recompute(
    prisma: PrismaClient,
    conversationId: string,
    getConnectedUserIds: () => string[]
  ): Promise<ConversationStats> {
    const stats = await this.computeStats(prisma, conversationId, getConnectedUserIds);
    this.cache.set(conversationId, { stats, expiresAt: Date.now() + this.ttlMs });
    return stats;
  }

  private async computeStats(
    prisma: PrismaClient,
    conversationId: string,
    getConnectedUserIds: () => string[]
  ): Promise<ConversationStats> {
    // Résoudre l'ID réel de la conversation si c'est un identifiant
    let realConversationId = conversationId;
    let isGlobalConversation = false;
    
    if (conversationId === "meeshy") {
      const globalConversation = await prisma.conversation.findFirst({
        where: { identifier: "meeshy" }
      });
      
      if (globalConversation) {
        realConversationId = globalConversation.id;
        isGlobalConversation = true;
      } else {
        // Si la conversation globale n'existe pas, retourner des stats vides
        return {
          messagesPerLanguage: {},
          participantsPerLanguage: {},
          participantCount: 0,
          onlineUsers: [],
          updatedAt: new Date()
        };
      }
    } else {
      // Vérifier si c'est une conversation normale
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId }
      });
      
      if (!conversation) {
        return {
          messagesPerLanguage: {},
          participantsPerLanguage: {},
          participantCount: 0,
          onlineUsers: [],
          updatedAt: new Date()
        };
      }
    }

    // Messages per language
    const messagesAgg = await prisma.message.groupBy({
      by: ['originalLanguage'],
      where: { conversationId: realConversationId, deletedAt: null },
      _count: { _all: true }
    }).catch(() => [] as any[]);

    // `originalLanguage` is persisted verbatim, so a client's per-language
    // breakdown would split 'en'/'en-US' and 'fr'/'FR' into distinct rows. Fold
    // each groupBy row through the shared canonicalization SSOT and ACCUMULATE
    // (not assign): two rows can now map to the same canonical key. A null/empty
    // language is not a language bucket — skip it (mirrors audienceLanguages).
    const messagesPerLanguage: Record<string, number> = {};
    for (const row of messagesAgg) {
      const lang = row.originalLanguage ? normalizeLanguageForDedup(row.originalLanguage) : '';
      if (!lang) continue;
      messagesPerLanguage[lang] = (messagesPerLanguage[lang] || 0) + row._count._all;
    }

    // Participants and participants per language
    let participantCount = 0;
    const participantsPerLanguage: Record<string, number> = {};
    
    if (isGlobalConversation) {
      const users = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, systemLanguage: true }
      }).catch(() => []);
      participantCount = users.length;
      for (const u of users) {
        const lang = u.systemLanguage ? normalizeLanguageForDedup(u.systemLanguage) : '';
        if (!lang) continue;
        participantsPerLanguage[lang] = (participantsPerLanguage[lang] || 0) + 1;
      }
    } else {
      const members = await prisma.participant.findMany({
        where: {
          conversationId: realConversationId,
          isActive: true,
          // Note: userId is required field, no need to filter nulls
        },
        select: { user: { select: { id: true, systemLanguage: true } } }
      }).catch(() => [] as any[]);
      participantCount = members.length;
      for (const m of members) {
        // Sécurité supplémentaire si user est null
        if (m.user && m.user.systemLanguage) {
          const lang = normalizeLanguageForDedup(m.user.systemLanguage);
          if (lang) participantsPerLanguage[lang] = (participantsPerLanguage[lang] || 0) + 1;
        }
      }
    }

    // Online users snapshot. Pass the RAW identifier (not realConversationId): computeOnlineUsers
    // re-derives the global flag by comparing its argument to the "meeshy" literal, and the global
    // conversation has no Participant rows — handing it the resolved ObjectId sends it down the
    // participant-filter branch, which finds nothing and yields []. Mirrors updateOnNewMessage.
    const onlineUsers = await this.computeOnlineUsers(prisma, conversationId, getConnectedUserIds());

    return {
      messagesPerLanguage,
      participantCount,
      participantsPerLanguage,
      onlineUsers,
      updatedAt: new Date()
    };
  }

  private async computeOnlineUsers(
    prisma: PrismaClient,
    conversationId: string,
    connectedUserIds: string[]
  ): Promise<OnlineUserInfo[]> {
    if (connectedUserIds.length === 0) return [];

    let allowedIds: string[] = connectedUserIds;
    
    // Résoudre l'ID réel de la conversation si c'est un identifiant
    let realConversationId = conversationId;
    let isGlobalConversation = false;
    
    if (conversationId === "meeshy") {
      const globalConversation = await prisma.conversation.findFirst({
        where: { identifier: "meeshy" }
      });
      
      if (globalConversation) {
        realConversationId = globalConversation.id;
        isGlobalConversation = true;
      } else {
        return []; // Conversation globale n'existe pas
      }
    } else {
      // Vérifier si c'est une conversation normale
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId },
        select: { id: true }
      });

      if (!conversation) {
        return []; // Conversation n'existe pas
      }
    }
    
    if (!isGlobalConversation) {
      const members = await prisma.participant.findMany({
        where: { conversationId: realConversationId, isActive: true, userId: { in: connectedUserIds } },
        select: { userId: true }
      }).catch(() => [] as any[]);
      allowedIds = members.map((m: any) => m.userId);
      if (allowedIds.length === 0) return [];
    }

    const users = await prisma.user.findMany({
      where: { id: { in: allowedIds } },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
        avatar: true,
        systemLanguage: true,
        displayName: true
      }
    }).catch(() => []);
    return users.map(u => ({
      id: u.id,
      username: u.username,
      firstName: u.firstName,
      lastName: u.lastName,
      avatar: u.avatar || undefined,
      systemLanguage: u.systemLanguage || 'fr',
      displayName: u.displayName || undefined
    }));
  }
}

export const conversationStatsService = ConversationStatsService.getInstance();


