/**
 * @jest-environment node
 *
 * Revue de conformité O7 (#10510) — toute ligne de télémétrie a une durée de
 * conservation, Y COMPRIS l'existant : la migration nommée pose les index et
 * donne `expiresAt = createdAt + durée` aux lignes `PostImpression` et
 * `PostEngagement` écrites avant elle. Décision porteur (commentaire
 * 6222116672) : la durée est celle de `RAW_READING_RETENTION_DAYS` (25 mois par
 * défaut), et les lignes déjà datées plus court (90 j) sont RALLONGÉES.
 * Rejouée, elle ne trouve plus rien.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { migrateSocialEventsRetention, type RetentionStore } from '../socialEventsRetentionMigration';
import type { ExistingIndex, IndexSpec } from '../socialEventIndexes';

type Row = { createdAt: Date; expiresAt?: Date };

const needsBackfill = (row: Row, retentionMs: number) =>
  row.expiresAt === undefined || row.expiresAt.getTime() < row.createdAt.getTime() + retentionMs;

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
    async countToBackfill(collection, retentionMs) {
      return (rows[collection] ?? []).filter((row) => needsBackfill(row, retentionMs)).length;
    },
    async backfillExpiry(collection, retentionMs) {
      const due = (rows[collection] ?? []).filter((row) => needsBackfill(row, retentionMs));
      due.forEach((row) => { row.expiresAt = new Date(row.createdAt.getTime() + retentionMs); });
      return due.length;
    },
  };
  return { store, indexes };
}

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const ENV = 'RAW_READING_RETENTION_DAYS';
const saved = process.env[ENV];
afterEach(() => {
  if (saved === undefined) delete process.env[ENV];
  else process.env[ENV] = saved;
});
beforeEach(() => { delete process.env[ENV]; });

describe('migrateSocialEventsRetention', () => {
  it('donne une échéance à chaque ligne existante (createdAt + 760 j par défaut) et pose les TTL', async () => {
    const rows = {
      PostImpression: [{ createdAt: day('2026-01-01') }, { createdAt: day('2026-10-01'), expiresAt: day('2029-01-01') }],
      PostEngagement: [{ createdAt: day('2026-05-01') }],
    };
    const { store, indexes } = memoryStore(rows);
    const report = await migrateSocialEventsRetention(store);

    expect(report.backfilled).toEqual({ PostImpression: 1, PostEngagement: 1 });
    expect(rows.PostImpression[0].expiresAt).toEqual(day('2028-01-31'));
    expect(rows.PostImpression[1].expiresAt).toEqual(day('2029-01-01'));
    expect(rows.PostEngagement[0].expiresAt).toEqual(day('2028-05-30'));
    expect((indexes.get('PostEngagement') ?? []).map((index) => index.name)).toContain('PostEngagement_expiresAt_ttl');
  });

  it('rallonge les lignes déjà datées à 90 j (staging) jusqu’à createdAt + durée', async () => {
    const rows = {
      PostImpression: [{ createdAt: day('2026-09-01'), expiresAt: day('2026-11-30') }],
      PostEngagement: [{ createdAt: day('2026-09-01'), expiresAt: day('2026-11-30') }],
    };
    const { store } = memoryStore(rows);
    const report = await migrateSocialEventsRetention(store);

    expect(report.backfilled).toEqual({ PostImpression: 1, PostEngagement: 1 });
    expect(rows.PostImpression[0].expiresAt).toEqual(day('2028-09-30'));
    expect(rows.PostEngagement[0].expiresAt).toEqual(day('2028-09-30'));
  });

  it('date avec la MÊME durée que les lignes neuves : RAW_READING_RETENTION_DAYS', async () => {
    process.env[ENV] = '100';
    const rows = { PostImpression: [{ createdAt: day('2026-01-01') }], PostEngagement: [] as Row[] };
    const { store } = memoryStore(rows);
    await migrateSocialEventsRetention(store);

    expect(rows.PostImpression[0].expiresAt).toEqual(day('2026-04-11'));
  });

  it('rejouée, ne trouve plus rien', async () => {
    const { store } = memoryStore({
      PostImpression: [{ createdAt: day('2026-01-01') }, { createdAt: day('2026-09-01'), expiresAt: day('2026-11-30') }],
      PostEngagement: [],
    });
    await migrateSocialEventsRetention(store);
    const second = await migrateSocialEventsRetention(store);

    expect(second.backfilled).toEqual({ PostImpression: 0, PostEngagement: 0 });
    expect(Object.values(second.indexes).every((outcome) => outcome === 'present')).toBe(true);
  });

  it('à blanc, compte sans rien écrire — lignes sans échéance ET lignes trop courtes', async () => {
    const rows = {
      PostImpression: [{ createdAt: day('2026-01-01') }, { createdAt: day('2026-09-01'), expiresAt: day('2026-11-30') }],
      PostEngagement: [] as Row[],
    };
    const { store, indexes } = memoryStore(rows);
    const report = await migrateSocialEventsRetention(store, { dryRun: true });

    expect(report.backfilled).toEqual({ PostImpression: 2, PostEngagement: 0 });
    expect(rows.PostImpression[0].expiresAt).toBeUndefined();
    expect(rows.PostImpression[1].expiresAt).toEqual(day('2026-11-30'));
    expect(indexes.size).toBe(0);
  });
});
