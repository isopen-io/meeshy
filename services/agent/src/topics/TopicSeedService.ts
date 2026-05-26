import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { INITIAL_TOPICS } from './seeds/initial-topics';

/**
 * Auto-seed du catalogue au boot agent. Idempotent :
 *   - count == 0 → insert les 13 thèmes hardcodés depuis initial-topics.ts
 *   - count > 0  → no-op silencieux (respecte les éditions admin ultérieures)
 *
 * Race au boot de plusieurs instances : `createMany` MongoDB lance la
 * UniqueViolationException (P2002) sur slug, on catch et retourne le count
 * inséré jusque-là. La 2e instance verra count>0 au prochain check.
 */
export class TopicSeedService {
  constructor(private readonly prisma: PrismaClient) {}

  async run(): Promise<{ inserted: number; skipped: boolean }> {
    const existing = await this.prisma.agentTopicCatalog.count();
    if (existing > 0) {
      console.log(`[TopicSeed] Catalogue non vide (${existing} entries), seed skipped`);
      return { inserted: 0, skipped: true };
    }
    try {
      const result = await this.prisma.agentTopicCatalog.createMany({
        data: INITIAL_TOPICS,
      });
      console.log(`[TopicSeed] Inserted ${result.count} topics from initial-topics.ts`);
      return { inserted: result.count, skipped: false };
    } catch (err: any) {
      // Race condition au boot multi-instances : une autre instance a déjà seed.
      if (err?.code === 'P2002') {
        console.log('[TopicSeed] Race detected (P2002), another instance seeded first');
        return { inserted: 0, skipped: true };
      }
      throw err;
    }
  }
}
