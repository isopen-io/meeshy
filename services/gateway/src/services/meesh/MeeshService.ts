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
  LEVEL_THRESHOLDS,
  levelMilestoneKey,
  type EngagementAxisKey,
} from '@meeshy/shared/types/engagement';
import { computeMeeshMintPlan, type MeeshMintPlan } from '@meeshy/shared/utils/meesh';
import { GLORY_POINTS, levelCapForRank } from '@meeshy/shared/utils/game/glory';
import { legacyLevel } from '@meeshy/shared/utils/game/levels';
import { meeshEdition, meeshPrice, previewMint, type MeeshEdition } from '@meeshy/shared/utils/game/mint';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { withRetry } from '../MessageMediaConsumptionService';
import { GloryService, gloryTotalFromLedger } from '../game/GloryService';
import { LEVEL_STEP_USER_SELECT, countMissionsDone, levelStepFactsOf } from '../game/LevelStepFacts';

const log = enhancedLogger.child({ module: 'MeeshService' });

/**
 * Les clés des paliers qu'une valeur ne couvre PLUS — ce qu'une frappe éteint,
 * et rien d'autre (#6465).
 *
 * Un palier encore couvert garde sa ligne, donc sa DATE. L'effacer puis le
 * regraver lui donnait un `reachedAt` neuf : un badge vieux de plusieurs mois
 * devenait le « dernier succès » du jour, sans que rien n'ait été gagné.
 */
const clesNonCouvertes = (
  seuils: readonly number[],
  valeur: number,
  cle: (seuil: number) => string,
): string[] => seuils.filter((seuil) => seuil > valeur).map(cle);

export type MeeshTotals = { readonly balance: number; readonly mintedLifetime: number };

/**
 * Le REÇU d'une frappe (#9374) : la pièce telle qu'elle a été gravée. Il vit dans
 * la ligne du registre, donc un rejeu le rend à l'identique, sans rien recalculer.
 */
export type MintReceipt = {
  readonly number: number;
  readonly edition: MeeshEdition;
  readonly price: number;
  readonly gloryGained: number;
  readonly levelBefore: number;
  readonly levelAfter: number;
};

export type MeeshMintOutcome =
  | ({ readonly status: 'minted'; readonly plan: MeeshMintPlan; readonly receipt: MintReceipt } & MeeshTotals)
  | ({ readonly status: 'already-minted'; readonly receipt: MintReceipt | null } & MeeshTotals)
  | { readonly status: 'insufficient'; readonly plan: MeeshMintPlan };

const EDITIONS: readonly string[] = ['silver', 'gold', 'prism'];

/** Le reçu gravé dans `meta`, ou `null` pour une frappe d'avant le jeu (aucun champ n'y était). */
export function receiptFromMeta(meta: unknown): MintReceipt | null {
  if (typeof meta !== 'object' || meta === null) return null;
  const m = meta as Record<string, unknown>;
  const ints = [m.number, m.price, m.gloryGained, m.levelBefore, m.levelAfter];
  if (!ints.every((v) => typeof v === 'number' && Number.isInteger(v))) return null;
  if (typeof m.edition !== 'string' || !EDITIONS.includes(m.edition)) return null;
  return {
    number: m.number as number,
    edition: m.edition as MeeshEdition,
    price: m.price as number,
    gloryGained: m.gloryGained as number,
    levelBefore: m.levelBefore as number,
    levelAfter: m.levelAfter as number,
  };
}

/**
 * Le reçu tel qu'il part sur le fil (#9688) : `levelBefore` / `levelAfter` gardent l'ancienne loi (bornés à
 * 100, la seule forme que les clients publiés décodent) ; les niveaux ouverts par le rang voyagent dans
 * `ladder`. Le registre, lui, garde la vérité.
 */
export function receiptOnTheWire(receipt: MintReceipt) {
  return {
    ...receipt,
    levelBefore: legacyLevel(receipt.levelBefore),
    levelAfter: legacyLevel(receipt.levelAfter),
    ladder: { levelBefore: receipt.levelBefore, levelAfter: receipt.levelAfter },
  };
}

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

/** Une frappe qui ferait passer le score sous zéro (#9675) : annulée en bloc, rendue comme insuffisante. */
class ScoreWouldGoNegative extends Error {
  constructor() {
    super('mint would take the score below zero');
    this.name = 'ScoreWouldGoNegative';
  }
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

  /**
   * Le plan d'une frappe, sans aucune écriture — ce que l'écran montre avant de
   * confirmer. Au PRIX de la prochaine pièce (la rareté croît, #9374).
   */
  async preview(userId: string): Promise<MeeshMintPlan> {
    const { mintedLifetime } = await meeshTotalsFromLedger(this.prisma, userId);
    return computeMeeshMintPlan(await this.axisStates(userId), { mintCost: meeshPrice(mintedLifetime + 1) });
  }

  /**
   * Frappe une Meesh au prix de sa rareté (`meeshPrice`, #9374).
   *
   * Le plan est recalculé DANS la transaction : celui qu'a vu l'écran a pu
   * vieillir entre l'affichage et le tap, et frapper sur un plan périmé
   * débiterait des axes qui ont bougé.
   *
   * **Un conflit d'écriture se rejoue (#6467).** D'autres écrivains touchent le
   * document `User` pendant la transaction (activité, locale, pays) : MongoDB
   * l'annule en bloc (P2034). Mesuré sur staging le 2026-09-14, deux gestes
   * sur trois perdus ainsi. La reprise est sûre : rien de la tentative
   * rejetée n'a été écrit, et `(userId, requestId)` reste unique au registre.
   * Elle repart de la LECTURE, parce que les axes ont pu bouger entre-temps.
   */
  async mint(userId: string, requestId: string): Promise<MeeshMintOutcome> {
    return withRetry(() => this.mintOnce(userId, requestId));
  }

  private async mintOnce(userId: string, requestId: string): Promise<MeeshMintOutcome> {
    const dejaFrappe = await this.prisma.meeshLedger.findUnique({
      where: { userId_requestId: { userId, requestId } },
      select: { id: true, meta: true },
    });
    if (dejaFrappe) {
      return {
        status: 'already-minted',
        receipt: receiptFromMeta(dejaFrappe.meta),
        ...(await meeshTotalsFromLedger(this.prisma, userId)),
      };
    }

    // Le PRIX est celui de CETTE pièce : le serveur le recalcule, aucun client
    // n'en est cru (un ancien client qui croit encore à 1 221 est refusé sans débit).
    const avant = await meeshTotalsFromLedger(this.prisma, userId);
    const number = avant.mintedLifetime + 1;
    const price = meeshPrice(number);
    const plan = computeMeeshMintPlan(await this.axisStates(userId), { mintCost: price });
    if (!plan.canMint) return { status: 'insufficient', plan };

    // Le record de niveau se pose AVANT le débit : c'est lui que la frappe
    // laisse derrière elle (Vent arrière), et la Gloire des niveaux déjà
    // atteints se grave pendant que le score les porte encore.
    const compteAvant = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { engagementScore: true, levelRecord: true, ...LEVEL_STEP_USER_SELECT },
    });
    const scoreAvant = compteAvant?.engagementScore ?? 0;
    await new GloryService(this.prisma).creditLevelProgress({
      userId,
      score: scoreAvant,
      previousRecord: compteAvant?.levelRecord ?? null,
    });
    // Le niveau d'APRÈS est celui que `previewMint` montrait : le score moins le
    // prix, lu au même instant que le record. Le niveau s'ouvre selon le rang
    // (#9688) et les étapes (#9706) : la frappe en fait une (une Meesh, cinq
    // Meeshes, ou un rang par sa Gloire), le niveau d'après peut donc MONTER.
    const [missionsDone, gloryAvant] = await Promise.all([countMissionsDone(this.prisma, userId), gloryTotalFromLedger(this.prisma, userId)]);
    const steps = levelStepFactsOf({ row: { ...compteAvant, meeshMintedLifetime: avant.mintedLifetime }, missionsDone, glory: gloryAvant });
    const { levelBefore, levelAfter } = previewMint({
      score: scoreAvant,
      mintedLifetime: avant.mintedLifetime,
      debitablePoints: plan.debitablePoints,
      levelCap: levelCapForRank(steps.rank),
      steps,
    });
    const edition = meeshEdition(number);

    try {
      const totaux = await this.prisma.$transaction(async (tx) => {
        for (const ligne of plan.debits) {
          // Le compteur RESTANT se lit dans la réponse de l'écriture : une
          // relecture par axe allongeait la transaction, donc la fenêtre où un
          // autre écrivain la fait annuler.
          const restant = await tx.engagementCounter.update({
            where: { userId_axisKey: { userId, axisKey: ligne.axisKey } },
            data: { points: { decrement: ligne.points }, count: { decrement: ligne.count } },
            select: { count: true },
          });
          // Un axe dont la frappe ne reprend AUCUNE action (les conversations,
          // `MEESH_POINTS_ONLY_AXES`) garde ses badges intacts : son compteur
          // n'a pas bougé, il n'y a rien à éteindre.
          if (ligne.count === 0) continue;

          // Un palier de badge que le compteur ne couvre plus s'ÉTEINT : la
          // ligne gravée le tenait pour atteint (`reached: value >= seuil ||
          // reachedAt !== null`), c'est elle qu'il faut retirer pour que le
          // badge redescende comme le porteur l'a demandé. La contrainte unique
          // se libère du même coup : le badge se re-gagne et se re-notifie.
          // Ceux que le compteur couvre encore ne sont PAS touchés (#6465).
          const eteints = clesNonCouvertes(BADGE_THRESHOLDS, restant.count ?? 0, (seuil) =>
            badgeMilestoneKey(ligne.axisKey, seuil),
          );
          if (eteints.length > 0) {
            await tx.engagementMilestone.deleteMany({
              where: { userId, milestoneType: 'badge', milestoneKey: { in: eteints } },
            });
          }
        }

        // Le numéro, lui, doit être celui que le prix a supposé : une frappe
        // concurrente l'aurait décalé. L'annulation est rejouée en bloc.
        const concurrentes = await tx.meeshLedger.count({ where: { userId, reason: 'mint' } });
        if (concurrentes !== avant.mintedLifetime) throw Object.assign(new Error('mint number moved'), { code: 'P2034' });

        // La ligne AVANT les colonnes : ce sont les totaux du registre, frappe
        // comprise, qui s'écrivent — jamais un incrément de la colonne.
        const gloryGained = GLORY_POINTS.mint;
        await tx.meeshLedger.create({
          data: {
            userId,
            delta: 1,
            reason: 'mint',
            requestId,
            // La mémoire de ce qui a été rendu — les badges éteints n'en
            // gardent plus trace, le registre est son seul lieu. Le reçu y
            // vit aussi : un rejeu rend la même pièce.
            meta: {
              cost: price,
              debits: plan.debits.map((d) => ({ ...d })),
              number,
              edition,
              price,
              gloryGained,
              levelBefore,
              levelAfter,
            },
          },
        });

        const apres = await meeshTotalsFromLedger(tx, userId);
        const compte = await tx.user.update({
          where: { id: userId },
          data: {
            engagementScore: { decrement: price },
            meeshBalance: apres.balance,
            meeshMintedLifetime: apres.mintedLifetime,
          },
          select: { engagementScore: true },
        });
        // Le score ne descend JAMAIS sous zéro (#9675) : des compteurs qui couvrent le prix quand le score
        // ne le couvre pas trahissent un écart entre les deux sources ; la frappe s'annule en bloc.
        if ((compte.engagementScore ?? 0) < 0) throw new ScoreWouldGoNegative();

        // La Gloire dans la MÊME transaction : une frappe qui débite sans la
        // graver est impossible, et inversement.
        await tx.gloryLedger.create({
          data: {
            userId,
            delta: gloryGained,
            reason: 'mint',
            requestId: `mint:${requestId}`,
            meta: { number, edition, price, levelBefore, levelAfter },
          },
        });

        // LE NIVEAU redescend avec le score (#6465). Un palier `level:T` gravé
        // au-dessus du score restant faisait compter au NIVEAU ce que la BARRE
        // ne voyait plus : « Niveau 3 · 1 point · encore 9 points avant le
        // niveau 4 », sur staging, à la première frappe réelle.
        const niveauxEteints = clesNonCouvertes(LEVEL_THRESHOLDS, compte.engagementScore ?? 0, levelMilestoneKey);
        if (niveauxEteints.length > 0) {
          await tx.engagementMilestone.deleteMany({
            where: { userId, milestoneType: 'level', milestoneKey: { in: niveauxEteints } },
          });
        }

        return apres;
      });

      // La frappe a pu faire une étape des niveaux (#9706) : le niveau qui attendait monte d'un coup.
      await new GloryService(this.prisma).openLevels(userId);

      log.info('Meesh frappée', {
        userId,
        cost: price,
        number,
        axes: plan.debits.map((d) => d.axisKey),
        balance: totaux.balance,
      });
      return {
        status: 'minted',
        ...totaux,
        plan,
        receipt: { number, edition, price, gloryGained: GLORY_POINTS.mint, levelBefore, levelAfter },
      };
    } catch (err) {
      if (err instanceof ScoreWouldGoNegative) return { status: 'insufficient', plan };
      // P2002 sur `(userId, requestId)` : deux frappes concurrentes portant le
      // même identifiant — l'index unique a fait son office, la première a
      // gagné. On rend son résultat plutôt qu'une erreur.
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
        const gravee = await this.prisma.meeshLedger.findUnique({
          where: { userId_requestId: { userId, requestId } },
          select: { id: true, meta: true },
        });
        return {
          status: 'already-minted',
          receipt: receiptFromMeta(gravee?.meta),
          ...(await meeshTotalsFromLedger(this.prisma, userId)),
        };
      }
      throw err;
    }
  }
}
