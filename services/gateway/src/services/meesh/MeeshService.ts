/**
 * LA FRAPPE DES MEESHES (#5743) — producteur UNIQUE du registre.
 *
 * Aucune route, aucun handler n'écrit `MeeshLedger` directement : ce service
 * est le seul point d'écriture, comme `EngagementService` l'est des compteurs.
 *
 * Trois propriétés que le porteur a demandées, et une qu'il n'a pas eu besoin
 * de demander :
 *
 *  - **manuelle** — jamais automatique : c'est ce qui en fait un rite ;
 *  - **atomique** — débit des axes, ligne de registre et compteur à vie dans
 *    UNE transaction. Une frappe à moitié faite volerait des points sans rendre
 *    de Meesh, et rien ne permettrait de le rattraper ;
 *  - **idempotente** — `requestId` en index unique `(userId, requestId)`. Un
 *    double-tap, un retry réseau ou une reprise d'application ne frappent
 *    qu'une fois. La seconde tentative REND la première, elle n'échoue pas :
 *    du point de vue de l'appelant, la frappe a eu lieu, ce qui est vrai ;
 *  - **prévisualisable** — `preview()` rend le plan sans rien écrire, pour que
 *    l'écran montre le prix AVANT de confirmer. Une action irréversible qui ne
 *    dit pas ce qu'elle coûte n'est pas acceptable (dimension 12).
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  BADGE_THRESHOLDS,
  badgeMilestoneKey,
  ENGAGEMENT_AXES,
  type EngagementAxisKey,
} from '@meeshy/shared/types/engagement';
import {
  computeMeeshMintPlan,
  MEESH_MINT_COST,
  type MeeshMintPlan,
} from '@meeshy/shared/utils/meesh';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'MeeshService' });

export type MeeshTotals = { readonly balance: number; readonly mintedLifetime: number };

export type MeeshMintOutcome =
  | ({ readonly status: 'minted'; readonly plan: MeeshMintPlan } & MeeshTotals)
  | ({ readonly status: 'already-minted' } & MeeshTotals)
  | { readonly status: 'insufficient'; readonly plan: MeeshMintPlan };

/**
 * LE SOLDE SE LIT AU REGISTRE (#6428) — `User.meeshBalance == Σ(delta)`, et
 * cette fonction est le seul endroit qui calcule les deux totaux.
 *
 * Les colonnes `meeshBalance` / `meeshMintedLifetime` étaient écrites par
 * `{ increment: 1 }`. Sur MongoDB, Prisma n'envoie pas `$inc` : il traduit
 * l'incrément en pipeline `$set: { champ: { $add: ['$champ', 1] } }` (journal
 * de requêtes, base jetable, 2026-09-14). Or `$add` rend `null` dès qu'un
 * opérande MANQUE, et le `@default(0)` du schéma ne vaut qu'à la création :
 * 277 comptes de production sur 282 n'ont pas la colonne. Leur première frappe
 * débitait 1221 points, gravait sa ligne, et laissait `null`, que Prisma relit
 * `0`. L'écran annonçait « Aucune Meesh » après une frappe bien réelle.
 *
 * Les deux lectures sont SÉQUENTIELLES : dans une transaction interactive,
 * elles partagent la session.
 */
export async function meeshTotalsFromLedger(
  db: Pick<PrismaClient, 'meeshLedger'>,
  userId: string,
): Promise<MeeshTotals> {
  const somme = await db.meeshLedger.aggregate({ where: { userId }, _sum: { delta: true } });
  // `reason: 'mint'` : le registre porte aussi les dons et les octrois, qui
  // changent le solde sans être des frappes.
  const frappes = await db.meeshLedger.count({ where: { userId, reason: 'mint' } });
  return { balance: somme._sum.delta ?? 0, mintedLifetime: frappes };
}

export class MeeshService {
  constructor(private readonly prisma: PrismaClient) {}

  /** L'état des axes tel que la loi de frappe l'attend. */
  private async axisStates(userId: string) {
    const lignes = await this.prisma.engagementCounter.findMany({
      where: { userId },
      select: { axisKey: true, count: true, points: true },
    });
    return lignes
      .filter((l) => (ENGAGEMENT_AXES as readonly string[]).includes(l.axisKey))
      .map((l) => ({ axisKey: l.axisKey as EngagementAxisKey, count: l.count, points: l.points }));
  }

  /** Le plan d'une frappe, sans aucune écriture — ce que l'écran montre avant de confirmer. */
  async preview(userId: string): Promise<MeeshMintPlan> {
    return computeMeeshMintPlan(await this.axisStates(userId));
  }

  /**
   * Frappe une Meesh contre `MEESH_MINT_COST` points.
   *
   * Le plan est recalculé DANS la transaction : celui qu'a vu l'écran a pu
   * vieillir entre l'affichage et le tap, et frapper sur un plan périmé
   * débiterait des axes qui ont bougé.
   */
  async mint(userId: string, requestId: string): Promise<MeeshMintOutcome> {
    const dejaFrappe = await this.prisma.meeshLedger.findUnique({
      where: { userId_requestId: { userId, requestId } },
      select: { id: true },
    });
    if (dejaFrappe) {
      return { status: 'already-minted', ...(await meeshTotalsFromLedger(this.prisma, userId)) };
    }

    const plan = computeMeeshMintPlan(await this.axisStates(userId));
    if (!plan.canMint) return { status: 'insufficient', plan };

    try {
      const totaux = await this.prisma.$transaction(async (tx) => {
        for (const ligne of plan.debits) {
          await tx.engagementCounter.update({
            where: { userId_axisKey: { userId, axisKey: ligne.axisKey } },
            data: { points: { decrement: ligne.points }, count: { decrement: ligne.count } },
          });
          // Un axe dont la frappe ne reprend AUCUNE action (les conversations,
          // `MEESH_POINTS_ONLY_AXES`) garde ses badges intacts : son compteur
          // n'a pas bougé, il n'y a rien à éteindre ni à regraver.
          if (ligne.count === 0) continue;

          // Un palier de badge que le compteur ne couvre plus s'ÉTEINT : la
          // ligne gravée le tenait pour atteint (`reached: value >= seuil ||
          // reachedAt !== null`), c'est elle qu'il faut retirer pour que le
          // badge redescende comme le porteur l'a demandé. La contrainte unique
          // se libère du même coup : le badge se re-gagne et se re-notifie.
          const restant = await tx.engagementCounter.findUnique({
            where: { userId_axisKey: { userId, axisKey: ligne.axisKey } },
            select: { count: true },
          });
          await tx.engagementMilestone.deleteMany({
            where: {
              userId,
              milestoneType: 'badge',
              milestoneKey: { startsWith: `${ligne.axisKey}:` },
            },
          });
          // Puis on regrave ceux que le compteur restant couvre encore.
          for (const seuil of BADGE_THRESHOLDS) {
            if ((restant?.count ?? 0) < seuil) continue;
            await tx.engagementMilestone.create({
              data: { userId, milestoneType: 'badge', milestoneKey: badgeMilestoneKey(ligne.axisKey, seuil) },
            });
          }
        }

        // La ligne AVANT les colonnes : ce sont les totaux du registre, frappe
        // comprise, qui s'écrivent — jamais un incrément de la colonne.
        await tx.meeshLedger.create({
          data: {
            userId,
            delta: 1,
            reason: 'mint',
            requestId,
            // La mémoire de ce qui a été rendu — les badges éteints n'en
            // gardent plus trace, le registre est son seul lieu.
            meta: { cost: MEESH_MINT_COST, debits: plan.debits.map((d) => ({ ...d })) },
          },
        });

        const apres = await meeshTotalsFromLedger(tx, userId);
        await tx.user.update({
          where: { id: userId },
          data: {
            engagementScore: { decrement: MEESH_MINT_COST },
            meeshBalance: apres.balance,
            meeshMintedLifetime: apres.mintedLifetime,
          },
          select: { id: true },
        });

        return apres;
      });

      log.info('Meesh frappée', {
        userId,
        cost: MEESH_MINT_COST,
        axes: plan.debits.map((d) => d.axisKey),
        balance: totaux.balance,
      });
      return { status: 'minted', ...totaux, plan };
    } catch (err) {
      // P2002 sur `(userId, requestId)` : deux frappes concurrentes portant le
      // même identifiant — l'index unique a fait son office, la première a
      // gagné. On rend son résultat plutôt qu'une erreur.
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
        return { status: 'already-minted', ...(await meeshTotalsFromLedger(this.prisma, userId)) };
      }
      throw err;
    }
  }
}
