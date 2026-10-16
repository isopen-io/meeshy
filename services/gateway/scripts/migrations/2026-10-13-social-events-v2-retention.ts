/**
 * Migration du 2026-10-13 (#10510, revue de conformité O7) — la conservation
 * de la télémétrie de lecture :
 *  - pose les index nommés de la v2 (unique PARTIEL de `eventKey` sur
 *    `ContentEvent` et `PostImpression`, TTL de `expiresAt` sur `ContentEvent`,
 *    `PostImpression` et `PostEngagement`, index de lecture de `ContentEvent`) ;
 *  - donne `expiresAt = createdAt + durée` aux lignes `PostImpression` et
 *    `PostEngagement` qui n'ont pas d'échéance OU dont l'échéance tombe avant
 *    `createdAt + durée` — ce qui RALLONGE les lignes datées à 90 j par la
 *    première version de cette migration (staging les a reçues).
 *
 * La durée est `RAW_READING_RETENTION_DAYS` (25 mois / 760 j par défaut —
 * décision porteur, commentaire 6222116672 de #10510), la MÊME source que les
 * lignes neuves (`src/config/raw-reading-retention.ts`). Lancer la migration
 * avec la valeur que la passerelle de l'environnement visé utilise.
 *
 * ⚠ Une ligne plus ancienne que la durée EXPIRE au passage suivant du moniteur
 * TTL (au défaut : plus de 25 mois). La migration ne RACCOURCIT jamais une
 * échéance. En autonomie sur staging ; en production SEULEMENT après feu vert
 * du porteur et sauvegarde vérifiée.
 *
 * FAÇADE MINCE : la logique vit dans
 * `src/services/social/socialEventsRetentionMigration.ts` (témoins :
 * `socialEventsRetentionMigration.test.ts`, `socialEventIndexes.test.ts`).
 * Idempotente : rejouée avec la même durée, elle ne trouve plus rien. Jamais
 * `prisma db push`.
 *
 * Usage :
 *   cd services/gateway
 *   DRY_RUN=1 bunx tsx scripts/migrations/2026-10-13-social-events-v2-retention.ts
 *   bunx tsx scripts/migrations/2026-10-13-social-events-v2-retention.ts
 *   RAW_READING_RETENTION_DAYS=400 bunx tsx scripts/migrations/2026-10-13-social-events-v2-retention.ts
 */
import { MongoClient, MongoServerError } from 'mongodb';
import type { ExistingIndex } from '../../src/services/social/socialEventIndexes';
import {
  migrateSocialEventsRetention,
  type RetentionStore,
} from '../../src/services/social/socialEventsRetentionMigration';

const DRY_RUN = process.env.DRY_RUN === '1';
const dueForExpiry = (retentionMs: number) => ({
  $or: [
    { expiresAt: { $exists: false } },
    { expiresAt: null },
    { $expr: { $lt: ['$expiresAt', { $add: ['$createdAt', retentionMs] }] } },
  ],
});

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
    async countToBackfill(collection, retentionMs) {
      return db.collection(collection).countDocuments(dueForExpiry(retentionMs));
    },
    async backfillExpiry(collection, retentionMs) {
      const result = await db.collection(collection).updateMany(dueForExpiry(retentionMs), [
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
    console.log(`  durée : ${report.retentionMs / 86_400_000} j (RAW_READING_RETENTION_DAYS)`);
    for (const [collection, count] of Object.entries(report.backfilled)) {
      console.log(`  ${collection} sans échéance ou datées plus court : ${count}`);
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
