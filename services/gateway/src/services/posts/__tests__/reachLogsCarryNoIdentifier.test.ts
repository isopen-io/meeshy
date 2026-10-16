/**
 * @jest-environment node
 *
 * #10782 — un journal de la télémétrie de lecture ne porte aucun identifiant
 * de lecteur. Le message d'une erreur Prisma recopie les arguments de la
 * requête (`userId`, `readerKey`) : le journal n'en garde que le NOM et le
 * CODE de l'erreur.
 */
import { describe, it, expect, jest } from '@jest/globals';

const warn = jest.fn();
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn, error: jest.fn(), debug: jest.fn() }),
    warn,
    error: jest.fn(),
    info: jest.fn(),
  },
}));

import { recordEngagementBatch, recordView } from '../postReach';
import { recordAnonymousView } from '../anonymousReach';
import { creditEngagedReaderView } from '../postViewCredit';
import { releaseCountingReceipts } from '../../social/countingReplays';

const USER = '507f1f77bcf86cd799439099';
const READER_KEY = 'anon-reader-key-5f1c';
const POST = '507f1f77bcf86cd799439011';

const prismaError = (identifier: string) =>
  Object.assign(new Error(`Invalid \`prisma.post.findFirst()\` invocation: { where: { userId: "${identifier}", readerKey: "${identifier}" } }`), {
    name: 'PrismaClientKnownRequestError',
    code: 'P2010',
    // P2010 (requête brute en échec) recopie le message de la base dans `meta`.
    meta: { code: '11000', message: `E11000 duplicate key { eventKey: "${identifier}" }` },
  });

const failing = (identifier: string) => jest.fn(async () => { throw prismaError(identifier); });

const loggedText = () => JSON.stringify(warn.mock.calls);

const expectNoIdentifier = (identifier: string) => {
  expect(warn).toHaveBeenCalled();
  expect(loggedText()).not.toContain(identifier);
  expect(loggedText()).toContain('PrismaClientKnownRequestError');
  expect(loggedText()).toContain('P2010');
};

const reachDeps = () => ({
  prisma: { post: { findFirst: failing(USER) } },
  visibilityFilter: async () => ({}),
});

describe('#10782 — les journaux de lecture ne recopient pas le message Prisma', () => {
  it('recordEngagementBatch : nom et code, jamais le userId', async () => {
    warn.mockClear();
    const session = {
      sessionId: '11111111-1111-1111-1111-111111111111', postId: POST, contentType: 'POST', surface: 'detail',
      startedAt: '2026-06-14T00:00:00.000Z', dwellMs: 4000,
    };
    await recordEngagementBatch(reachDeps() as never, [session], USER);
    expectNoIdentifier(USER);
  });

  it('recordView : nom et code, jamais le userId', async () => {
    warn.mockClear();
    await recordView(reachDeps() as never, POST, USER);
    expectNoIdentifier(USER);
  });

  it('recordAnonymousView : nom et code, jamais la clé de lecteur', async () => {
    warn.mockClear();
    await recordAnonymousView({ post: { findMany: failing(READER_KEY) } } as never, { postId: POST, readerKey: READER_KEY });
    expectNoIdentifier(READER_KEY);
  });

  it('creditEngagedReaderView : nom et code, jamais le userId', async () => {
    warn.mockClear();
    await creditEngagedReaderView({ post: { findFirst: failing(USER) } } as never, { postId: POST, userId: USER });
    expectNoIdentifier(USER);
  });

  it('releaseCountingReceipts : nom et code, jamais la clé d’événement', async () => {
    warn.mockClear();
    await releaseCountingReceipts({ $runCommandRaw: failing(READER_KEY) } as never, [READER_KEY]);
    expectNoIdentifier(READER_KEY);
  });
});
