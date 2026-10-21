/**
 * Une session de lecture est NOMINATIVE quel que soit le statut d'analyse
 * (décision du porteur, #10785) : « qui a vu » est une fonctionnalité de la
 * plateforme, sa base est l'exécution du service. Hors `granted`, seule la
 * télémétrie sans fonctionnalité visible part : micro-actions (`actions`) et
 * échantillons de lecture (`watchSamples`). Le serveur décide du statut
 * (#10772). Les lignes réduites écrites entre 111c74768d et #10785 (empreinte
 * `readerKey`, 8 jours) restent lues, dédupliquées, exportées et effacées.
 *
 * Le double est une TABLE qui évalue ses `where` : un témoin de fusion ou de
 * déduplication contre un `mockResolvedValue` passerait avec une requête fausse.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { recordEngagementBatch } from '../services/posts/postReach';
import { accountReaderKeyOf, engagementSessionKeyOf } from '../services/posts/readerKey';
import { eraseReadingTelemetryOf } from '../services/social/readingTelemetryErasure';
import { exportReadingActivity } from '../routes/me/export-reading';
import { detachBehaviourOf } from '../services/social/consentWithdrawal';
import { matchesWhere, findManyIn } from './helpers/in-memory-table';
import { postCounterWritesOf } from './helpers/posts-counter-writes';

const POST = '507f1f77bcf86cd799439011';
const READER = '507f1f77bcf86cd7994390bb';
const OTHER_READER = '507f1f77bcf86cd7994390cc';
const SESSION = '11111111-1111-1111-1111-111111111111';
const DAY_MS = 86_400_000;

type Row = Record<string, unknown>;

const session = (over: Record<string, unknown> = {}) => ({
  sessionId: SESSION,
  postId: POST,
  contentType: 'REEL',
  surface: 'reels',
  startedAt: '2026-10-16T00:00:00.000Z',
  dwellMs: 0,
  completed: false,
  truncated: false,
  actions: [] as unknown[],
  watchSamples: [] as unknown[],
  ...over,
});

const MEASURE = {
  dwellMs: 9000, watchMs: 9000, mediaDurationMs: 9000, completed: true,
  actions: [{ type: 'like', atMs: 100 }], watchSamples: [{ positionMs: 8800, atMs: 8800 }],
};

const select = (row: Row, fields?: Record<string, boolean>): Row =>
  fields ? Object.fromEntries(Object.keys(fields).filter((key) => key in row).map((key) => [key, row[key]])) : { ...row };

const withoutUndefined = (data: Row): Row =>
  Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));

/** Le post du lot, et ce que le filtre d'audience du lecteur exige (`visibility: 'PUBLIC'` ici). */
type PostRow = { id: string; authorId: string; visibility: string; deletedAt?: Date };

function table(seed: Row[] = [], posts: PostRow[] = [{ id: POST, authorId: 'author', visibility: 'PUBLIC' }]) {
  const rows: Row[] = seed.map((row) => ({ ...row }));
  let next = rows.length;
  const insert = (data: Row) => {
    // `sessionId @unique` : une seconde ligne sous la même clé lève P2002, comme la base.
    if (rows.some((existing) => existing.sessionId === data.sessionId)) throw Object.assign(new Error('P2002'), { code: 'P2002' });
    const row = { id: `row-${(next += 1)}`, createdAt: new Date(), ...withoutUndefined(data) };
    rows.push(row);
    return row;
  };
  // `{ unset: true }` retire le champ du document (Prisma/MongoDB), `null` l'y laisse à null.
  const patch = (row: Row, data: Row) => {
    Object.entries(withoutUndefined(data)).forEach(([key, value]) => {
      if (value !== null && typeof value === 'object' && (value as Row).unset === true) delete row[key];
      else row[key] = value;
    });
    return row;
  };
  const postEngagement = {
    findUnique: jest.fn(async (args: { where: Row; select?: Record<string, boolean> }) => {
      const row = rows.find((candidate) => matchesWhere(candidate, args.where));
      return row ? select(row, args.select) : null;
    }),
    findFirst: jest.fn(async (args: { where: Row; select?: Record<string, boolean> }) => {
      const row = rows.find((candidate) => matchesWhere(candidate, args.where));
      return row ? select(row, args.select) : null;
    }),
    findMany: jest.fn(async (args: { where: Row; select?: Record<string, boolean>; orderBy?: never; take?: number; skip?: number }) =>
      findManyIn(rows, args).map((row) => select(row, args.select))),
    upsert: jest.fn(async (args: { where: Row; create: Row; update: Row }) => {
      const row = rows.find((candidate) => matchesWhere(candidate, args.where));
      return row ? patch(row, args.update) : insert(args.create);
    }),
    update: jest.fn(async (args: { where: Row; data: Row }) => {
      const row = rows.find((candidate) => matchesWhere(candidate, args.where));
      if (!row) throw new Error('P2025');
      return patch(row, args.data);
    }),
    deleteMany: jest.fn(async (args: { where: Row }) => {
      const gone = rows.filter((row) => matchesWhere(row, args.where));
      gone.forEach((row) => rows.splice(rows.indexOf(row), 1));
      return { count: gone.length };
    }),
  };
  const empty = { findMany: jest.fn(async () => []), deleteMany: jest.fn(async () => ({ count: 0 })) };
  const $runCommandRaw = jest.fn(async (_command: unknown) => ({ ok: 1 }));
  const prisma = {
    // `deletedAt: { isSet: false }` (NOT_DELETED) : un post supprimé PORTE la clé.
    post: {
      findFirst: jest.fn(async (args: { where: Row }) => {
        const { id, deletedAt: _deletedAt, ...audience } = args.where;
        const post = posts.find((candidate) => candidate.id === id && candidate.deletedAt === undefined && matchesWhere(candidate, audience));
        return post ? { id: post.id, authorId: post.authorId, type: 'REEL', expiresAt: null } : null;
      }),
    },
    postMention: { findUnique: jest.fn(async () => null) },
    postEngagement,
    postImpression: empty,
    postView: empty,
    contentEvent: empty,
    $runCommandRaw,
  };
  const deps = { prisma, visibilityFilter: async () => ({ visibility: 'PUBLIC' }) };
  return { rows, prisma, deps, counters: () => postCounterWritesOf($runCommandRaw).map((write) => write.data) };
}

/** Une ligne réduite écrite par 111c74768d (staging, 8 jours) : elle doit rester lue, dédupliquée, exportée, effacée. */
const legacyReducedRow = (over: Row = {}): Row => ({
  id: 'reduite',
  sessionId: engagementSessionKeyOf(SESSION),
  postId: POST,
  readerKey: accountReaderKeyOf(READER),
  creditedOpen: true,
  createdAt: new Date(Date.now() - 2000),
  expiresAt: new Date(Date.now() + 8 * DAY_MS),
  ...over,
});

describe('#10785 — une session sans consentement garde son lecteur (« qui a vu »), sans micro-actions ni échantillons', () => {
  it.each(['not_granted', 'denied'] as const)('statut %s : la ligne porte le compte, la mesure, les drapeaux crédités, 760 jours — ni actions, ni échantillons', async (standing) => {
    const { rows, deps, counters } = table();
    const before = Date.now();

    await recordEngagementBatch(deps as never, [session(MEASURE)], READER, standing);

    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row).toMatchObject({
      sessionId: SESSION, postId: POST, userId: READER, contentType: 'REEL', surface: 'reels',
      dwellMs: 9000, watchMs: 9000, mediaDurationMs: 9000, completed: true,
      actions: [], watchSamples: [], consent: standing,
      creditedOpen: true, creditedPlay: true, creditedQualified: true,
    });
    expect(row).not.toHaveProperty('readerKey');
    expect(Math.round(((row.expiresAt as Date).getTime() - before) / DAY_MS)).toBe(760);
    expect(counters()).toEqual([{ postOpenCount: { increment: 1 }, playCount: { increment: 1 }, qualifiedViewCount: { increment: 1 } }]);
  });

  it('le premier contact puis la mesure : une seule ligne nominative, l’ouverture une fois, la lecture et la vue qualifiée à la mesure', async () => {
    const { rows, deps, counters } = table();

    await recordEngagementBatch(deps as never, [session()], READER, 'not_granted');
    await recordEngagementBatch(deps as never, [session(MEASURE)], READER, 'not_granted');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sessionId: SESSION, userId: READER, dwellMs: 9000, actions: [], watchSamples: [] });
    expect(counters()).toEqual([
      { postOpenCount: { increment: 1 } },
      { playCount: { increment: 1 }, qualifiedViewCount: { increment: 1 } },
    ]);
  });

  it('un premier contact rejoué après la mesure ne crédite rien et ne fait pas reculer les drapeaux', async () => {
    const { rows, deps, counters } = table();

    await recordEngagementBatch(deps as never, [session(MEASURE)], READER, 'not_granted');
    await recordEngagementBatch(deps as never, [session()], READER, 'not_granted');

    expect(counters()).toHaveLength(1);
    expect(rows[0]).toMatchObject({ creditedOpen: true, creditedPlay: true, creditedQualified: true, dwellMs: 9000 });
  });

  it('une session neuve du même lecteur sur le même post dans les 10 s ne crédite rien, qu’elle suive une ligne nominative ou une ligne réduite antérieure', async () => {
    const nominative = table();
    await recordEngagementBatch(nominative.deps as never, [session(MEASURE)], READER, 'not_granted');
    nominative.rows[0].createdAt = new Date(Date.now() - 2000);
    await recordEngagementBatch(nominative.deps as never, [session({ ...MEASURE, sessionId: '22222222-2222-2222-2222-222222222222' })], READER, 'not_granted');
    expect(nominative.counters()).toHaveLength(1);

    const reduced = table([legacyReducedRow()]);
    await recordEngagementBatch(reduced.deps as never, [session({ ...MEASURE, sessionId: '33333333-3333-3333-3333-333333333333' })], READER, 'not_granted');
    expect(reduced.counters()).toEqual([]);
  });

  it('la session d’un AUTRE lecteur dans la fenêtre ne la rend pas muette', async () => {
    const { rows, deps, counters } = table();
    await recordEngagementBatch(deps as never, [session(MEASURE)], OTHER_READER, 'not_granted');
    rows[0].createdAt = new Date(Date.now() - 2000);
    await recordEngagementBatch(deps as never, [session({ ...MEASURE, sessionId: '33333333-3333-3333-3333-333333333333' })], READER, 'not_granted');
    expect(counters()).toHaveLength(2);
  });

  it('statut granted : régime inchangé — ligne nominative, mesure complète avec actions et échantillons, 760 jours', async () => {
    const { rows, deps, counters } = table();
    const before = Date.now();

    await recordEngagementBatch(deps as never, [session(MEASURE)], READER, 'granted');

    expect(rows[0]).toMatchObject({
      sessionId: SESSION, userId: READER, dwellMs: 9000, watchMs: 9000, completed: true, consent: 'granted',
      actions: MEASURE.actions, watchSamples: MEASURE.watchSamples,
    });
    expect(rows[0]).not.toHaveProperty('readerKey');
    expect(Math.round(((rows[0].expiresAt as Date).getTime() - before) / DAY_MS)).toBe(760);
    expect(counters()).toHaveLength(1);
  });

  it('une ligne consentie dont la mesure arrive après le retrait garde son lecteur, perd sa trace, et ne recrédite pas l’ouverture', async () => {
    const { rows, deps, counters } = table();
    await recordEngagementBatch(deps as never, [session({ actions: [{ type: 'like', atMs: 1 }] })], READER, 'granted');
    await recordEngagementBatch(deps as never, [session(MEASURE)], READER, 'denied');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ sessionId: SESSION, userId: READER, dwellMs: 9000, actions: [], watchSamples: [], consent: 'denied' });
    expect(rows[0]).not.toHaveProperty('readerKey');
    expect(counters()).toEqual([
      { postOpenCount: { increment: 1 } },
      { playCount: { increment: 1 }, qualifiedViewCount: { increment: 1 } },
    ]);
  });

  it('compatibilité : la mesure d’une session dont le premier contact a laissé une ligne réduite la rend nominative, sans recréditer l’ouverture', async () => {
    const { rows, deps, counters } = table([legacyReducedRow()]);

    await recordEngagementBatch(deps as never, [session(MEASURE)], READER, 'not_granted');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'reduite', sessionId: SESSION, userId: READER, dwellMs: 9000, creditedOpen: true, creditedPlay: true });
    expect(rows[0]).not.toHaveProperty('readerKey');
    expect(counters()).toEqual([{ playCount: { increment: 1 }, qualifiedViewCount: { increment: 1 } }]);
  });

  it('l’export rend les lignes du compte (nominatives et réduites antérieures), l’effacement les retire, rien d’un autre lecteur', async () => {
    const { rows, prisma, deps } = table([legacyReducedRow({ sessionId: 'f'.repeat(64) })]);
    await recordEngagementBatch(deps as never, [session(MEASURE)], READER, 'not_granted');
    await recordEngagementBatch(deps as never, [session({ ...MEASURE, sessionId: '44444444-4444-4444-4444-444444444444' })], OTHER_READER, 'not_granted');

    const exported = await exportReadingActivity(prisma as never, READER, { limit: 10, offset: 0 } as never);
    expect(exported.engagements).toHaveLength(2);
    expect(exported.engagements).toEqual(expect.arrayContaining([
      expect.objectContaining({ postId: POST, dwellMs: 9000 }),
      expect.objectContaining({ postId: POST, creditedOpen: true }),
    ]));

    const erased = await eraseReadingTelemetryOf(prisma as never, READER);
    expect(erased.engagements).toBe(2);
    expect(rows.map((row) => row.userId)).toEqual([OTHER_READER]);
  });
});

describe('#10772 — le refus s’applique côté passerelle, quel que soit le client', () => {
  it('un client qui déclare consent « denied » sous un statut serveur granted laisse une ligne sans trace', async () => {
    const { rows, deps } = table();
    await recordEngagementBatch(deps as never, [session({ ...MEASURE, consent: 'denied' })], READER, 'granted');
    expect(rows[0]).toMatchObject({ userId: READER, actions: [], watchSamples: [], consent: 'denied' });
  });

  it('le consentement rangé est celui que la passerelle a établi, jamais la valeur déclarée par le client', async () => {
    const { rows, deps } = table();
    await recordEngagementBatch(deps as never, [session({ ...MEASURE, consent: 'granted-by-me' })], READER, 'granted');
    expect(rows[0].consent).toBe('granted');
    await recordEngagementBatch(deps as never, [session({ ...MEASURE, sessionId: '55555555-5555-5555-5555-555555555555', consent: 'granted' })], READER, 'not_granted');
    expect(rows[1]).toMatchObject({ consent: 'not_granted', actions: [], watchSamples: [] });
  });

  it('sans statut fourni, la lecture la plus restrictive s’applique : aucune trace', async () => {
    const { rows, deps } = table();
    await recordEngagementBatch(deps as never, [session(MEASURE)], READER);
    expect(rows[0]).toMatchObject({ userId: READER, actions: [], watchSamples: [] });
  });

  it('le retrait de l’analyse vide les traces déjà rangées des sessions du compte', async () => {
    const { prisma } = table();
    await detachBehaviourOf(prisma as never, READER);
    const commands = prisma.$runCommandRaw.mock.calls.map(([command]) => command as Row);
    expect(commands).toContainEqual({
      update: 'PostEngagement',
      updates: [{ q: { userId: { $oid: READER } }, u: { $set: { actions: [], watchSamples: [] }, $unset: { consent: '' } }, multi: true }],
    });
  });
});

describe('une session ne crédite qu’un post que le lecteur PEUT voir et qui n’est pas supprimé (revue de sécurité de #10764)', () => {
  const HIDDEN = '507f1f77bcf86cd7994390dd';
  const GONE = '507f1f77bcf86cd7994390ee';
  const posts = [
    { id: HIDDEN, authorId: 'author', visibility: 'PRIVATE' },
    { id: GONE, authorId: 'author', visibility: 'PUBLIC', deletedAt: new Date() },
  ];

  it.each([['hors audience', HIDDEN], ['supprimé', GONE]])('un post %s : ni ligne, ni crédit, ni compté dans la réponse — premier contact comme mesure', async (_label, postId) => {
    for (const standing of ['granted', 'not_granted'] as const) {
      const { rows, deps, counters } = table([], posts);
      const recorded = await recordEngagementBatch(deps as never, [session({ postId }), session({ ...MEASURE, postId })], READER, standing);
      expect(recorded).toBe(0);
      expect(rows).toEqual([]);
      expect(counters()).toEqual([]);
    }
  });
});

describe('une clé de session connue ne donne aucune prise sur la session d’un AUTRE lecteur (revue adversariale #10771)', () => {
  it.each(['granted', 'not_granted'] as const)('session de l’autre sous statut %s : sa ligne reste intacte, rien n’est crédité', async (standing) => {
    const { rows, deps, counters } = table();
    await recordEngagementBatch(deps as never, [session()], OTHER_READER, standing);
    const before = JSON.stringify(rows);

    const recorded = await recordEngagementBatch(deps as never, [session(MEASURE)], READER, standing);

    expect(recorded).toBe(0);
    expect(JSON.stringify(rows)).toBe(before);
    expect(counters()).toHaveLength(1);
  });
});
