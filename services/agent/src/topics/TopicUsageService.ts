import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { TopicCatalogEntry } from './types';

/**
 * Tracking d'usage des topics per conv pour respecter le cooldown anti-spam.
 *
 * Read pattern : `filterEligible(topics, conversationId)` retourne les
 * topics éligibles (pas en cooldown). Couvert par l'index
 * `[conversationId, topicId, usedAt(sort: Desc)]` → ~5ms même à 10M logs.
 */
export class TopicUsageService {
  constructor(private readonly prisma: PrismaClient) {}

  async record(topicId: string, conversationId: string): Promise<void> {
    await this.prisma.agentTopicUsageLog.create({
      data: { topicId, conversationId },
    });
  }

  /**
   * Retourne les topics éligibles (pas en cooldown). Single batch query :
   * récupère le `usedAt` le plus récent par topicId pour cette conv.
   */
  async filterEligible(
    topics: TopicCatalogEntry[],
    conversationId: string,
  ): Promise<TopicCatalogEntry[]> {
    if (topics.length === 0) return [];

    const usages = await this.prisma.agentTopicUsageLog.findMany({
      where: {
        conversationId,
        topicId: { in: topics.map((t) => t.id) },
      },
      orderBy: { usedAt: 'desc' },
      distinct: ['topicId'],
      select: { topicId: true, usedAt: true },
    });

    const lastUsedMap = new Map<string, Date>();
    for (const u of usages) {
      lastUsedMap.set(u.topicId, u.usedAt);
    }

    const now = Date.now();
    return topics.filter((t) => {
      const last = lastUsedMap.get(t.id);
      if (!last) return true;
      const elapsedMs = now - last.getTime();
      return elapsedMs >= t.cooldownMinutes * 60_000;
    });
  }
}
