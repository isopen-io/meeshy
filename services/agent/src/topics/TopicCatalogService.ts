import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Redis } from 'ioredis';
import type { TopicCatalogEntry, TopicInput } from './types';

const CACHE_KEY = 'agent:topics:catalog:active';
const CACHE_TTL_SEC = 5 * 60;

/**
 * Source unique de lecture du catalogue de topics. Combine :
 *   - cache Redis (5min TTL) — partagé entre instances agent
 *   - cache mémoire local (compiled regex map) — évite la re-compile à chaque scan
 *
 * Toute mutation (create/update/delete) invalide les deux caches. La
 * propagation cross-instance est gérée par ConfigCache.onTopicsInvalidated
 * (Redis pub/sub via broadcastInvalidation gateway → listener agent).
 */
export class TopicCatalogService {
  private compiledRegexCache: Map<string, RegExp[]> = new Map();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redis: Redis,
  ) {}

  async list(opts: { activeOnly?: boolean } = {}): Promise<TopicCatalogEntry[]> {
    const cached = await this.redis.get(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as TopicCatalogEntry[];
      this.rebuildCompiledCache(parsed);
      return opts.activeOnly ? parsed.filter((t) => t.isActive) : parsed;
    }
    const all = await this.prisma.agentTopicCatalog.findMany();
    await this.redis.set(CACHE_KEY, JSON.stringify(all), 'EX', CACHE_TTL_SEC);
    this.rebuildCompiledCache(all);
    return opts.activeOnly ? all.filter((t) => t.isActive) : all;
  }

  async get(id: string): Promise<TopicCatalogEntry | null> {
    return this.prisma.agentTopicCatalog.findUnique({ where: { id } });
  }

  async getBySlug(slug: string): Promise<TopicCatalogEntry | null> {
    return this.prisma.agentTopicCatalog.findUnique({ where: { slug } });
  }

  async create(input: TopicInput): Promise<TopicCatalogEntry> {
    const created = await this.prisma.agentTopicCatalog.create({ data: input });
    await this.invalidate();
    return created;
  }

  async update(id: string, patch: Partial<TopicInput>): Promise<TopicCatalogEntry> {
    const updated = await this.prisma.agentTopicCatalog.update({
      where: { id },
      data: patch,
    });
    await this.invalidate();
    return updated;
  }

  async delete(id: string, opts: { hard?: boolean } = {}): Promise<void> {
    if (opts.hard) {
      await this.prisma.agentTopicCatalog.delete({ where: { id } });
    } else {
      await this.prisma.agentTopicCatalog.update({
        where: { id },
        data: { isActive: false },
      });
    }
    await this.invalidate();
  }

  async invalidate(): Promise<void> {
    await this.redis.del(CACHE_KEY);
    this.compiledRegexCache.clear();
  }

  /**
   * Retourne les regex compilées pour ce topic. Vide si topic inconnu ou si
   * le cache n'a pas encore été warmé (consumers doivent appeler list() avant).
   */
  compiledPatternsFor(topicId: string): RegExp[] {
    return this.compiledRegexCache.get(topicId) ?? [];
  }

  private rebuildCompiledCache(topics: TopicCatalogEntry[]): void {
    this.compiledRegexCache.clear();
    for (const t of topics) {
      const regexes: RegExp[] = [];
      for (const src of t.keywordPatterns) {
        try {
          regexes.push(new RegExp(src, 'i'));
        } catch {
          // Ignore les regex invalides — validation faite à l'admin write.
        }
      }
      this.compiledRegexCache.set(t.id, regexes);
    }
  }
}
