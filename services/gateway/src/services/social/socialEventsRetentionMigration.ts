import { rawReadingRetentionMs } from '../../config/raw-reading-retention';
import { ensureSocialEventIndexes, type IndexOutcome, type IndexStore } from './socialEventIndexes';

/**
 * La migration NOMMÉE de la conservation de la télémétrie (#10510, revue de
 * conformité O7) : les index (unique partiel de la clé d'événement, TTL) ET
 * l'échéance des lignes `PostImpression` et `PostEngagement` existantes, sans
 * quoi leur conservation resterait illimitée (RGPD art. 5(1)(e)).
 *
 * La durée est celle des lignes neuves, `rawReadingRetentionMs()`
 * (`RAW_READING_RETENTION_DAYS`, 25 mois par défaut — décision porteur,
 * commentaire 6222116672). Une ligne est visée si elle n'a pas d'échéance OU
 * si son échéance tombe AVANT `createdAt + durée` — ce qui RALLONGE les lignes
 * datées à 90 j par la version précédente. Elle ne raccourcit jamais une
 * échéance. Idempotente : rejouée avec la même durée, elle ne trouve plus rien.
 */

export type RetentionStore = IndexStore & {
  countToBackfill(collection: string, retentionMs: number): Promise<number>;
  backfillExpiry(collection: string, retentionMs: number): Promise<number>;
};

export const RETENTION_BACKFILLS = ['PostImpression', 'PostEngagement'] as const;

export type RetentionMigrationReport = {
  readonly retentionMs: number;
  readonly indexes: Readonly<Record<string, IndexOutcome>>;
  readonly backfilled: Readonly<Record<(typeof RETENTION_BACKFILLS)[number], number>>;
};

export async function migrateSocialEventsRetention(
  store: RetentionStore,
  options: { readonly dryRun?: boolean } = {},
): Promise<RetentionMigrationReport> {
  const retentionMs = rawReadingRetentionMs();
  const backfilled: Record<string, number> = {};
  for (const collection of RETENTION_BACKFILLS) {
    backfilled[collection] = options.dryRun
      ? await store.countToBackfill(collection, retentionMs)
      : await store.backfillExpiry(collection, retentionMs);
  }
  const indexes = await ensureSocialEventIndexes(store, options);
  return { retentionMs, indexes, backfilled: backfilled as RetentionMigrationReport['backfilled'] };
}
