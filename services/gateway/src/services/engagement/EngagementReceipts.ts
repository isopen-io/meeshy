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
import type { EngagementQuotas } from './EngagementQuotas';
import type { EngagementScaleSource } from './EngagementScaleService';
import type { PostPointsRecorder } from './PostPointsRecorder';

const NO_POST = '-';

export const receiptBucket = (source: string, postId: string | undefined): string =>
  `receipt:${source}|${postId ?? NO_POST}`;

const postIdOfReceipt = (bucket: string): string | undefined => {
  const postId = bucket.slice(bucket.lastIndexOf('|') + 1);
  return postId === NO_POST ? undefined : postId;
};

type ReceiptPrisma = Pick<PrismaClient, 'engagementQuota' | 'engagementCounter' | '$runCommandRaw'>;

/**
 * Retire `points` d'un crédit déjà écrit : le compteur de l'opération perd une
 * action et ses points, le score ses points sans descendre sous zéro. Les
 * paliers déjà franchis restent acquis.
 */
export async function takeBackPoints(prisma: ReceiptPrisma, userId: string, operationKey: string, points: number): Promise<void> {
  await prisma.engagementCounter.updateMany({
    where: { userId, axisKey: operationKey, points: { gte: points }, count: { gte: 1 } },
    data: { count: { decrement: 1 }, points: { decrement: points } },
  });
  await prisma.$runCommandRaw({
    findAndModify: 'User',
    query: { _id: { $oid: userId } },
    update: [{ $set: { engagementScore: { $max: [0, { $subtract: [{ $ifNull: ['$engagementScore', 0] }, points] }] } } }],
    new: true,
    fields: { engagementScore: 1 },
  } as never);
}

export class EngagementReceipts {
  constructor(
    private readonly prisma: ReceiptPrisma,
    private readonly quotas: EngagementQuotas,
    private readonly posts: PostPointsRecorder,
    private readonly scale: EngagementScaleSource,
  ) {}

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
    const points = await this.quotas.reclaim(userId, operationKey, targetId, await this.clawbackSince());
    if (points <= 0) return 0;
    await takeBackPoints(this.prisma, userId, operationKey, points);
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
    receipt: { readonly operationKey: string; readonly bucket: string; readonly points: number },
  ): Promise<number> {
    const { operationKey, bucket, points } = receipt;
    const cleared = await this.prisma.engagementQuota.updateMany({
      where: { userId, operationKey, bucket, points },
      data: { points: 0 },
    });
    if (cleared.count === 0) return 0;
    await takeBackPoints(this.prisma, userId, operationKey, points);
    const postId = postIdOfReceipt(bucket);
    if (postId !== undefined) await this.posts.takeBack(userId, postId, points);
    return points;
  }
}
