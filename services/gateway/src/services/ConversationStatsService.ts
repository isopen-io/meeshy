import { PrismaClient } from '@meeshy/shared/prisma/client';

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

  private constructor(ttlMs: number = 60 * 60 * 1000) { // 1h par défaut
    this.ttlMs = ttlMs;
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
    const existing = this.cache.get(conversationId);
    if (!this.isValid(existing)) {
      // Recompute from DB if not present/expired
      return await this.getOrCompute(prisma, conversationId, getConnectedUserIds);
    }

    // Incremental update on message language count
    const stats = { ...existing!.stats };
    stats.messagesPerLanguage = { ...stats.messagesPerLanguage };
    stats.messagesPerLanguage[messageLanguage] = (stats.messagesPerLanguage[messageLanguage] || 0) + 1;

    // Refresh online users snapshot quickly (cheap intersection)
    stats.onlineUsers = await this.computeOnlineUsers(prisma, conversationId, getConnectedUserIds());
    stats.updatedAt = new Date();

    this.cache.set(conversationId, {
      stats,
      expiresAt: Date.now() + this.ttlMs
    });
    return stats;
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
      where: { conversationId: realConversationId, isDeleted: false },
      _count: { _all: true }
    }).catch(() => [] as any[]);

    const messagesPerLanguage: Record<string, number> = {};
    for (const row of messagesAgg) {
      messagesPerLanguage[row.originalLanguage] = row._count._all;
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
        participantsPerLanguage[u.systemLanguage] = (participantsPerLanguage[u.systemLanguage] || 0) + 1;
      }
    } else {
      const members = await prisma.conversationMember.findMany({
        where: {
          conversationId: realConversationId,
          isActive: true,
          user: { isNot: null }  // Exclure les membres avec user supprimé
        },
        select: { user: { select: { id: true, systemLanguage: true } } }
      }).catch(() => [] as any[]);
      participantCount = members.length;
      for (const m of members) {
        // Sécurité supplémentaire si user est null
        if (m.user) {
          const lang = m.user.systemLanguage;
          participantsPerLanguage[lang] = (participantsPerLanguage[lang] || 0) + 1;
        }
      }
    }

    // Online users snapshot
    const onlineUsers = await this.computeOnlineUsers(prisma, realConversationId, getConnectedUserIds());

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
        where: { id: conversationId }
      });
      
      if (!conversation) {
        return []; // Conversation n'existe pas
      }
    }
    
    if (!isGlobalConversation) {
      const members = await prisma.conversationMember.findMany({
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


