/**
 * LE PASSAGE du remplissage des points (#6434) — lecture, gardes, rapport.
 *
 * La loi est prouvée à côté (`engagementPointsBackfill.test.ts`). Ici, ce que
 * le passage fait à la BASE : rien en simulation ; en application, des
 * écritures GARDÉES qui ne touchent jamais `updatedAt` d'un compteur — l'élan
 * (#5749) lit cette date comme celle du dernier geste, et un remplissage qui la
 * poserait ferait croire à cinq familles actives cette semaine.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ENGAGEMENT_AXIS_WEIGHTS, LEVEL_THRESHOLDS } from '@meeshy/shared/types/engagement';
import { MEESH_MINT_COST } from '@meeshy/shared/utils/meesh';
import { backfillEngagementPoints } from '../engagementPointsBackfill';

const REGLES = { weights: ENGAGEMENT_AXIS_WEIGHTS, levelThresholds: LEVEL_THRESHOLDS, mintCost: MEESH_MINT_COST };
const UN = '68a000000000000000000001';
const DEUX = '68a000000000000000000002';

type Commande = { update: string; updates: { q: Record<string, unknown>; u: { $set: Record<string, number> } }[] };

function fausseBase(params: {
  compteurs: { id: string; userId: string; axisKey: string; count: number; points: number }[];
  comptes: { id: string; engagementScore: number; role: string }[];
  frappes?: { userId: string; meta: unknown }[];
  paliers?: { userId: string; milestoneKey: string }[];
  /** Nombre de documents que chaque commande brute prétend avoir trouvés (défaut 1). */
  trouve?: (commande: Commande) => number;
  paliersDejaGraves?: string[];
}) {
  const commandes: Commande[] = [];
  const paliersCrees: { userId: string; milestoneKey: string }[] = [];
  const paliersEteints: unknown[] = [];
  const prisma = {
    engagementCounter: { findMany: async () => params.compteurs },
    user: { findMany: async () => params.comptes },
    meeshLedger: { findMany: async () => params.frappes ?? [] },
    engagementMilestone: {
      findMany: async () => params.paliers ?? [],
      deleteMany: async (args: { where: unknown }) => {
        paliersEteints.push(args.where);
        return { count: 1 };
      },
      create: async (args: { data: { userId: string; milestoneKey: string } }) => {
        if ((params.paliersDejaGraves ?? []).includes(args.data.milestoneKey)) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        paliersCrees.push({ userId: args.data.userId, milestoneKey: args.data.milestoneKey });
        return args.data;
      },
    },
    $runCommandRaw: async (commande: Commande) => {
      commandes.push(commande);
      return { ok: 1, n: params.trouve ? params.trouve(commande) : 1, nModified: 1 };
    },
  };
  return { prisma: prisma as unknown as PrismaClient, commandes, paliersCrees, paliersEteints };
}

/** Un compte comme celui mesuré sur staging : des actions, aucun point, un score crédité. */
const compteSansPoints = (userId: string, id = 'c1') => ({
  id,
  userId,
  axisKey: 'content.text_message',
  count: 20,
  points: 0,
});

describe('backfillEngagementPoints — simulation', () => {
  it('n’écrit RIEN sans `apply`, et rend quand même le plan', async () => {
    const { prisma, commandes, paliersCrees } = fausseBase({
      compteurs: [compteSansPoints(UN)],
      comptes: [{ id: UN, engagementScore: 140, role: 'USER' }],
    });

    const rapport = await backfillEngagementPoints(prisma, REGLES, { apply: false });

    expect(commandes).toEqual([]);
    expect(paliersCrees).toEqual([]);
    expect(rapport.accounts).toHaveLength(1);
    expect(rapport.accounts[0]).toMatchObject({ status: 'simulated', role: 'USER' });
    expect(rapport.accounts[0]!.plan.pointsAfter).toBe(180);
  });

  it('le rapport ne porte AUCUN identifiant de compte', async () => {
    const { prisma } = fausseBase({
      compteurs: [compteSansPoints(UN)],
      comptes: [{ id: UN, engagementScore: 140, role: 'USER' }],
    });

    const rapport = await backfillEngagementPoints(prisma, REGLES, { apply: false });

    expect(JSON.stringify(rapport)).not.toContain(UN);
  });

  it('lit au registre les axes qu’une frappe a débités, et ne les remplit pas', async () => {
    const { prisma } = fausseBase({
      compteurs: [compteSansPoints(UN)],
      comptes: [{ id: UN, engagementScore: 0, role: 'ADMIN' }],
      frappes: [{ userId: UN, meta: { cost: 1221, debits: [{ axisKey: 'content.text_message', points: 1221, count: 158 }] } }],
    });

    const rapport = await backfillEngagementPoints(prisma, REGLES, { apply: false });

    expect(rapport.accounts[0]!.plan.counterWrites).toEqual([]);
  });
});

describe('backfillEngagementPoints — application', () => {
  it('écrit par commande brute GARDÉE, jamais par un `update` Prisma qui poserait `updatedAt`', async () => {
    const { prisma, commandes } = fausseBase({
      compteurs: [compteSansPoints(UN)],
      comptes: [{ id: UN, engagementScore: 140, role: 'USER' }],
    });

    await backfillEngagementPoints(prisma, REGLES, { apply: true });

    const compteur = commandes.find((c) => c.update === 'EngagementCounter')!;
    expect(compteur.updates[0]!.u).toEqual({ $set: { points: 180 } });
    // La garde : la ligne n'est remplie que si elle est TOUJOURS à zéro.
    expect(compteur.updates[0]!.q).toEqual({
      _id: { $oid: 'c1' },
      $or: [{ points: { $in: [0, null] } }, { points: { $exists: false } }],
    });
    const score = commandes.find((c) => c.update === 'User')!;
    expect(score.updates[0]).toEqual({ q: { _id: { $oid: UN }, engagementScore: 140 }, u: { $set: { engagementScore: 180 } } });
  });

  it('un compte qui a BOUGÉ entre la lecture et l’écriture est abandonné, pas écrasé', async () => {
    const { prisma, commandes } = fausseBase({
      compteurs: [compteSansPoints(UN, 'c1'), { ...compteSansPoints(UN, 'c2'), axisKey: 'content.post' }],
      comptes: [{ id: UN, engagementScore: 140, role: 'USER' }],
      trouve: () => 0,
    });

    const rapport = await backfillEngagementPoints(prisma, REGLES, { apply: true });

    expect(rapport.accounts[0]!.status).toBe('moved');
    expect(commandes).toHaveLength(1);
  });

  it('grave les paliers en silence, et un palier déjà gravé entre-temps n’interrompt rien', async () => {
    const { prisma, paliersCrees } = fausseBase({
      compteurs: [compteSansPoints(UN)],
      comptes: [{ id: UN, engagementScore: 140, role: 'USER' }],
      paliers: [{ userId: UN, milestoneKey: 'level:10' }],
      paliersDejaGraves: ['level:50'],
    });

    const rapport = await backfillEngagementPoints(prisma, REGLES, { apply: true });

    expect(paliersCrees).toEqual([{ userId: UN, milestoneKey: 'level:150' }]);
    expect(rapport.accounts[0]!.status).toBe('applied');
  });

  it('éteint les niveaux gravés au-dessus du score, en UNE commande bornée au compte et aux seules clés visées (#6465)', async () => {
    const { prisma, paliersEteints } = fausseBase({
      compteurs: [{ id: 'a', userId: UN, axisKey: 'content.text_message', count: 3, points: 1 }],
      comptes: [{ id: UN, engagementScore: 1, role: 'USER' }],
      frappes: [{ userId: UN, meta: { debits: [{ axisKey: 'content.text_message', points: 727, count: 78 }] } }],
      paliers: [
        { userId: UN, milestoneKey: 'level:10' },
        { userId: UN, milestoneKey: 'level:150' },
      ],
    });

    const rapport = await backfillEngagementPoints(prisma, REGLES, { apply: true });

    expect(paliersEteints).toEqual([{ userId: UN, milestoneType: 'level', milestoneKey: { in: ['level:10', 'level:150'] } }]);
    expect(rapport.accounts[0]!.status).toBe('applied');
    expect(rapport.totals).toMatchObject({ accountsWithWrites: 1, levelsToErase: 2 });
  });

  it('en simulation, aucun niveau n’est éteint', async () => {
    const { prisma, paliersEteints } = fausseBase({
      compteurs: [{ id: 'a', userId: UN, axisKey: 'content.text_message', count: 3, points: 1 }],
      comptes: [{ id: UN, engagementScore: 1, role: 'USER' }],
      paliers: [{ userId: UN, milestoneKey: 'level:10' }],
    });

    await backfillEngagementPoints(prisma, REGLES, { apply: false });

    expect(paliersEteints).toEqual([]);
  });

  it('les totaux comptent les comptes qui peuvent frapper avant et après', async () => {
    const { prisma } = fausseBase({
      compteurs: [
        { id: 'a', userId: UN, axisKey: 'content.text_message', count: 136, points: 0 },
        { id: 'b', userId: DEUX, axisKey: 'content.text_message', count: 2, points: 18 },
      ],
      comptes: [
        { id: UN, engagementScore: 1224, role: 'USER' },
        { id: DEUX, engagementScore: 18, role: 'USER' },
      ],
      // Le compte cohérent porte son palier, comme en base : sans lui, graver
      // `level:10` le compterait « à écrire » et le témoin mesurerait la fixture.
      paliers: [{ userId: DEUX, milestoneKey: 'level:10' }],
    });

    const rapport = await backfillEngagementPoints(prisma, REGLES, { apply: false });

    expect(rapport.totals).toMatchObject({ accounts: 2, accountsWithWrites: 1, canMintBefore: 0, canMintAfter: 1 });
  });
});
