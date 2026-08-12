/**
 * Tests — SequenceService.nextSeq / currentSeq (SyncEngine A1).
 *
 * Le compteur DOIT être strictement croissant et par-utilisateur : c'est
 * l'invariant sur lequel repose la détection EXACTE des gaps côté client.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { SequenceService } from '../../../services/SequenceService';

// Fake in-memory UserEventSeq store reproduisant la sémantique atomique de
// l'upsert-increment Prisma/MongoDB (findOneAndUpdate $inc upsert).
function makePrisma() {
  const store = new Map<string, bigint>();
  return {
    userEventSeq: {
      upsert: jest.fn(async (args: {
        where: { userId: string };
        create: { userId: string; lastSeq: bigint };
        update: { lastSeq: { increment: bigint } };
      }) => {
        const { userId } = args.where;
        const current = store.get(userId);
        const next = current === undefined
          ? args.create.lastSeq
          : current + args.update.lastSeq.increment;
        store.set(userId, next);
        return { lastSeq: next };
      }),
      findUnique: jest.fn(async (args: { where: { userId: string } }) => {
        const v = store.get(args.where.userId);
        return v === undefined ? null : { lastSeq: v };
      }),
    },
  } as unknown as ConstructorParameters<typeof SequenceService>[0];
}

describe('SequenceService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let svc: SequenceService;

  beforeEach(() => {
    prisma = makePrisma();
    svc = new SequenceService(prisma);
  });

  it('nextSeq starts at 1 for a fresh user and is strictly monotonic', async () => {
    expect(await svc.nextSeq('u1')).toBe(1);
    expect(await svc.nextSeq('u1')).toBe(2);
    expect(await svc.nextSeq('u1')).toBe(3);
  });

  it('nextSeq is independent per user', async () => {
    expect(await svc.nextSeq('u1')).toBe(1);
    expect(await svc.nextSeq('u2')).toBe(1);
    expect(await svc.nextSeq('u1')).toBe(2);
    expect(await svc.nextSeq('u2')).toBe(2);
  });

  it('concurrent nextSeq calls for the same user yield distinct, gapless values', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => svc.nextSeq('burst')),
    );
    const sorted = [...results].sort((a, b) => a - b);
    expect(sorted).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(new Set(results).size).toBe(20); // no duplicate
  });

  it('currentSeq returns 0 before any emission and the last value after', async () => {
    expect(await svc.currentSeq('u3')).toBe(0);
    await svc.nextSeq('u3');
    await svc.nextSeq('u3');
    expect(await svc.currentSeq('u3')).toBe(2);
  });
});
