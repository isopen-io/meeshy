/**
 * #16421 — « Dis-lui salut » sous les lignes d'arrivées écrites AVANT que le
 * pseudo y voyage (b8915500bd). La passerelle complète le pseudo À LA LECTURE,
 * en une requête par page, sans jamais réécrire la base.
 *
 * Le double Prisma répond depuis une table en mémoire et HONORE `where.id.in` :
 * un témoin qui passerait au vert sur un filtre ignoré n'attesterait rien.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { withNoticeUsernames } from '../noticeUsernames';

const AICHA = '507f1f77bcf86cd7994390a1';
const TOM = '507f1f77bcf86cd7994390a2';
const GUEST = '507f1f77bcf86cd7994390a3';
const SHADOW = '507f1f77bcf86cd7994390a4';
const LINA = '507f1f77bcf86cd7994390a5';

type ParticipantRow = {
  readonly id: string;
  readonly type: string;
  readonly user: { readonly username: string } | null;
};

const PARTICIPANTS: readonly ParticipantRow[] = [
  { id: AICHA, type: 'user', user: { username: 'aicha' } },
  { id: TOM, type: 'user', user: { username: 'tom' } },
  { id: GUEST, type: 'anonymous', user: null },
  { id: SHADOW, type: 'user', user: { username: 'ano_7f3a' } },
  { id: LINA, type: 'user', user: { username: 'lina' } },
];

type FindManyArgs = {
  readonly where: { readonly id: { readonly in: readonly string[] } };
  readonly select: unknown;
};

const prismaDouble = (options: { readonly fails?: boolean } = {}) => {
  const calls: FindManyArgs[] = [];
  const prisma = {
    participant: {
      findMany: async (args: FindManyArgs) => {
        calls.push(args);
        if (options.fails) throw new Error('mongo down');
        return PARTICIPANTS.filter((row) => args.where.id.in.includes(row.id));
      },
    },
  } as unknown as Pick<PrismaClient, 'participant'>;
  return { prisma, calls };
};

const arrivalsLine = (id: string, arrivals: readonly Record<string, unknown>[]) => ({
  id,
  messageSource: 'system',
  content: 'Aïcha et Tom viennent d’arriver',
  metadata: {
    kind: 'members-arrived',
    arrivals,
    count: arrivals.length,
    windowStartedAt: '2026-11-04T10:00:00.000Z',
  },
});

const joinNotice = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  messageSource: 'system',
  content: 'Lina a rejoint la conversation',
  metadata: {
    kind: 'member-joined',
    participantId: LINA,
    displayName: 'Lina',
    isAnonymous: false,
    viaShareLink: false,
    ...overrides,
  },
});

const arrivalsOf = (row: { metadata: unknown }) =>
  (row.metadata as { arrivals: ReadonlyArray<Record<string, unknown>> }).arrivals;

describe('withNoticeUsernames', () => {
  it('serves the account username to arrivals written before the username travelled', async () => {
    const { prisma } = prismaDouble();
    const [served] = await withNoticeUsernames(prisma, [
      arrivalsLine('m1', [
        { participantId: AICHA, displayName: 'Aïcha' },
        { participantId: TOM, displayName: 'Tom' },
      ]),
    ]);

    expect(arrivalsOf(served)).toEqual([
      { participantId: AICHA, displayName: 'Aïcha', username: 'aicha' },
      { participantId: TOM, displayName: 'Tom', username: 'tom' },
    ]);
  });

  it('leaves an anonymous arrival without a username', async () => {
    const { prisma } = prismaDouble();
    const [served] = await withNoticeUsernames(prisma, [
      arrivalsLine('m1', [
        { participantId: GUEST, displayName: 'Visiteur' },
        { participantId: AICHA, displayName: 'Aïcha' },
      ]),
    ]);

    expect(arrivalsOf(served)).toEqual([
      { participantId: GUEST, displayName: 'Visiteur' },
      { participantId: AICHA, displayName: 'Aïcha', username: 'aicha' },
    ]);
  });

  it('never serves an ano_ handle', async () => {
    const { prisma } = prismaDouble();
    const [served] = await withNoticeUsernames(prisma, [
      arrivalsLine('m1', [{ participantId: SHADOW, displayName: 'Ombre' }]),
    ]);

    expect(arrivalsOf(served)).toEqual([{ participantId: SHADOW, displayName: 'Ombre' }]);
  });

  it('keeps a stored username and asks nothing when no arrival lacks one', async () => {
    const { prisma, calls } = prismaDouble();
    const line = arrivalsLine('m1', [{ participantId: AICHA, displayName: 'Aïcha', username: 'aicha_stored' }]);
    const [served] = await withNoticeUsernames(prisma, [line, { id: 'm2', metadata: null }]);

    expect(calls).toHaveLength(0);
    expect(served).toBe(line);
  });

  it('reads every missing username of the page in ONE query, deduplicated', async () => {
    const { prisma, calls } = prismaDouble();
    const served = await withNoticeUsernames(prisma, [
      arrivalsLine('m1', [{ participantId: AICHA, displayName: 'Aïcha' }]),
      { id: 'm2', metadata: { location: { lat: 1, lng: 2 } } },
      arrivalsLine('m3', [
        { participantId: TOM, displayName: 'Tom' },
        { participantId: AICHA, displayName: 'Aïcha' },
      ]),
      joinNotice('m4'),
    ]);

    expect(calls).toHaveLength(1);
    expect([...calls[0].where.id.in].sort()).toEqual([AICHA, LINA, TOM].sort());
    expect(calls[0].select).toEqual({ id: true, type: true, user: { select: { username: true } } });
    expect(arrivalsOf(served[2]).map((arrival) => arrival.username)).toEqual(['tom', 'aicha']);
  });

  it('completes a join notice of a registered member written without its username', async () => {
    const { prisma } = prismaDouble();
    const [served] = await withNoticeUsernames(prisma, [joinNotice('m1')]);

    expect((served.metadata as Record<string, unknown>).username).toBe('lina');
  });

  it('does not look up an anonymous join notice', async () => {
    const { prisma, calls } = prismaDouble();
    const notice = joinNotice('m1', { participantId: GUEST, isAnonymous: true });
    const [served] = await withNoticeUsernames(prisma, [notice]);

    expect(calls).toHaveLength(0);
    expect(served).toBe(notice);
  });

  it('keeps every other row and every other metadata field as served', async () => {
    const { prisma } = prismaDouble();
    const plain = { id: 'm0', metadata: { sticker: { id: 's' } } };
    const line = {
      ...arrivalsLine('m1', [{ participantId: AICHA, displayName: 'Aïcha', extra: 1 }]),
      sender: { id: AICHA },
    };
    const served = await withNoticeUsernames(prisma, [plain, line]);

    expect(served[0]).toBe(plain);
    expect(served[1]).toMatchObject({ id: 'm1', sender: { id: AICHA }, content: line.content });
    expect(served[1].metadata).toMatchObject({ kind: 'members-arrived', count: 1, windowStartedAt: '2026-11-04T10:00:00.000Z' });
    expect(arrivalsOf(served[1])).toEqual([{ participantId: AICHA, displayName: 'Aïcha', extra: 1, username: 'aicha' }]);
    expect(arrivalsOf(line)).toEqual([{ participantId: AICHA, displayName: 'Aïcha', extra: 1 }]);
  });

  it('serves the page unchanged when the lookup fails', async () => {
    const { prisma } = prismaDouble({ fails: true });
    const line = arrivalsLine('m1', [{ participantId: AICHA, displayName: 'Aïcha' }]);
    const served = await withNoticeUsernames(prisma, [line]);

    expect(served).toEqual([line]);
  });
});
