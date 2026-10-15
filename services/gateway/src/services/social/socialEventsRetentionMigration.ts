import { POST_ENGAGEMENT_RETENTION_MS, POST_IMPRESSION_RETENTION_MS } from './contentEvents';
import { ensureSocialEventIndexes, type IndexOutcome, type IndexStore } from './socialEventIndexes';

/**
 * La migration NOMMÉE de la conservation de la télémétrie (#10510, revue de
 * conformité O7) : les index (unique partiel de la clé d'événement, TTL) ET
 * l'échéance des lignes écrites AVANT la v2, sans quoi leur conservation
 * resterait illimitée (RGPD art. 5(1)(e)).
 *
 * `expiresAt = createdAt + 90 j` : une ligne de plus de 90 jours EXPIRE dès
 * le passage suivant du moniteur TTL. En production, la migration attend le
 * feu vert du porteur et une sauvegarde vérifiée. Idempotente : une ligne qui
 * a son échéance n'est plus visée.
 */

export type RetentionStore = IndexStore & {
  countWithoutExpiry(collection: string): Promise<number>;
  backfillExpiry(collection: string, retentionMs: number): Promise<number>;
};

export const RETENTION_BACKFILLS = [
  { collection: 'PostImpression', retentionMs: POST_IMPRESSION_RETENTION_MS },
  { collection: 'PostEngagement', retentionMs: POST_ENGAGEMENT_RETENTION_MS },
] as const;

export type RetentionMigrationReport = {
  readonly indexes: Readonly<Record<string, IndexOutcome>>;
  readonly backfilled: Readonly<Record<(typeof RETENTION_BACKFILLS)[number]['collection'], number>>;
};

export async function migrateSocialEventsRetention(
  store: RetentionStore,
  options: { readonly dryRun?: boolean } = {},
): Promise<RetentionMigrationReport> {
  const backfilled: Record<string, number> = {};
  for (const { collection, retentionMs } of RETENTION_BACKFILLS) {
    backfilled[collection] = options.dryRun
      ? await store.countWithoutExpiry(collection)
      : await store.backfillExpiry(collection, retentionMs);
  }
  const indexes = await ensureSocialEventIndexes(store, options);
  return { indexes, backfilled: backfilled as RetentionMigrationReport['backfilled'] };
}
