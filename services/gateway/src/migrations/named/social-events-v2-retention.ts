import { MongoServerError, type Db } from 'mongodb';
import type { ExistingIndex } from '../../services/social/socialEventIndexes';
import {
  migrateSocialEventsRetention,
  type RetentionStore,
} from '../../services/social/socialEventsRetentionMigration';
import type { NamedMigration } from './types';

const NAMESPACE_NOT_FOUND = 26;

const dueForExpiry = (retentionMs: number) => ({
  $or: [
    { expiresAt: { $exists: false } },
    { expiresAt: null },
    { $expr: { $lt: ['$expiresAt', { $add: ['$createdAt', retentionMs] }] } },
  ],
});

function mongoStore(db: Db): RetentionStore {
  return {
    async list(collection) {
      try {
        return (await db.collection(collection).listIndexes().toArray()) as unknown as ExistingIndex[];
      } catch (error) {
        if (error instanceof MongoServerError && error.code === NAMESPACE_NOT_FOUND) return [];
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
      const result = await db
        .collection(collection)
        .updateMany(dueForExpiry(retentionMs), [
          { $set: { expiresAt: { $add: [{ $ifNull: ['$createdAt', '$$NOW'] }, retentionMs] } } },
        ]);
      return result.modifiedCount;
    },
  };
}

/**
 * La conservation de la télémétrie de lecture (#10510, conformité O7) : index
 * nommés de la v2 et échéance des `PostImpression` / `PostEngagement`
 * existants. La durée est `RAW_READING_RETENTION_DAYS` de la passerelle
 * (`config/raw-reading-retention.ts`) — exécutée dans son conteneur, la
 * migration lit la valeur que la passerelle applique. Ne raccourcit jamais une
 * échéance ; idempotente. La logique et ses témoins vivent dans
 * `services/social/socialEventsRetentionMigration.ts`.
 */
export const socialEventsV2Retention: NamedMigration = {
  name: '2026-10-13-social-events-v2-retention',
  issue: '#10510',
  summary: 'index de la télémétrie v2 et échéance des impressions / engagements existants',
  async run({ db, dryRun, log }) {
    const report = await migrateSocialEventsRetention(mongoStore(db), { dryRun });
    log(`  durée : ${report.retentionMs / 86_400_000} j (RAW_READING_RETENTION_DAYS)`);
    Object.entries(report.backfilled).forEach(([collection, count]) =>
      log(`  ${collection} sans échéance ou datées plus court : ${count}`),
    );
    Object.entries(report.indexes).forEach(([name, outcome]) => log(`  index ${name} : ${outcome}`));
  },
};
