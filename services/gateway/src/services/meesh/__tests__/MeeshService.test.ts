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

type Palier = { milestoneType: string; milestoneKey: string; reachedAt: string };
type FiltreCle = { in?: string[]; startsWith?: string };

/** L'instant d'une gravure FAITE PAR LA FRAPPE — distinct de toute date de fixture. */
const GRAVE_PAR_LA_FRAPPE = '2026-09-14T07:12:57.000Z';

const conflitEcriture = () =>
  Object.assign(new Error('Transaction failed due to a write conflict or a deadlock. Please retry your transaction'), {
    code: 'P2034',
  });

function fausseBase(params: {
  compte: Compte;
  points: number;
  registre?: LigneRegistre[];
  paliers?: Palier[];
  /** Nombre de `user.update` rejetés par un conflit d'écriture, comme MongoDB le fait (P2034). */
  conflits?: number;
}) {
  const compte: Compte = { ...params.compte };
  const registre: LigneRegistre[] = [...(params.registre ?? [])];
  const paliers: Palier[] = [...(params.paliers ?? [])];
  const compteur = { axisKey: 'content.text_message', count: 400, points: params.points };
  let conflitsRestants = params.conflits ?? 0;

  const correspond = (cle: string, filtre: FiltreCle) =>
    (filtre.in === undefined || filtre.in.includes(cle)) &&
    (filtre.startsWith === undefined || cle.startsWith(filtre.startsWith));

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
      deleteMany: async (args: { where: { milestoneType: string; milestoneKey: FiltreCle } }) => {
        const avant = paliers.length;
        const gardes = paliers.filter(
          (p) => !(p.milestoneType === args.where.milestoneType && correspond(p.milestoneKey, args.where.milestoneKey)),
        );
        paliers.splice(0, paliers.length, ...gardes);
        return { count: avant - gardes.length };
      },
      create: async (args: { data: { milestoneType: string; milestoneKey: string } }) => {
        paliers.push({ milestoneType: args.data.milestoneType, milestoneKey: args.data.milestoneKey, reachedAt: GRAVE_PAR_LA_FRAPPE });
        return args.data;
      },
    },
    user: {
      update: async (args: { data: Record<keyof Compte, number | Increment> }) => {
        if (conflitsRestants > 0) {
          conflitsRestants -= 1;
          throw conflitEcriture();
        }
        for (const cle of Object.keys(args.data) as (keyof Compte)[]) {
          compte[cle] = ecrire(compte[cle], args.data[cle]);
        }
        return {
          engagementScore: relire(compte.engagementScore),
          meeshBalance: relire(compte.meeshBalance),
          meeshMintedLifetime: relire(compte.meeshMintedLifetime),
        };
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

  /**
   * La transaction s'ANNULE en bloc sur une erreur, comme sur MongoDB : un faux
   * qui garderait les écritures d'une tentative rejetée ferait passer une
   * reprise pour une double frappe, ou cacherait qu'elle en est une.
   */
  const $transaction = async <T>(fn: (tx: typeof client) => Promise<T>): Promise<T> => {
    const instantane = {
      compte: { ...compte },
      compteur: { ...compteur },
      registre: [...registre],
      paliers: [...paliers],
    };
    try {
      return await fn(client);
    } catch (err) {
      Object.assign(compte, instantane.compte);
      Object.assign(compteur, instantane.compteur);
      registre.splice(0, registre.length, ...instantane.registre);
      paliers.splice(0, paliers.length, ...instantane.paliers);
      throw err;
    }
  };

  const prisma = { ...client, $transaction };
  return { prisma: prisma as unknown as PrismaClient, compte, registre, paliers, compteur };
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

/**
 * CE QUE LA FRAPPE ÉTEINT (#6465) — et seulement cela.
 *
 * Mesuré sur staging le 2026-09-14, juste après la première frappe réelle :
 * « Niveau 3 · 1 point · Encore 9 points avant le niveau 4 », et « Dernier
 * succès : 10 messages envoyés, obtenu aujourd'hui » pour un badge vieux de
 * plusieurs mois. La frappe gardait les niveaux gravés au-dessus du score, et
 * effaçait puis regravait les badges que le compteur couvrait encore.
 */
describe('MeeshService.mint — les paliers suivent la valeur RESTANTE', () => {
  const badge = (seuil: number, reachedAt: string): Palier => ({
    milestoneType: 'badge',
    milestoneKey: `content.text_message:${seuil}`,
    reachedAt,
  });
  const niveau = (seuil: number): Palier => ({
    milestoneType: 'level',
    milestoneKey: `level:${seuil}`,
    reachedAt: '2026-03-01T00:00:00.000Z',
  });

  it('éteint les badges que le compteur restant ne couvre plus, et laisse les autres INTACTS, date comprise', async () => {
    const { prisma, paliers, compteur } = fausseBase({
      compte: { engagementScore: 1300, meeshBalance: 0, meeshMintedLifetime: 0 },
      points: 1300,
      paliers: [
        badge(1, '2026-01-05T00:00:00.000Z'),
        badge(10, '2026-02-10T00:00:00.000Z'),
        badge(50, '2026-04-20T00:00:00.000Z'),
        badge(100, '2026-06-30T00:00:00.000Z'),
      ],
    });

    await new MeeshService(prisma).mint(USER_ID, 'frappe-badges');

    expect(compteur.count).toBeGreaterThanOrEqual(10);
    expect(compteur.count).toBeLessThan(50);
    expect(paliers.filter((p) => p.milestoneType === 'badge')).toEqual([
      badge(1, '2026-01-05T00:00:00.000Z'),
      badge(10, '2026-02-10T00:00:00.000Z'),
    ]);
  });

  it('éteint les niveaux que le score restant ne couvre plus — le niveau et sa barre lisent la même valeur', async () => {
    const { prisma, paliers, compte } = fausseBase({
      compte: { engagementScore: 1300, meeshBalance: 0, meeshMintedLifetime: 0 },
      points: 1300,
      paliers: [niveau(10), niveau(50), niveau(150), niveau(400), niveau(1000)],
    });

    await new MeeshService(prisma).mint(USER_ID, 'frappe-niveaux');

    expect(compte.engagementScore).toBe(79);
    expect(paliers.filter((p) => p.milestoneType === 'level')).toEqual([niveau(10), niveau(50)]);
  });
});

/**
 * UN CONFLIT D'ÉCRITURE SE REJOUE (#6467).
 *
 * Mesuré sur staging le 2026-09-14 : deux frappes rejetées, « Transaction
 * failed due to a write conflict or a deadlock. Please retry your transaction »
 * sur `user.update`, avant la troisième qui aboutit. D'autres écrivains touchent
 * le document `User` pendant la transaction (activité, locale, pays) ; MongoDB
 * annule, et personne ne rejouait.
 */
describe('MeeshService.mint — un conflit d’écriture ne coûte pas un geste', () => {
  it('rejoue la frappe : elle aboutit, UNE ligne au registre, 1221 points débités une seule fois', async () => {
    const { prisma, compte, registre } = fausseBase({
      compte: { engagementScore: 1300, meeshBalance: 0, meeshMintedLifetime: 0 },
      points: 1300,
      conflits: 1,
    });

    const issue = await new MeeshService(prisma).mint(USER_ID, 'frappe-conflit');

    expect(issue).toMatchObject({ status: 'minted', balance: 1, mintedLifetime: 1 });
    expect(registre).toHaveLength(1);
    expect(compte.engagementScore).toBe(1300 - 1221);
  });

  it('la reprise est BORNÉE : un conflit qui persiste remonte, et rien n’est écrit', async () => {
    const { prisma, compte, registre } = fausseBase({
      compte: { engagementScore: 1300, meeshBalance: 0, meeshMintedLifetime: 0 },
      points: 1300,
      conflits: 99,
    });

    await expect(new MeeshService(prisma).mint(USER_ID, 'frappe-bloquee')).rejects.toMatchObject({ code: 'P2034' });

    expect(registre).toEqual([]);
    expect(compte.engagementScore).toBe(1300);
  });
});
