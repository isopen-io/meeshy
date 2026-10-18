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
 *
 * ## Depuis les étincelles (#10846, #10847, #10848 — décision du porteur du 2026-10-16)
 *
 *  - la frappe dépense la POCHE (`User.engagementScore`) et rien d'autre : TOUT est
 *    convertible, elle ne lit ni ne débite aucun compteur d'axe (`EngagementCounter`),
 *    ne retire aucune action (`count`) et n'éteint ni badge ni palier de niveau.
 *    Un badge d'axe dit le TOTAL réel et ne se renotifie jamais (#10845) ;
 *  - le NIVEAU se lit sur la POCHE (#10892, `levelSparksOf`) : la frappe le fait donc baisser du montant
 *    dépensé. Le cycle (`sparksSincePrestige`) et le total à vie, indicatifs, ne bougent pas ;
 *  - le PRIX est celui de la pièce (`meeshPrice(n)`) × le facteur du niveau ACTUEL
 *    (`effectiveMeeshPrice`) ; le serveur le recalcule toujours ;
 *  - une pièce qui ferait entrer dans une réserve du trésor que le rang de Gloire
 *    n'ouvre pas (`treasuryLockFor`) est REFUSÉE, avec le rang requis — le Mythe les ouvre toutes ;
 *  - un compte d'avant le rattrapage (cycle et total à vie absents) les voit posés sur
 *    sa poche AVANT le débit : sans cela, le niveau tomberait avec la poche.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { MeeshMintPlan } from '@meeshy/shared/utils/meesh';
import { GLORY_POINTS, levelCapForRank } from '@meeshy/shared/utils/game/glory';
import { legacyLevel } from '@meeshy/shared/utils/game/levels';
import { type MeeshEdition } from '@meeshy/shared/utils/game/mint';
import { previewSparksMint, sparkCount, sparksOf, type SparksFacts, type SparksMintPreview } from '@meeshy/shared/utils/game/sparks';
import type { TreasuryLock } from '@meeshy/shared/utils/game/treasury';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { withRetry } from '../MessageMediaConsumptionService';
import { GloryService, gloryTotalFromLedger } from '../game/GloryService';
import { GamePhotoService } from '../game/GamePhotoService';
import { MythicSeatService } from '../game/MythicSeatService';
import { LEVEL_STEP_USER_SELECT, countMissionsDone, levelStepFactsOf } from '../game/LevelStepFacts';
import { SPARKS_USER_SELECT } from '../game/SparksFacts';
import { announceGameState } from '../game/GameStateBroadcast';
import { gameRevisionColumn, gameRevisionToServe, gameRevisionValue, nextGameRevision } from '../game/GameRevision';

const log = enhancedLogger.child({ module: 'MeeshService' });

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
  /** Le prix de rang de la pièce, avant le facteur du niveau actuel (#10847) — absent d'un reçu d'avant. */
  readonly basePrice?: number;
  /** Le facteur du niveau actuel appliqué (#10847) — absent d'un reçu d'avant. */
  readonly costFactor?: number;
};

/** La révision de l'état du jeu que la frappe a GRAVÉE (#10912) — celle que sert sa réponse, jamais l'heure de répondre. */
export type MintRevision = { readonly gameRevision: number };

export type MeeshMintOutcome =
  | ({ readonly status: 'minted'; readonly plan: MeeshMintPlan; readonly receipt: MintReceipt } & MeeshTotals & MintRevision)
  | ({ readonly status: 'already-minted'; readonly receipt: MintReceipt | null } & MeeshTotals & MintRevision)
  | { readonly status: 'insufficient'; readonly plan: MeeshMintPlan }
  /** La pièce ferait entrer dans une réserve du trésor que le rang de Gloire n'ouvre pas (#10848). */
  | { readonly status: 'treasury-locked'; readonly lock: TreasuryLock }
  /** Une dette d'étincelles est à rembourser avant de frapper (porteur, 2026-10-16). */
  | { readonly status: 'blocked-by-debt'; readonly sparksDebt: number }
  /** Le prix rejugé dépasse la garde `maxPrice` que l'écran a envoyée (#10903) : rien n'est débité, le prix courant est servi. */
  | ({ readonly status: 'price-changed' } & ServedMintPrice);

/** Le prix courant de la prochaine pièce, tel que la frappe le débiterait — servi avec un refus de garde (#10903). */
export type ServedMintPrice = {
  readonly number: number;
  readonly price: number;
  readonly basePrice: number;
  readonly costFactor: number;
};

/** La garde optionnelle d'une frappe (#10903) : absente, la frappe se comporte comme avant. */
export type MintGuard = { readonly maxPrice?: number };

const servedPriceOf = (preview: SparksMintPreview): ServedMintPrice => ({
  number: preview.number,
  price: preview.price,
  basePrice: preview.basePrice,
  costFactor: preview.costFactor,
});

const exceedsGuard = (preview: SparksMintPreview, guard: MintGuard): boolean =>
  typeof guard.maxPrice === 'number' && preview.price > guard.maxPrice;

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
    ...(typeof m.basePrice === 'number' && Number.isInteger(m.basePrice) ? { basePrice: m.basePrice } : {}),
    ...(typeof m.costFactor === 'number' && Number.isFinite(m.costFactor) ? { costFactor: m.costFactor } : {}),
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
  constructor(readonly preview: Pick<SparksMintPreview, 'canMint' | 'missingPoints'> & { readonly sparksPocket: number }) {
    super('mint would take the score below zero');
    this.name = 'ScoreWouldGoNegative';
  }
}

/** Une réserve du trésor s'est fermée entre l'aperçu et la transaction (un don, un octroi) : annulée en bloc. */
class TreasuryLockedInTransaction extends Error {
  constructor(readonly lock: TreasuryLock) {
    super('mint would enter a treasury reserve the rank does not open');
    this.name = 'TreasuryLockedInTransaction';
  }
}

/** Le plan que l'écran lit : toute la poche est débitable, il n'y a plus de plancher ni de débit par axe. */
export function mintPlanOf(preview: Pick<SparksMintPreview, 'canMint' | 'missingPoints'>, pocket: number): MeeshMintPlan {
  return { debitablePoints: pocket, floorPoints: 0, canMint: preview.canMint, missingPoints: preview.missingPoints, debits: [] };
}

/** Le prix rejugé dans la transaction dépasse la garde du client (#10903) : annulée en bloc, rendue avec le prix courant. */
class PriceAboveGuard extends Error {
  constructor(readonly served: ServedMintPrice) {
    super('mint price above the client guard');
    this.name = 'PriceAboveGuard';
  }
}

/** Une dette d'étincelles est apparue entre la lecture et la transaction : annulée en bloc, rendue comme bloquée. */
class DebtBlocksMint extends Error {
  constructor(readonly sparksDebt: number) {
    super('mint blocked by a sparks debt');
    this.name = 'DebtBlocksMint';
  }
}

export class MeeshService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Tout ce que la loi de frappe lit sur le compte, en une fois : les étincelles, les étapes des niveaux, la
   * Gloire et les Meeshes gardées. Trois lectures indexées en parallèle, jamais une par règle.
   */
  private async facts(userId: string) {
    const [totals, row, missionsDone, glory, seat] = await Promise.all([
      meeshTotalsFromLedger(this.prisma, userId),
      this.prisma.user.findUnique({ where: { id: userId }, select: { ...SPARKS_USER_SELECT, ...LEVEL_STEP_USER_SELECT } }),
      countMissionsDone(this.prisma, userId),
      gloryTotalFromLedger(this.prisma, userId),
      // Comme le bloc `game` : une lecture de la place qui tombe rend le rang sur la Gloire, jamais la frappe entière.
      new MythicSeatService(this.prisma).seatOf(userId).catch(() => null),
    ]);
    const sparks = sparksOf(row);
    // Le Mythe, que le bloc `game` sert (#10894) : sans lui, l'aperçu disait « frappable » et la frappe « réserve fermée ».
    const mythic = seat !== null;
    const steps = levelStepFactsOf({ row: { ...row, meeshMintedLifetime: totals.mintedLifetime }, missionsDone, glory, mythic });
    // Tout ce que le prix lit, sauf la poche et la dette : la frappe le rejuge sur la ligne relue DANS sa transaction.
    const previewAt = (pocketFacts: SparksFacts): SparksMintPreview =>
      previewSparksMint({
        sparks: pocketFacts.pocket,
        mintedLifetime: totals.mintedLifetime,
        held: totals.balance,
        glory,
        mythic,
        levelCap: levelCapForRank(steps.rank),
        steps,
        debt: pocketFacts.debt,
      });
    const records = { levelRecord: row?.levelRecord ?? null, levelMaxLifetime: row?.levelMaxLifetime ?? null };
    return { totals, sparks, records, preview: previewAt(sparks), previewAt };
  }

  /**
   * Le niveau d'AVANT le débit est atteint (#10905) : un record gravé en retard le rattrape AVANT la frappe — sinon la
   * relecture d'après le débit servirait un record plus bas que celle d'avant. Par `creditLevelProgress`, l'unique
   * écriture du record : la Gloire des niveaux franchis se paie, rien ne s'annonce (un rattrapage n'est pas une montée).
   *
   * @returns la Gloire gravée par ce rattrapage — non nulle, le rang et donc le prix ont pu bouger.
   */
  private async catchUpLevelBefore(
    userId: string,
    records: { readonly levelRecord: number | null; readonly levelMaxLifetime: number | null },
    levelBefore: number,
  ): Promise<number> {
    if (levelBefore <= (records.levelRecord ?? 0) && levelBefore <= (records.levelMaxLifetime ?? 0)) return 0;
    return new GloryService(this.prisma).openLevels(userId, { announce: false });
  }

  /**
   * Le plan d'une frappe, sans aucune écriture — ce que l'écran montre avant de
   * confirmer. Au prix EFFECTIF de la prochaine pièce (rareté × niveau actuel).
   */
  async preview(userId: string): Promise<MeeshMintPlan> {
    const { sparks, preview } = await this.facts(userId);
    return mintPlanOf(preview, sparks.pocket);
  }

  /**
   * Frappe une Meesh au prix de sa rareté et de son niveau actuel (`effectiveMeeshPrice`, #9374, #10847).
   *
   * Le prix, le niveau d'avant et celui d'après sont rejugés DANS la transaction, sur la poche qu'elle relit
   * (#10895) : ceux qu'a vus l'écran — et ceux de la lecture d'avant la transaction — ont pu vieillir.
   *
   * **Un conflit d'écriture se rejoue (#6467).** D'autres écrivains touchent le
   * document `User` pendant la transaction (activité, locale, pays) : MongoDB
   * l'annule en bloc (P2034). Mesuré sur staging le 2026-09-14, deux gestes
   * sur trois perdus ainsi. La reprise est sûre : rien de la tentative
   * rejetée n'a été écrit, et `(userId, requestId)` reste unique au registre.
   * Elle repart de la LECTURE, parce que la poche a pu bouger entre-temps.
   */
  async mint(userId: string, requestId: string, guard: MintGuard = {}): Promise<MeeshMintOutcome> {
    return withRetry(() => this.mintOnce(userId, requestId, guard));
  }

  private async mintOnce(userId: string, requestId: string, guard: MintGuard): Promise<MeeshMintOutcome> {
    const dejaFrappe = await this.prisma.meeshLedger.findUnique({
      where: { userId_requestId: { userId, requestId } },
      select: { id: true, meta: true },
    });
    if (dejaFrappe) return this.alreadyMinted(userId, dejaFrappe.meta);

    // Le PRIX est celui de CETTE pièce, au niveau ACTUEL du compte : le serveur le recalcule, aucun client n'en
    // est cru (un ancien client qui croit encore à 1 221 est refusé sans débit quand sa poche ne couvre pas le vrai prix).
    const { totals: avant, sparks, records, preview, previewAt } = await this.facts(userId);
    const { number } = preview;
    // Le refus de RANG passe avant celui de poche : un compte sans le rang apprend d'abord ce qui le barre.
    // La dette passe avant tout : tant qu'elle existe, on ne frappe pas.
    if (preview.blockedBy === 'debt') return { status: 'blocked-by-debt', sparksDebt: preview.sparksDebt };
    if (preview.locked !== null) return { status: 'treasury-locked', lock: preview.locked };
    // La garde de prix (#10903) avant la poche : l'écran a promis au plus `maxPrice`, il apprend d'abord le prix courant.
    if (exceedsGuard(preview, guard)) return { status: 'price-changed', ...servedPriceOf(preview) };
    if (!preview.canMint) return { status: 'insufficient', plan: mintPlanOf(preview, sparks.pocket) };
    // Le rattrapage a payé de la Gloire : le prix se rejuge sur les faits relus (il ne paie jamais deux fois les mêmes niveaux).
    if ((await this.catchUpLevelBefore(userId, records, preview.levelBefore)) > 0) return this.mintOnce(userId, requestId, guard);

    try {
      const gravee = await this.prisma.$transaction(async (tx) => {
        // Le numéro, lui, doit être celui que le prix a supposé : une frappe
        // concurrente l'aurait décalé. L'annulation est rejouée en bloc.
        const concurrentes = await tx.meeshLedger.count({ where: { userId, reason: 'mint' } });
        if (concurrentes !== avant.mintedLifetime) throw Object.assign(new Error('mint number moved'), { code: 'P2034' });

        // La poche se lit DANS la transaction : un crédit concurrent fait annuler la tentative (P2034) au lieu
        // d'être écrasé, et le débit s'écrit en VALEUR (jamais un incrément : leçon #6428). Le PRIX, le niveau
        // d'avant et celui d'après se rejugent sur CETTE lecture (#10895) : le niveau se lit sur la poche (#10892),
        // donc une poche qui a bougé depuis l'aperçu change le facteur — le reçu dit ce qui a été débité.
        const compte = await tx.user.findUnique({ where: { id: userId }, select: { ...SPARKS_USER_SELECT, gameRevision: true } });
        const dans = sparksOf(compte);
        const jugee = previewAt(dans);
        if (jugee.blockedBy === 'debt') throw new DebtBlocksMint(jugee.sparksDebt);
        if (jugee.locked !== null) throw new TreasuryLockedInTransaction(jugee.locked);
        if (exceedsGuard(jugee, guard)) throw new PriceAboveGuard(servedPriceOf(jugee));
        if (!jugee.canMint) throw new ScoreWouldGoNegative({ ...jugee, sparksPocket: dans.pocket });
        const { price, levelBefore, levelAfter, edition } = jugee;

        // La ligne AVANT les colonnes : ce sont les totaux du registre, frappe
        // comprise, qui s'écrivent — jamais un incrément de la colonne.
        const gloryGained = GLORY_POINTS.mint;
        await tx.meeshLedger.create({
          data: {
            userId,
            delta: 1,
            reason: 'mint',
            requestId,
            // La mémoire de ce qui a été rendu. Le reçu y vit aussi : un rejeu rend la même pièce. Plus aucun
            // débit par axe (`debits` reste, vide, pour la lecture des lignes d'avant).
            meta: {
              cost: price,
              debits: [],
              number,
              edition,
              price,
              basePrice: jugee.basePrice,
              costFactor: jugee.costFactor,
              gloryGained,
              levelBefore,
              levelAfter,
            },
          },
        });

        const apres = await meeshTotalsFromLedger(tx, userId);
        // La révision de l'état du jeu (#10912), gravée DANS la transaction qui écrit l'état : lue avec la poche, elle ne
        // recule jamais — un écrivain concurrent fait annuler la tentative, rejouée depuis la lecture.
        const gameRevision = nextGameRevision(gameRevisionValue(compte?.gameRevision), Date.now());
        await tx.user.update({
          where: { id: userId },
          data: {
            gameRevision: gameRevisionColumn(gameRevision),
            engagementScore: dans.pocket - price,
            meeshBalance: apres.balance,
            meeshMintedLifetime: apres.mintedLifetime,
            // Un compte d'avant le rattrapage n'a ni cycle ni total à vie : on les pose sur sa poche AVANT le
            // débit, sinon ces indicateurs tomberaient avec elle. Jamais écrit pour un compte à jour.
            ...(sparkCount(compte?.sparksSincePrestige) < dans.cycle ? { sparksSincePrestige: BigInt(dans.cycle) } : {}),
            ...(sparkCount(compte?.sparksEarnedLifetime) < dans.lifetime ? { sparksEarnedLifetime: BigInt(dans.lifetime) } : {}),
          },
        });

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

        return { apres, debite: jugee, gameRevision };
      });
      const { apres: totaux, debite, gameRevision } = gravee;
      const { price, levelBefore, levelAfter, edition } = debite;

      // La frappe a pu faire une étape des niveaux (#9706) : le niveau qui attendait monte d'un coup.
      await new GloryService(this.prisma).openLevels(userId);
      // Le trésor a pu franchir un palier : le plus haut atteint se garde (D14, #10162) — au mieux, une
      // panne ne coûte que l'écriture, rattrapée par la lecture qui sert le plus haut du gardé et du courant.
      try {
        await new GamePhotoService(this.prisma).notePeakTreasury(userId, totaux.balance);
      } catch (error) {
        log.warn('treasury peak not recorded', { userId, error: error instanceof Error ? error.message : String(error) });
      }

      log.info('Meesh frappée', { userId, cost: price, number, balance: totaux.balance });
      // Les autres appareils du compte apprennent la frappe sans attendre (#10900).
      announceGameState(userId, 'mint');
      return {
        status: 'minted',
        ...totaux,
        gameRevision,
        plan: mintPlanOf({ canMint: true, missingPoints: 0 }, sparks.pocket - price),
        receipt: {
          number,
          edition,
          price,
          gloryGained: GLORY_POINTS.mint,
          levelBefore,
          levelAfter,
          basePrice: debite.basePrice,
          costFactor: debite.costFactor,
        },
      };
    } catch (err) {
      if (err instanceof DebtBlocksMint) return { status: 'blocked-by-debt', sparksDebt: err.sparksDebt };
      if (err instanceof TreasuryLockedInTransaction) return { status: 'treasury-locked', lock: err.lock };
      if (err instanceof PriceAboveGuard) return { status: 'price-changed', ...err.served };
      if (err instanceof ScoreWouldGoNegative) {
        // La poche a bougé entre la lecture et la transaction : refus jugé sur la poche relue.
        return { status: 'insufficient', plan: mintPlanOf(err.preview, err.preview.sparksPocket) };
      }
      // P2002 sur `(userId, requestId)` : deux frappes concurrentes portant le
      // même identifiant — l'index unique a fait son office, la première a
      // gagné. On rend son résultat plutôt qu'une erreur.
      if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
        const gravee = await this.prisma.meeshLedger.findUnique({
          where: { userId_requestId: { userId, requestId } },
          select: { id: true, meta: true },
        });
        return this.alreadyMinted(userId, gravee?.meta);
      }
      throw err;
    }
  }

  /**
   * Le REJEU d'une frappe faite : le même reçu, les totaux courants et la révision GRAVÉE (#10912), lue AVANT les
   * totaux — un rejeu ne fait jamais monter la révision.
   */
  private async alreadyMinted(userId: string, meta: unknown): Promise<MeeshMintOutcome> {
    const gameRevision = await gameRevisionToServe(this.prisma, userId);
    return { status: 'already-minted', receipt: receiptFromMeta(meta), ...(await meeshTotalsFromLedger(this.prisma, userId)), gameRevision };
  }
}
