import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { INITIAL_TOPICS } from './seeds/initial-topics';

/**
 * Seed du catalogue au boot agent, idempotent PAR SLUG (#6192) :
 *   - un slug absent du catalogue est inséré depuis initial-topics.ts ;
 *   - un slug déjà présent n'est JAMAIS réécrit (les éditions admin priment).
 *
 * L'ancienne règle « seed seulement si le catalogue est vide » retenait tout
 * sujet ajouté après le premier boot : les faits divers par pays n'auraient
 * jamais atteint une base de prod déjà seedée.
 *
 * Race au boot de plusieurs instances : `createMany` MongoDB lève P2002 sur
 * slug ; on le catch et l'autre instance a déjà posé les lignes.
 */
export class TopicSeedService {
  constructor(private readonly prisma: PrismaClient) {}

  async run(): Promise<{ inserted: number; skipped: boolean }> {
    const existing = await this.prisma.agentTopicCatalog.findMany({ select: { slug: true } });
    const known = new Set(existing.map((row) => row.slug));
    const missing = INITIAL_TOPICS.filter((topic) => !known.has(topic.slug));

    if (missing.length === 0) {
      console.log(`[TopicSeed] Catalogue complet (${known.size} entries), rien à insérer`);
      return { inserted: 0, skipped: true };
    }
    try {
      const result = await this.prisma.agentTopicCatalog.createMany({ data: missing });
      console.log(`[TopicSeed] Inserted ${result.count} missing topics: ${missing.map((t) => t.slug).join(', ')}`);
      return { inserted: result.count, skipped: false };
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'P2002') {
        console.log('[TopicSeed] Race detected (P2002), another instance seeded first');
        return { inserted: 0, skipped: true };
      }
      throw err;
    }
  }
}
