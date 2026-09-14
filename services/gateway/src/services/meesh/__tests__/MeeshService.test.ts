/**
 * LE SOLDE D'UNE FRAPPE (#6428) — une Meesh frappée doit APPARAÎTRE.
 *
 * Mesuré en production le 2026-09-14 : le seul compte qui avait frappé portait
 * sa ligne au registre et 1221 points de moins, mais `meeshBalance` et
 * `meeshMintedLifetime` valaient `null`. L'écran annonçait « Aucune Meesh » :
 * du point de vue du porteur, la frappe était impossible, alors que ses points
 * étaient partis.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MeeshService } from '../MeeshService';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

const USER_ID = '68a000000000000000000001';

type Colonne = number | null | undefined;
type Compte = { engagementScore: Colonne; meeshBalance: Colonne; meeshMintedLifetime: Colonne };
type LigneRegistre = { userId: string; requestId: string; delta: number; reason: string };
type Increment = { increment?: number; decrement?: number };

/**
 * **Le faux reproduit la loi MESURÉE de Prisma sur MongoDB, pas celle qu'on
 * suppose.** `{ increment: 1 }` y devient `$set: { champ: { $add: ['$champ', 1] } }`
 * (journal de requêtes, base jetable, 2026-09-14) : un champ ABSENT ou `null`
 * en ressort `null`, et Prisma le RELIT `0`. Un faux qui traiterait l'absence
 * comme un zéro rendrait ces témoins verts sur le code fautif.
 */
const ecrire = (avant: Colonne, valeur: number | Increment): Colonne => {
  if (typeof valeur === 'number') return valeur;
  if (typeof avant !== 'number') return null;
  return avant + (valeur.increment ?? 0) - (valeur.decrement ?? 0);
};
const relire = (valeur: Colonne): number => (typeof valeur === 'number' ? valeur : 0);

function fausseBase(params: { compte: Compte; points: number; registre?: LigneRegistre[] }) {
  const compte: Compte = { ...params.compte };
  const registre: LigneRegistre[] = [...(params.registre ?? [])];
  const compteur = { axisKey: 'content.text_message', count: 400, points: params.points };

  const client = {
    engagementCounter: {
      findMany: async () => [{ ...compteur }],
      update: async (args: { data: { points: Increment; count: Increment } }) => {
        compteur.points -= args.data.points.decrement ?? 0;
        compteur.count -= args.data.count.decrement ?? 0;
        return { ...compteur };
      },
      findUnique: async () => ({ count: compteur.count }),
    },
    engagementMilestone: {
      deleteMany: async () => ({ count: 0 }),
      create: async () => ({}),
    },
    user: {
      update: async (args: { data: Record<keyof Compte, number | Increment> }) => {
        for (const cle of Object.keys(args.data) as (keyof Compte)[]) {
          compte[cle] = ecrire(compte[cle], args.data[cle]);
        }
        return { meeshBalance: relire(compte.meeshBalance), meeshMintedLifetime: relire(compte.meeshMintedLifetime) };
      },
      findUnique: async () => ({
        meeshBalance: relire(compte.meeshBalance),
        meeshMintedLifetime: relire(compte.meeshMintedLifetime),
      }),
    },
    meeshLedger: {
      findUnique: async (args: { where: { userId_requestId: { userId: string; requestId: string } } }) => {
        const { userId, requestId } = args.where.userId_requestId;
        return registre.some((l) => l.userId === userId && l.requestId === requestId) ? { id: 'ligne' } : null;
      },
      create: async (args: { data: LigneRegistre }) => {
        registre.push({ userId: args.data.userId, requestId: args.data.requestId, delta: args.data.delta, reason: args.data.reason });
        return args.data;
      },
      aggregate: async (args: { where: { userId: string } }) => {
        const lignes = registre.filter((l) => l.userId === args.where.userId);
        return { _sum: { delta: lignes.length === 0 ? null : lignes.reduce((s, l) => s + l.delta, 0) } };
      },
      count: async (args: { where: { userId: string; reason?: string } }) =>
        registre.filter((l) => l.userId === args.where.userId && (args.where.reason === undefined || l.reason === args.where.reason)).length,
    },
  };

  const prisma = { ...client, $transaction: async <T>(fn: (tx: typeof client) => Promise<T>) => fn(client) };
  return { prisma: prisma as unknown as PrismaClient, compte };
}

const frappe = (requestId: string): LigneRegistre => ({ userId: USER_ID, requestId, delta: 1, reason: 'mint' });

describe('MeeshService.mint — le solde se lit au REGISTRE', () => {
  it('un compte SANS colonne de solde voit 1 Meesh après sa première frappe', async () => {
    const { prisma, compte } = fausseBase({
      compte: { engagementScore: 1300, meeshBalance: undefined, meeshMintedLifetime: undefined },
      points: 1300,
    });

    const issue = await new MeeshService(prisma).mint(USER_ID, 'frappe-0001');

    expect(issue).toMatchObject({ status: 'minted', balance: 1, mintedLifetime: 1 });
    expect(compte.meeshBalance).toBe(1);
    expect(compte.meeshMintedLifetime).toBe(1);
  });

  it('une colonne restée null après une frappe : la suivante compte les DEUX', async () => {
    const { prisma, compte } = fausseBase({
      compte: { engagementScore: 1300, meeshBalance: null, meeshMintedLifetime: null },
      points: 1300,
      registre: [frappe('frappe-perdue')],
    });

    const issue = await new MeeshService(prisma).mint(USER_ID, 'frappe-0002');

    expect(issue).toMatchObject({ status: 'minted', balance: 2, mintedLifetime: 2 });
    expect(compte.meeshBalance).toBe(2);
  });

  it('le rejeu d’une frappe rend le solde du registre, pas une colonne vide', async () => {
    const { prisma } = fausseBase({
      compte: { engagementScore: 80, meeshBalance: null, meeshMintedLifetime: null },
      points: 80,
      registre: [frappe('frappe-0003')],
    });

    const issue = await new MeeshService(prisma).mint(USER_ID, 'frappe-0003');

    expect(issue).toEqual({ status: 'already-minted', balance: 1, mintedLifetime: 1 });
  });

  it('un compte sain ne compte pas deux fois la frappe qu’il vient d’écrire', async () => {
    const { prisma, compte } = fausseBase({
      compte: { engagementScore: 5000, meeshBalance: 3, meeshMintedLifetime: 3 },
      points: 1300,
      registre: [frappe('a-0000001'), frappe('b-0000001'), frappe('c-0000001')],
    });

    const issue = await new MeeshService(prisma).mint(USER_ID, 'frappe-0004');

    expect(issue).toMatchObject({ status: 'minted', balance: 4, mintedLifetime: 4 });
    expect(compte.engagementScore).toBe(5000 - 1221);
  });
});
