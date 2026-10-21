/**
 * LES REÇUS DE CRÉDIT (#9584, décision porteur 2026-10-07 : « tout contenu
 * réalisé puis supprimé supprime aussi les points apportés »).
 *
 * Un crédit accordé pour un CONTENU — une réaction, un commentaire, un like de
 * commentaire, une publication, une republication — garde son reçu : quel
 * contenu (`source`), sur quel post, combien de points. Deux usages :
 *
 * - une source ne crédite un même post qu'UNE fois (réservation à limite 1) :
 *   une réaction déjà posée sur l'original ne le recrédite pas quand on la
 *   reconfirme depuis une autre republication, qui reçoit, elle, son propre
 *   crédit — une fois ;
 * - retirer le contenu REPREND chaque crédit qu'il a produit, une seule fois :
 *   le reçu est remis à zéro par une écriture CONDITIONNELLE avant toute
 *   reprise, si bien qu'une suppression rejouée ne reprend rien.
 *
 * La source est l'identifiant de la LIGNE du contenu, jamais sa clé naturelle :
 * une réaction retirée puis reposée est une ligne neuve, qui rapporte de
 * nouveau — ce que la première rapportait a été repris.
 *
 * Les reçus vivent dans `EngagementQuota` (seau `receipt:<source>|<post>`),
 * comme la mémoire de publication des contenus lourds, qu'ils généralisent. Un
 * crédit tenu par cette mémoire y garde ses points (le reçu en porte zéro) :
 * sa reprise reste `EngagementService.reclaimContent`.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MEESH_DEBIT_ORDER } from '@meeshy/shared/utils/meesh';
import { takeBackAcrossEngagementCounters } from './EngagementCounterWrites';
import type { EngagementQuotas } from './EngagementQuotas';
import type { EngagementScaleSource } from './EngagementScaleService';
import type { PostPointsRecorder } from './PostPointsRecorder';
import { announceGameState } from '../game/GameStateBroadcast';
import { gameRevisionPipelineSet } from '../game/GameRevision';

const NO_POST = '-';

export const receiptBucket = (source: string, postId: string | undefined): string =>
  `receipt:${source}|${postId ?? NO_POST}`;

const postIdOfReceipt = (bucket: string): string | undefined => {
  const postId = bucket.slice(bucket.lastIndexOf('|') + 1);
  return postId === NO_POST ? undefined : postId;
};

type ReceiptPrisma = Pick<PrismaClient, 'engagementQuota' | '$runCommandRaw'>;

/** Où la reprise va chercher ce que le compteur du contenu ne peut plus rendre : l'ordre de débit de la frappe. */
const TAKE_BACK_FALLBACK_AXES: readonly string[] = MEESH_DEBIT_ORDER.flat();

/**
 * Retire `points` d'un crédit déjà écrit. Le compteur de l'opération perd une
 * action et rend ce qu'il tient de ces points ; s'il en tient moins (une frappe
 * l'a entamé, ou sa colonne vaut `null`), le reliquat est repris aux autres
 * compteurs du compte, dans l'ordre de débit de la frappe, sans leur retirer
 * d'action (`takeBackAcrossEngagementCounters`). Le score perd EXACTEMENT la
 * somme reprise, sans descendre sous zéro. Les paliers déjà franchis restent
 * acquis.
 *
 * **Symétrique (#10541).** La version d'origine débitait le compteur sous
 * condition (`points >= p`) et le score sans condition. Le score ne perd plus
 * que ce que des compteurs ont rendu — et la reprise va chercher ce dû sur les
 * autres compteurs. Depuis les étincelles, la frappe ne débite plus aucun
 * compteur (#10846) : ce que la poche, dépensée, ne peut plus rendre devient
 * une DETTE. L'invariant que la reprise tient (#10892) :
 * `sparksEarnedLifetime − engagementScore + sparksDebt == Σ(prix des frappes au registre) + Σ(poches vidées au Prestige)` — le total à vie et la
 * poche baissent ensemble, l'écart passe en dette.
 *
 * **Pas de transaction** : compteurs puis score, des commandes atomiques
 * séparées. Un compteur qui échoue en route arrête la reprise ; le score est
 * quand même débité de ce qui a déjà été repris, puis l'erreur remonte. Seul un
 * échec de l'écriture du SCORE laisse un écart : des compteurs débités sans
 * leur poche — jamais l'inverse, donc jamais des étincelles convertibles que
 * les compteurs ne portent pas.
 *
 * Rend les points réellement repris.
 *
 * ## Le total à vie et le cycle suivent (#10846)
 *
 * Décision : la reprise d'un contenu supprimé RÉDUIT le total à vie et le cycle, mais seulement de ce que ce
 * contenu a rapporté (`taken`, borné par le reçu de crédit) — jamais de la frappe ni du prestige. Sans cela,
 * « publier, dépenser dans une Meesh, supprimer » garderait les étincelles dans le total et le niveau.
 * Résidu assumé : la Meesh déjà frappée avec ces étincelles reste frappée (la poche ne passe pas sous zéro).
 */
export async function takeBackPoints(prisma: ReceiptPrisma, userId: string, operationKey: string, points: number): Promise<number> {
  const { taken, failure } = await takeBackAcrossEngagementCounters(prisma, {
    userId,
    axisKey: operationKey,
    points,
    fallbackAxes: TAKE_BACK_FALLBACK_AXES,
  });
  if (taken > 0) {
    // La reprise réduit la poche (sans passer sous zéro : la frappe a pu la dépenser), le CYCLE et le TOTAL À VIE de ce
    // que le contenu a rapporté, jamais plus (#10846) : c'est ce qui ferme la triche « publier puis supprimer ». Le
    // cycle ne passe pas sous la poche, ni le total à vie sous le cycle (poche ≤ cycle ≤ total à vie).
    const held = (field: string) => ({ $ifNull: [`$${field}`, 0] });
    await prisma.$runCommandRaw({
      findAndModify: 'User',
      query: { _id: { $oid: userId } },
      update: [
        {
          $set: {
            sparksEarnedLifetime: { $max: [0, { $subtract: [{ $max: [held('sparksEarnedLifetime'), held('sparksSincePrestige'), held('engagementScore')] }, taken] }] },
            sparksSincePrestige: { $max: [0, { $subtract: [{ $max: [held('sparksSincePrestige'), held('engagementScore')] }, taken] }] },
            // Ce que la poche ne peut plus rendre (déjà dépensée) devient une DETTE, déduite des prochains gains et qui
            // bloque la frappe (porteur, 2026-10-16). `sparksDebt` d'abord : il lit la poche d'avant.
            sparksDebt: { $add: [held('sparksDebt'), { $subtract: [taken, { $min: [held('engagementScore'), taken] }] }] },
            engagementScore: { $max: [0, { $subtract: [held('engagementScore'), taken] }] },
            // La révision de l'état du jeu (#10912), dans la MÊME commande atomique que la poche.
            ...gameRevisionPipelineSet(Date.now()),
          },
        },
      ],
      new: true,
      fields: { engagementScore: 1 },
    } as never);
  }
  if (failure !== undefined) throw failure;
  return taken;
}

/** La ligue de la semaine (#9384) : une reprise lui rend ce que le gain y avait mis (#10895). */
export type ReceiptLeague = {
  onPointsTakenBack(userId: string, points: number, creditedAt?: Date): Promise<void>;
};

const NO_LEAGUE: ReceiptLeague = { onPointsTakenBack: async () => undefined };

export class EngagementReceipts {
  constructor(
    private readonly prisma: ReceiptPrisma,
    private readonly quotas: EngagementQuotas,
    private readonly posts: PostPointsRecorder,
    private readonly scale: EngagementScaleSource,
    private readonly league: ReceiptLeague = NO_LEAGUE,
  ) {}

  /**
   * Reprend au compte, puis à la ligue, le montant RÉELLEMENT repris — pas plus. La ligue compte le gain entier même
   * quand il a remboursé une dette ; sa reprise la retire donc entière, et les deux restent cohérentes (#10895).
   */
  private async takeBack(userId: string, operationKey: string, points: number, creditedAt?: Date): Promise<number> {
    const taken = await takeBackPoints(this.prisma, userId, operationKey, points);
    if (taken > 0) {
      await this.league.onPointsTakenBack(userId, taken, creditedAt);
      // La poche, la dette et le niveau ont bougé : les appareils du compte le voient sans attendre (#10900).
      announceGameState(userId, 'reclaim');
    }
    return taken;
  }

  /** Le début de la fenêtre de reprise du barème (`abuse.clawbackHours`). */
  private async clawbackSince(): Promise<Date> {
    const scale = await this.scale.current();
    return new Date(Date.now() - scale.abuse.clawbackHours * 3_600_000);
  }

  /**
   * Un contenu lourd SUPPRIMÉ (#8959) : s'il a été publié dans la fenêtre du
   * barème, les points de sa publication, gardés par la mémoire par contenu,
   * sont repris — publier, supprimer, republier ne pompe rien.
   */
  async reclaimPublication(userId: string, operationKey: string, targetId: string): Promise<number> {
    const { points, creditedAt } = await this.quotas.reclaim(userId, operationKey, targetId, await this.clawbackSince());
    if (points <= 0) return 0;
    await this.takeBack(userId, operationKey, points, creditedAt);
    return points;
  }

  /** `false` quand cette source a déjà été comptée pour ce post — rien ne se recrédite. */
  claim(userId: string, operationKey: string, bucket: string): Promise<boolean> {
    return this.quotas.claim(userId, operationKey, bucket, 1);
  }

  /** Inscrit sur le reçu ce que le crédit vient de rapporter. */
  async keep(userId: string, operationKey: string, bucket: string, points: number): Promise<void> {
    await this.prisma.engagementQuota.updateMany({ where: { userId, operationKey, bucket }, data: { points } });
  }

  /**
   * Reprend tout ce que `source` a crédité à `userId` — sur chaque post, au
   * score, au compteur et dans ce que le post lui a rapporté. Rend les points
   * repris ; zéro pour une reprise déjà faite. `withinClawback` borne aux
   * crédits de la fenêtre du barème — la règle des publications.
   */
  async reclaim(userId: string, source: string, options: { readonly withinClawback?: boolean } = {}): Promise<number> {
    const since = options.withinClawback ? await this.clawbackSince() : undefined;
    const receipts = await this.prisma.engagementQuota.findMany({
      where: { userId, bucket: { startsWith: `receipt:${source}|` }, points: { gt: 0 } },
      select: { operationKey: true, bucket: true, points: true, createdAt: true },
    });
    const taken = await Promise.all(
      receipts
        .filter((receipt) => since === undefined || receipt.createdAt >= since)
        .map((receipt) => this.reclaimOne(userId, receipt)),
    );
    return taken.reduce((sum, points) => sum + points, 0);
  }

  private async reclaimOne(
    userId: string,
    receipt: { readonly operationKey: string; readonly bucket: string; readonly points: number; readonly createdAt: Date },
  ): Promise<number> {
    const { operationKey, bucket, points } = receipt;
    const cleared = await this.prisma.engagementQuota.updateMany({
      where: { userId, operationKey, bucket, points },
      data: { points: 0 },
    });
    if (cleared.count === 0) return 0;
    await this.takeBack(userId, operationKey, points, receipt.createdAt);
    const postId = postIdOfReceipt(bucket);
    if (postId !== undefined) await this.posts.takeBack(userId, postId, points);
    return points;
  }
}
