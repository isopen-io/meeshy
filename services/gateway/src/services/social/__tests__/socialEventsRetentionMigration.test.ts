/**
 * @jest-environment node
 *
 * Revue de conformité O7 (#10510) — toute ligne de télémétrie a une durée de
 * conservation, Y COMPRIS l'existant : la migration nommée pose les index et
 * donne `expiresAt = createdAt + 90 j` aux lignes `PostImpression` et
 * `PostEngagement` écrites avant elle. Rejouée, elle ne trouve plus rien.
 */
import { describe, it, expect } from '@jest/globals';
import { migrateSocialEventsRetention, type RetentionStore } from '../socialEventsRetentionMigration';
import type { ExistingIndex, IndexSpec } from '../socialEventIndexes';

type Row = { createdAt: Date; expiresAt?: Date };

function memoryStore(rows: Record<string, Row[]>) {
  const indexes = new Map<string, ExistingIndex[]>();
  const store: RetentionStore = {
    async list(collection) { return indexes.get(collection) ?? []; },
    async create(spec: IndexSpec) {
      const { collection, ...index } = spec;
      indexes.set(collection, [...(indexes.get(collection) ?? []), index]);
    },
    async drop(collection, name) {
      indexes.set(collection, (indexes.get(collection) ?? []).filter((index) => index.name !== name));
    },
    async countWithoutExpiry(collection) {
      return (rows[collection] ?? []).filter((row) => row.expiresAt === undefined).length;
    },
    async backfillExpiry(collection, retentionMs) {
      const missing = (rows[collection] ?? []).filter((row) => row.expiresAt === undefined);
      missing.forEach((row) => { row.expiresAt = new Date(row.createdAt.getTime() + retentionMs); });
      return missing.length;
    },
  };
  return { store, indexes };
}

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('migrateSocialEventsRetention', () => {
  it('donne une échéance à chaque ligne existante (createdAt + 90 j) et pose les TTL', async () => {
    const rows = {
      PostImpression: [{ createdAt: day('2026-01-01') }, { createdAt: day('2026-10-01'), expiresAt: day('2026-12-30') }],
      PostEngagement: [{ createdAt: day('2026-05-01') }],
    };
    const { store, indexes } = memoryStore(rows);
    const report = await migrateSocialEventsRetention(store);

    expect(report.backfilled).toEqual({ PostImpression: 1, PostEngagement: 1 });
    expect(rows.PostImpression[0].expiresAt).toEqual(day('2026-04-01'));
    expect(rows.PostImpression[1].expiresAt).toEqual(day('2026-12-30'));
    expect(rows.PostEngagement[0].expiresAt).toEqual(day('2026-07-30'));
    expect((indexes.get('PostEngagement') ?? []).map((index) => index.name)).toContain('PostEngagement_expiresAt_ttl');
  });

  it('rejouée, ne trouve plus rien', async () => {
    const { store } = memoryStore({ PostImpression: [{ createdAt: day('2026-01-01') }], PostEngagement: [] });
    await migrateSocialEventsRetention(store);
    const second = await migrateSocialEventsRetention(store);

    expect(second.backfilled).toEqual({ PostImpression: 0, PostEngagement: 0 });
    expect(Object.values(second.indexes).every((outcome) => outcome === 'present')).toBe(true);
  });

  it('à blanc, compte sans rien écrire', async () => {
    const rows = { PostImpression: [{ createdAt: day('2026-01-01') }], PostEngagement: [] as Row[] };
    const { store, indexes } = memoryStore(rows);
    const report = await migrateSocialEventsRetention(store, { dryRun: true });

    expect(report.backfilled).toEqual({ PostImpression: 1, PostEngagement: 0 });
    expect(rows.PostImpression[0].expiresAt).toBeUndefined();
    expect(indexes.size).toBe(0);
  });
});
