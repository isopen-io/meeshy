/**
 * @jest-environment node
 *
 * #10773 — une impression sans consentement d'analyse ne garde que ce que la
 * déduplication exige : le post, l'EMPREINTE du lecteur (jamais son compte),
 * la source (une impression déduite d'une vue se remplace), la clé de rejeu,
 * et 8 jours. La déduction « une vue implique son impression » (#10732) et son
 * remplacement par la première vraie impression marchent sur cette forme ;
 * l'export et l'effacement la retrouvent par l'empreinte.
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

describe('#10773 — la ligne d’une impression sans consentement', () => {
  it.each(['not_granted', 'denied'] as const)('statut %s : ni compte, ni rang, ni visibilité, ni plateforme — l’empreinte, la source, la clé de rejeu, 8 jours', (standing) => {
    const before = Date.now();
    const row = rowOf(standing) as Row;

    expect(Object.keys(row).sort()).toEqual(['eventKey', 'expiresAt', 'postId', 'readerKey', 'source']);
    expect(row.readerKey).toBe(accountReaderKeyOf(READER));
    expect(JSON.stringify(row)).not.toContain(READER);
    expect(Math.round(((row.expiresAt as Date).getTime() - before) / DAY_MS)).toBe(8);
  });

  it('statut granted : régime inchangé — compte, mesure, contexte, 90 jours', () => {
    const before = Date.now();
    const row = rowOf('granted') as Row;

    expect(row).toMatchObject({
      postId: POST, userId: READER, source: 'feed', surface: 'feed', position: 3, rankingSource: 'following',
      feedRequestId: 'page-1', viewable: true, appSessionId: 'app-1', platform: 'ios',
    });
    expect(row).not.toHaveProperty('readerKey');
    expect(Math.round(((row.expiresAt as Date).getTime() - before) / DAY_MS)).toBe(90);
  });
});

describe('#10773 — une vue sans clé déduit une impression réduite, sans jamais compter deux fois', () => {
  it('sans consentement : l’impression déduite est réduite, et une seconde vue n’en déduit pas d’autre', async () => {
    const { rows, prisma, impressionCredits } = table();

    await impressionImpliedByView(prisma as never, { postId: POST, userId: READER, surface: 'story', standing: 'not_granted' });
    await impressionImpliedByView(prisma as never, { postId: POST, userId: READER, surface: 'story', standing: 'not_granted' });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ postId: POST, readerKey: accountReaderKeyOf(READER), source: 'view' });
    expect(rows[0]).not.toHaveProperty('userId');
    expect(rows[0]).not.toHaveProperty('surface');
    expect(impressionCredits()).toHaveLength(1);
  });

  it('une impression nominative antérieure du même lecteur suffit : rien n’est déduit', async () => {
    const { rows, prisma, impressionCredits } = table([{ id: 'ancienne', postId: POST, userId: READER, source: 'feed' }]);
    await impressionImpliedByView(prisma as never, { postId: POST, userId: READER, standing: 'not_granted' });
    expect(rows).toHaveLength(1);
    expect(impressionCredits()).toEqual([]);
  });

  it('avec consentement : l’impression déduite reste nominative', async () => {
    const { rows, prisma } = table();
    await impressionImpliedByView(prisma as never, { postId: POST, userId: READER, surface: 'story', standing: 'granted' });
    expect(rows[0]).toMatchObject({ postId: POST, userId: READER, source: 'view', surface: 'story' });
  });

  it('la première vraie impression remplace l’impression déduite réduite du même lecteur — pas celle d’un autre', async () => {
    const { rows, prisma } = table();
    await impressionImpliedByView(prisma as never, { postId: POST, userId: READER, standing: 'not_granted' });
    await impressionImpliedByView(prisma as never, { postId: POST, userId: OTHER, standing: 'not_granted' });

    const replaced = await consumeImpliedImpressions(prisma as never, READER, [POST]);

    expect(replaced.get(POST)).toBe(1);
    expect(rows.map((row) => row.readerKey)).toEqual([accountReaderKeyOf(OTHER)]);
  });
});

describe('#10773 — export et effacement retrouvent les impressions réduites par l’empreinte', () => {
  it('l’export rend l’impression réduite du compte, l’effacement la retire, rien d’un autre lecteur', async () => {
    const { rows, prisma } = table();
    await impressionImpliedByView(prisma as never, { postId: POST, userId: READER, standing: 'not_granted' });
    await impressionImpliedByView(prisma as never, { postId: POST, userId: OTHER, standing: 'not_granted' });

    const exported = await exportReadingActivity(prisma as never, READER, { limit: 10, offset: 0 } as never);
    expect(exported.impressions).toEqual([expect.objectContaining({ postId: POST, source: 'view' })]);

    const erased = await eraseReadingTelemetryOf(prisma as never, READER);
    expect(erased.impressions).toBe(1);
    expect(rows.map((row) => row.readerKey)).toEqual([accountReaderKeyOf(OTHER)]);
  });
});
