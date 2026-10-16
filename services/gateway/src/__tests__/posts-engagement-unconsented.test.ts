/**
 * Une session de lecture SANS consentement d'analyse ne laisse que ce que le
 * compteur exige (#10771, #10772 — analyse de conformité #10770).
 *
 * Sous un statut autre que `granted`, la ligne `PostEngagement` ne garde que
 * l'empreinte de la session, le post, l'empreinte du lecteur, l'heure de
 * réception, les trois compteurs déjà crédités et une fin de conservation à
 * 8 jours. Les durées servent au calcul à la réception, puis sont jetées. La
 * fusion premier contact → mesure et la déduplication à 10 s marchent sur
 * cette forme ; l'export et l'effacement la retrouvent par l'empreinte.
 *
 * Le double est une TABLE qui évalue ses `where` : un témoin de fusion ou de
 * déduplication contre un `mockResolvedValue` passerait avec une requête fausse.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { recordEngagementBatch } from '../services/posts/postReach';
import { accountReaderKeyOf } from '../services/posts/readerKey';
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

const REDUCED_KEYS = ['createdAt', 'creditedOpen', 'creditedPlay', 'creditedQualified', 'expiresAt', 'id', 'postId', 'readerKey', 'sessionId'];
const HEX64 = /^[0-9a-f]{64}$/;

describe('#10771 — une session sans consentement ne laisse que trois drapeaux et une empreinte, 8 jours', () => {
  it.each(['not_granted', 'denied'] as const)('statut %s : la ligne écrite ne porte ni compte, ni durée, ni surface, ni trace', async (standing) => {
    const { rows, prisma, deps, counters } = table();
    const before = Date.now();

    await recordEngagementBatch(deps as never, [session(MEASURE)], READER, standing);

    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(Object.keys(row).sort()).toEqual(REDUCED_KEYS);
    expect(row.sessionId).toMatch(HEX64);
    expect(row.sessionId).not.toBe(SESSION);
    expect(row.readerKey).toBe(accountReaderKeyOf(READER));
    expect(JSON.stringify(row)).not.toContain(READER);
    expect(row).toMatchObject({ postId: POST, creditedOpen: true, creditedPlay: true, creditedQualified: true });
    expect(Math.round(((row.expiresAt as Date).getTime() - before) / DAY_MS)).toBe(8);
    expect(counters()).toEqual([{ postOpenCount: { increment: 1 }, playCount: { increment: 1 }, qualifiedViewCount: { increment: 1 } }]);
  });

  it('le premier contact puis la mesure : une seule ligne réduite, l’ouverture une fois, la lecture et la vue qualifiée à la mesure', async () => {
    const { rows, prisma, deps, counters } = table();

    await recordEngagementBatch(deps as never, [session()], READER, 'not_granted');
    await recordEngagementBatch(deps as never, [session(MEASURE)], READER, 'not_granted');

    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(REDUCED_KEYS);
    expect(counters()).toEqual([
      { postOpenCount: { increment: 1 } },
      { playCount: { increment: 1 }, qualifiedViewCount: { increment: 1 } },
    ]);
  });

  it('un premier contact rejoué après la mesure ne crédite rien et ne fait pas reculer les drapeaux', async () => {
    const { rows, prisma, deps, counters } = table();

    await recordEngagementBatch(deps as never, [session(MEASURE)], READER, 'not_granted');
    await recordEngagementBatch(deps as never, [session()], READER, 'not_granted');

    expect(counters()).toHaveLength(1);
    expect(rows[0]).toMatchObject({ creditedOpen: true, creditedPlay: true, creditedQualified: true });
  });

  it('une session neuve du même lecteur sur le même post dans les 10 s ne crédite rien, qu’elle suive une ligne réduite ou une ligne nominative', async () => {
    const reduced = table();
    await recordEngagementBatch(reduced.deps as never, [session(MEASURE)], READER, 'not_granted');
    reduced.rows[0].createdAt = new Date(Date.now() - 2000);
    await recordEngagementBatch(reduced.deps as never, [session({ ...MEASURE, sessionId: '22222222-2222-2222-2222-222222222222' })], READER, 'not_granted');
    expect(reduced.counters()).toHaveLength(1);

    const legacy = table([{ id: 'legacy', sessionId: 'ancienne', postId: POST, userId: READER, createdAt: new Date(Date.now() - 2000), dwellMs: 1 }]);
    await recordEngagementBatch(legacy.deps as never, [session(MEASURE)], READER, 'not_granted');
    expect(legacy.counters()).toEqual([]);
  });

  it('la session d’un AUTRE lecteur dans la fenêtre ne la rend pas muette', async () => {
    const { rows, prisma, deps, counters } = table();
    await recordEngagementBatch(deps as never, [session(MEASURE)], OTHER_READER, 'not_granted');
    rows[0].createdAt = new Date(Date.now() - 2000);
    await recordEngagementBatch(deps as never, [session({ ...MEASURE, sessionId: '33333333-3333-3333-3333-333333333333' })], READER, 'not_granted');
    expect(counters()).toHaveLength(2);
  });

  it('statut granted : régime inchangé — ligne nominative, mesure complète, 90 jours', async () => {
    const { rows, prisma, deps, counters } = table();
    const before = Date.now();

    await recordEngagementBatch(deps as never, [session(MEASURE)], READER, 'granted');

    expect(rows[0]).toMatchObject({ sessionId: SESSION, userId: READER, dwellMs: 9000, watchMs: 9000, completed: true, actions: MEASURE.actions, watchSamples: MEASURE.watchSamples });
    expect(rows[0]).not.toHaveProperty('readerKey');
    expect(Math.round(((rows[0].expiresAt as Date).getTime() - before) / DAY_MS)).toBe(90);
    expect(counters()).toHaveLength(1);
  });

  it('une ligne nominative dont la mesure arrive après le retrait est réduite, et ne recrédite pas l’ouverture', async () => {
    const { rows, prisma, deps, counters } = table();
    await recordEngagementBatch(deps as never, [session()], READER, 'granted');
    await recordEngagementBatch(deps as never, [session(MEASURE)], READER, 'denied');

    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).filter((key) => rows[0][key] !== null && rows[0][key] !== undefined).sort()).toEqual(REDUCED_KEYS);
    expect(counters()).toEqual([
      { postOpenCount: { increment: 1 } },
      { playCount: { increment: 1 }, qualifiedViewCount: { increment: 1 } },
    ]);
  });

  it('une ligne réduite ne redevient pas nominative quand le consentement arrive en cours de session', async () => {
    const { rows, prisma, deps, counters } = table();
    await recordEngagementBatch(deps as never, [session()], READER, 'not_granted');
    await recordEngagementBatch(deps as never, [session(MEASURE)], READER, 'granted');

    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]).sort()).toEqual(REDUCED_KEYS);
    expect(counters()).toHaveLength(2);
  });

  it('l’export retrouve les lignes réduites du compte, l’effacement les retire, rien d’un autre lecteur', async () => {
    const { rows, prisma, deps } = table();
    await recordEngagementBatch(deps as never, [session(MEASURE)], READER, 'not_granted');
    await recordEngagementBatch(deps as never, [session({ ...MEASURE, sessionId: '44444444-4444-4444-4444-444444444444' })], OTHER_READER, 'not_granted');

    const exported = await exportReadingActivity(prisma as never, READER, { limit: 10, offset: 0 } as never);
    expect(exported.engagements).toEqual([expect.objectContaining({ postId: POST, creditedOpen: true, creditedPlay: true, creditedQualified: true })]);

    const erased = await eraseReadingTelemetryOf(prisma as never, READER);
    expect(erased.engagements).toBe(1);
    expect(rows.map((row) => row.readerKey)).toEqual([accountReaderKeyOf(OTHER_READER)]);
  });
});

describe('#10772 — le refus s’applique côté passerelle, quel que soit le client', () => {
  it('un client qui déclare consent « denied » sous un statut serveur granted laisse une ligne réduite', async () => {
    const { rows, prisma, deps } = table();
    await recordEngagementBatch(deps as never, [session({ ...MEASURE, consent: 'denied' })], READER, 'granted');
    expect(Object.keys(rows[0]).sort()).toEqual(REDUCED_KEYS);
  });

  it('le consentement rangé est celui que la passerelle a établi, jamais la valeur déclarée par le client', async () => {
    const { rows, prisma, deps } = table();
    await recordEngagementBatch(deps as never, [session({ ...MEASURE, consent: 'granted-by-me' })], READER, 'granted');
    expect(rows[0].consent).toBe('granted');
  });

  it('sans statut fourni, la lecture la plus restrictive s’applique : aucune trace', async () => {
    const { rows, prisma, deps } = table();
    await recordEngagementBatch(deps as never, [session(MEASURE)], READER);
    expect(Object.keys(rows[0]).sort()).toEqual(REDUCED_KEYS);
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
