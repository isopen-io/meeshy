/**
 * Migration du 2026-10-13 (#10510, revue de conformité O7) — la conservation
 * de la télémétrie de lecture :
 *  - pose les index nommés de la v2 (unique PARTIEL de `eventKey` sur
 *    `ContentEvent` et `PostImpression`, TTL de `expiresAt` sur `ContentEvent`,
 *    `PostImpression` et `PostEngagement`, index de lecture de `ContentEvent`) ;
 *  - donne `expiresAt = createdAt + 90 j` aux lignes `PostImpression` et
 *    `PostEngagement` écrites avant la v2.
 *
 * ⚠ Une ligne de plus de 90 jours EXPIRE au passage suivant du moniteur TTL :
 * l'historique de fatigue d'impression et les sessions de lecture anciennes
 * disparaissent (les compteurs des posts restent). En autonomie sur staging ;
 * en production SEULEMENT après feu vert du porteur et sauvegarde vérifiée.
 *
 * FAÇADE MINCE : la logique vit dans
 * `src/services/social/socialEventsRetentionMigration.ts` (témoins :
 * `socialEventsRetentionMigration.test.ts`, `socialEventIndexes.test.ts`).
 * Idempotente : rejouée, elle ne trouve plus rien. Jamais `prisma db push`.
 *
 * Usage :
 *   cd services/gateway
 *   DRY_RUN=1 bunx tsx scripts/migrations/2026-10-13-social-events-v2-retention.ts
 *   bunx tsx scripts/migrations/2026-10-13-social-events-v2-retention.ts
 */
import { MongoClient, MongoServerError } from 'mongodb';
import type { ExistingIndex } from '../../src/services/social/socialEventIndexes';
import {
  migrateSocialEventsRetention,
  type RetentionStore,
} from '../../src/services/social/socialEventsRetentionMigration';

const DRY_RUN = process.env.DRY_RUN === '1';
const MISSING_EXPIRY = { $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }] };

function mongoStore(client: MongoClient): RetentionStore {
  const db = client.db();
  return {
    async list(collection) {
      try {
        return (await db.collection(collection).listIndexes().toArray()) as unknown as ExistingIndex[];
      } catch (error) {
        if (error instanceof MongoServerError && error.code === 26) return [];
        throw error;
      }
    },
    async create(spec) {
      const { collection, key, ...options } = spec;
      await db.collection(collection).createIndex(key, options);
    },
    async drop(collection, name) {
      await db.collection(collection).dropIndex(name);
    },
    async countWithoutExpiry(collection) {
      return db.collection(collection).countDocuments(MISSING_EXPIRY);
    },
    async backfillExpiry(collection, retentionMs) {
      const result = await db.collection(collection).updateMany(MISSING_EXPIRY, [
        { $set: { expiresAt: { $add: [{ $ifNull: ['$createdAt', '$$NOW'] }, retentionMs] } } },
      ]);
      return result.modifiedCount;
    },
  };
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL manquante');

  const client = new MongoClient(url);
  console.log('Conservation de la télémétrie de lecture (#10510)');
  console.log(`  mode : ${DRY_RUN ? 'À BLANC (DRY_RUN=1)' : 'ÉCRITURE'}`);
  try {
    await client.connect();
    const report = await migrateSocialEventsRetention(mongoStore(client), { dryRun: DRY_RUN });
    for (const [collection, count] of Object.entries(report.backfilled)) {
      console.log(`  ${collection} sans échéance : ${count}`);
    }
    for (const [name, outcome] of Object.entries(report.indexes)) {
      console.log(`  index ${name} : ${outcome}`);
    }
    if (DRY_RUN) console.log("\nÀ blanc : rien n'a été écrit. Relancer sans DRY_RUN pour appliquer.");
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('Échec de la migration :', error instanceof Error ? error.message : error);
  process.exit(1);
});
