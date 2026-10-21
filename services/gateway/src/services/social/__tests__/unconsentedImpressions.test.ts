/**
 * @jest-environment node
 *
 * #10785 — une impression est NOMINATIVE quel que soit le statut d'analyse
 * (décision du porteur : « qui a vu » est une fonctionnalité de la
 * plateforme). Le statut ne gouverne que la MESURE rangée à côté : session
 * d'application sous consentement seulement, ni visibilité ni plateforme sous
 * refus (#10483). Les impressions réduites écrites entre 111c74768d et #10785
 * (empreinte `readerKey`, 8 jours) restent dédupliquées, remplacées, exportées
 * et effacées.
 */
import { describe, it, expect, jest } from '@jest/globals';
import { impressionRowOf } from '../impressionRows';
import { consumeImpliedImpressions, impressionImpliedByView } from '../viewImpressions';
import { eraseReadingTelemetryOf } from '../readingTelemetryErasure';
import { exportReadingActivity } from '../../../routes/me/export-reading';
import { accountReaderKeyOf } from '../../posts/readerKey';
import { matchesWhere, findManyIn } from '../../../__tests__/helpers/in-memory-table';
import { postCounterWritesOf } from '../../../__tests__/helpers/posts-counter-writes';

const POST = '507f1f77bcf86cd799439022';
const READER = '507f1f77bcf86cd799439011';
const OTHER = '507f1f77bcf86cd7994390cc';
const DAY_MS = 86_400_000;

type Row = Record<string, unknown>;

const impressionEvent = (over: Record<string, unknown> = {}) => ({
  type: 'impression' as const,
  postId: POST,
  source: 'feed',
  surface: 'feed',
  eventId: '0f0e0d0c-0b0a-4908-8706-050403020100',
  listing: { position: 3, rankingSource: 'following', feedRequestId: 'page-1' },
  visibility: { viewable: true, maxVisibleFraction: 0.9, visibleMs: 1500 },
  ...over,
});

const rowOf = (standing: 'granted' | 'not_granted' | 'denied') => impressionRowOf({
  event: impressionEvent() as never,
  userId: READER,
  standing,
  context: { platform: 'ios', appSessionId: 'app-1' } as never,
  receivedAt: new Date(),
});

function table(seed: Row[] = []) {
  const rows: Row[] = seed.map((row) => ({ ...row }));
  const select = (row: Row, fields?: Record<string, boolean>) =>
    fields ? Object.fromEntries(Object.keys(fields).filter((key) => key in row).map((key) => [key, row[key]])) : { ...row };
  const postImpression = {
    findFirst: jest.fn(async (args: { where: Row; select?: Record<string, boolean> }) => {
      const row = rows.find((candidate) => matchesWhere(candidate, args.where));
      return row ? select(row, args.select) : null;
    }),
    findMany: jest.fn(async (args: { where: Row; select?: Record<string, boolean> }) =>
      findManyIn(rows, args as never).map((row) => select(row, args.select))),
    createMany: jest.fn(async (args: { data: Row[] }) => {
      args.data.forEach((data, index) => rows.push({ id: `row-${rows.length + index}`, createdAt: new Date(), ...data }));
      return { count: args.data.length };
    }),
    deleteMany: jest.fn(async (args: { where: Row }) => {
      const gone = rows.filter((row) => matchesWhere(row, args.where));
      gone.forEach((row) => rows.splice(rows.indexOf(row), 1));
      return { count: gone.length };
    }),
  };
  const empty = { findMany: jest.fn(async () => []), deleteMany: jest.fn(async () => ({ count: 0 })) };
  const $runCommandRaw = jest.fn(async (_command: unknown) => ({ ok: 1 }));
  const prisma = { postImpression, postEngagement: empty, postView: empty, contentEvent: empty, $runCommandRaw };
  return {
    rows,
    prisma,
    impressionCredits: () => postCounterWritesOf($runCommandRaw).filter((write) => 'impressionCount' in write.data),
  };
}

const legacyReduced = (userId: string, over: Row = {}): Row => ({
  id: `reduite-${userId}`, postId: POST, readerKey: accountReaderKeyOf(userId), source: 'view',
  createdAt: new Date(Date.now() - 60_000), expiresAt: new Date(Date.now() + 8 * DAY_MS), ...over,
});

describe('#10785 — la ligne d’une impression garde son lecteur quel que soit le statut', () => {
  it.each(['not_granted', 'denied'] as const)('statut %s : le compte, la source, la surface, la clé de rejeu, 760 jours — jamais d’empreinte', (standing) => {
    const before = Date.now();
    const row = rowOf(standing) as Row;

    expect(row).toMatchObject({ postId: POST, userId: READER, source: 'feed', surface: 'feed' });
    expect(row).not.toHaveProperty('readerKey');
    expect(row).not.toHaveProperty('appSessionId');
    expect(Math.round(((row.expiresAt as Date).getTime() - before) / DAY_MS)).toBe(760);
  });

  it('statut denied : ni visibilité ni plateforme ; not_granted : la mesure sans la session d’application', () => {
    expect(rowOf('denied')).not.toHaveProperty('viewable');
    expect(rowOf('denied')).not.toHaveProperty('platform');
    expect(rowOf('not_granted')).toMatchObject({ viewable: true, platform: 'ios', position: 3 });
  });

  it('statut granted : régime inchangé — compte, mesure, contexte, 760 jours', () => {
    const before = Date.now();
    const row = rowOf('granted') as Row;

    expect(row).toMatchObject({
      postId: POST, userId: READER, source: 'feed', surface: 'feed', position: 3, rankingSource: 'following',
      feedRequestId: 'page-1', viewable: true, appSessionId: 'app-1', platform: 'ios',
    });
    expect(row).not.toHaveProperty('readerKey');
    expect(Math.round(((row.expiresAt as Date).getTime() - before) / DAY_MS)).toBe(760);
  });
});

describe('#10785 — une vue sans clé déduit une impression nominative, sans jamais compter deux fois', () => {
  it('l’impression déduite porte le lecteur, et une seconde vue n’en déduit pas d’autre', async () => {
    const { rows, prisma, impressionCredits } = table();

    await impressionImpliedByView(prisma as never, { postId: POST, userId: READER, surface: 'story' });
    await impressionImpliedByView(prisma as never, { postId: POST, userId: READER, surface: 'story' });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ postId: POST, userId: READER, source: 'view', surface: 'story' });
    expect(rows[0]).not.toHaveProperty('readerKey');
    expect(impressionCredits()).toHaveLength(1);
  });

  it('l’impression déduite vit la durée réglée par RAW_READING_RETENTION_DAYS (#10510)', async () => {
    const saved = process.env.RAW_READING_RETENTION_DAYS;
    process.env.RAW_READING_RETENTION_DAYS = '45';
    try {
      const { rows, prisma } = table();
      const before = Date.now();
      await impressionImpliedByView(prisma as never, { postId: POST, userId: READER });

      expect(Math.round(((rows[0].expiresAt as Date).getTime() - before) / DAY_MS)).toBe(45);
    } finally {
      if (saved === undefined) delete process.env.RAW_READING_RETENTION_DAYS;
      else process.env.RAW_READING_RETENTION_DAYS = saved;
    }
  });

  it('une impression réduite antérieure du même lecteur suffit : rien n’est déduit', async () => {
    const { rows, prisma, impressionCredits } = table([legacyReduced(READER)]);
    await impressionImpliedByView(prisma as never, { postId: POST, userId: READER });
    expect(rows).toHaveLength(1);
    expect(impressionCredits()).toEqual([]);
  });

  it('la première vraie impression remplace l’impression déduite du même lecteur — nominative ou réduite antérieure — pas celle d’un autre', async () => {
    const { rows, prisma } = table([legacyReduced(READER), legacyReduced(OTHER)]);
    await impressionImpliedByView(prisma as never, { postId: POST, userId: OTHER });

    const replaced = await consumeImpliedImpressions(prisma as never, READER, [POST]);

    expect(replaced.get(POST)).toBe(1);
    expect(rows.map((row) => row.readerKey)).toEqual([accountReaderKeyOf(OTHER)]);
  });
});

describe('#10785 — export et effacement : les lignes nominatives et les réduites antérieures du compte', () => {
  it('l’export rend les impressions du compte, l’effacement les retire, rien d’un autre lecteur', async () => {
    const { rows, prisma } = table([legacyReduced(READER, { postId: '507f1f77bcf86cd7994390ff' })]);
    await impressionImpliedByView(prisma as never, { postId: POST, userId: READER });
    await impressionImpliedByView(prisma as never, { postId: POST, userId: OTHER });

    const exported = await exportReadingActivity(prisma as never, READER, { limit: 10, offset: 0 } as never);
    expect(exported.impressions).toHaveLength(2);

    const erased = await eraseReadingTelemetryOf(prisma as never, READER);
    expect(erased.impressions).toBe(2);
    expect(rows.map((row) => row.userId)).toEqual([OTHER]);
  });
});
