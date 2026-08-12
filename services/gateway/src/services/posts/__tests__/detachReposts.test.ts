import { describe, it, expect, jest } from '@jest/globals';

import { detachReposts } from '../detachReposts';

type UpdateArgs = {
  where: { repostOfId?: { in: string[] }; originalRepostOfId?: { in: string[] } };
  data: { repostOfId?: null; originalRepostOfId?: null };
};

function makePrisma(counts: { direct?: number; roots?: number } = {}) {
  const calls: UpdateArgs[] = [];
  return {
    calls,
    prisma: {
      post: {
        updateMany: jest.fn(async (args: UpdateArgs) => {
          calls.push(args);
          return {
            count: args.where.repostOfId ? (counts.direct ?? 0) : (counts.roots ?? 0),
          };
        }),
      },
    },
  };
}

describe('detachReposts', () => {
  it('ne pose aucune question quand la fournée est vide', async () => {
    const { prisma, calls } = makePrisma();

    const result = await detachReposts(prisma as never, []);

    expect(calls).toHaveLength(0);
    expect(result).toEqual({ direct: 0, roots: 0 });
  });

  it('annule le pointeur DIRECT des posts qui repostent une cible détruite', async () => {
    const { prisma, calls } = makePrisma({ direct: 3 });

    await detachReposts(prisma as never, ['doomed-1', 'doomed-2']);

    const direct = calls.find((c) => c.where.repostOfId);
    expect(direct).toEqual({
      where: { repostOfId: { in: ['doomed-1', 'doomed-2'] } },
      data: { repostOfId: null },
    });
  });

  it('annule aussi le pointeur de RACINE, qui n_a ni relation ni cascade', async () => {
    const { prisma, calls } = makePrisma({ roots: 2 });

    await detachReposts(prisma as never, ['doomed-1']);

    const roots = calls.find((c) => c.where.originalRepostOfId);
    expect(roots).toEqual({
      where: { originalRepostOfId: { in: ['doomed-1'] } },
      data: { originalRepostOfId: null },
    });
  });

  it('traite les deux pointeurs SÉPARÉMENT : un repost de repost garde son parent vivant', async () => {
    // R2 reposte R1, qui repostait S. Seul S est détruit : R2.originalRepostOfId
    // pointe dans le vide et doit tomber, R2.repostOfId vise R1 qui SURVIT et
    // doit rester. Un seul `updateMany` mêlant les deux champs les perdrait
    // tous les deux.
    const { prisma, calls } = makePrisma();

    await detachReposts(prisma as never, ['S']);

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(Object.keys(call.data)).toHaveLength(1);
      expect(Object.keys(call.where)).toHaveLength(1);
    }
  });

  it('rend le compte de chaque pointeur coupé, sans les additionner', async () => {
    // Un même post peut porter les DEUX pointeurs vers la fournée : une somme
    // le compterait deux fois et ferait mentir la journalisation de la passe.
    const { prisma } = makePrisma({ direct: 4, roots: 7 });

    const result = await detachReposts(prisma as never, ['doomed-1']);

    expect(result).toEqual({ direct: 4, roots: 7 });
  });

  it('REJETTE quand la coupure échoue — la passe doit renoncer à détruire', async () => {
    const prisma = {
      post: {
        updateMany: jest.fn(async () => {
          throw new Error('mongo down');
        }),
      },
    };

    await expect(detachReposts(prisma as never, ['doomed-1'])).rejects.toThrow('mongo down');
  });

  it('recopie la liste reçue au lieu de la passer telle quelle à Prisma', async () => {
    const { prisma, calls } = makePrisma();
    const doomed: readonly string[] = ['doomed-1'];

    await detachReposts(prisma as never, doomed);

    expect(calls[0].where.repostOfId!.in).not.toBe(doomed);
    expect(calls[0].where.repostOfId!.in).toEqual(['doomed-1']);
  });
});
