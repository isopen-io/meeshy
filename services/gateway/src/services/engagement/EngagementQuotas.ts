/**
 * LES QUOTAS D'ENGAGEMENT (#8959) — qui décide qu'une action crédite encore.
 *
 * Seul écrivain d'`EngagementQuota`. Chaque plafond est un SEAU compté par
 * incrément atomique : le geste qui fait passer le compte au-delà de la limite
 * ne crédite pas, et deux gestes concurrents ne peuvent pas passer tous les
 * deux sous une limite de 1. Aucune relecture avant écriture.
 *
 * Portées (`EngagementOperationDefinition`) :
 * - répétable plafonnée par jour ⇒ `day:<AAAA-MM-JJ>` ;
 * - répétable plafonnée par cible (les tranches d'UN appel) ⇒ `target:<id>` ;
 * - unique par cible ⇒ `target:<id>`, limite 1 ;
 * - unique par compte ⇒ `account`, limite 1 ;
 * - contenu LOURD (post, story, reel) ⇒ en plus `content:<id>`, limite 1 : un
 *   même contenu ne crédite qu'une fois, quoi qu'on fasse de sa visibilité.
 *
 * Le plafond par conversation et par jour reste porté par
 * `ConversationEngagement.dayCounts` (`ConversationEngagementRecorder`).
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  ENGAGEMENT_OPERATION_CATALOG,
  type EngagementOperationKey,
} from '@meeshy/shared/types/engagement-operations';
import type { EngagementOperationRule } from '@meeshy/shared/types/engagement-scale';
import { civilDayKey } from './civilDay';

type QuotaClient = Pick<PrismaClient, 'engagementQuota'>;

function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

export const dayBucket = (today: Date): string => `day:${civilDayKey(today)}`;
export const targetBucket = (targetId: string): string => `target:${targetId}`;
export const contentBucket = (targetId: string): string => `content:${targetId}`;
export const ACCOUNT_BUCKET = 'account';

export type QuotaAdmission = {
  readonly userId: string;
  readonly operationKey: EngagementOperationKey;
  readonly rule: EngagementOperationRule;
  readonly today: Date;
  readonly targetId?: string;
  readonly heavy: boolean;
};

export class EngagementQuotas {
  constructor(private readonly prisma: QuotaClient) {}

  /**
   * Incrémente le seau et rend son nouveau compte. Deux premières écritures
   * concurrentes : la perdante de la création retombe sur un incrément.
   */
  async increment(userId: string, operationKey: string, bucket: string): Promise<number> {
    const where = { userId_operationKey_bucket: { userId, operationKey, bucket } };
    try {
      const row = await this.prisma.engagementQuota.upsert({
        where,
        create: { userId, operationKey, bucket, count: 1 },
        update: { count: { increment: 1 } },
        select: { count: true },
      });
      return row.count;
    } catch (err) {
      if (!isP2002(err)) throw err;
      const row = await this.prisma.engagementQuota.update({
        where,
        data: { count: { increment: 1 } },
        select: { count: true },
      });
      return row.count;
    }
  }

  /** `true` tant que le seau reste sous `limit` après CE geste. */
  async claim(userId: string, operationKey: string, bucket: string, limit: number): Promise<boolean> {
    return (await this.increment(userId, operationKey, bucket)) <= limit;
  }

  /**
   * Une fois par `windowMs` au plus, sur une fenêtre GLISSANTE — la visite
   * d'un visiteur sur un lien. La mise à jour conditionnelle tranche : une
   * ligne plus ancienne que la fenêtre se réarme, une ligne récente refuse,
   * une ligne absente se crée (et la perdante d'une création concurrente
   * refuse).
   */
  async claimOncePer(userId: string, operationKey: string, bucket: string, windowMs: number, now: Date): Promise<boolean> {
    const rearmed = await this.prisma.engagementQuota.updateMany({
      where: { userId, operationKey, bucket, updatedAt: { lt: new Date(now.getTime() - windowMs) } },
      data: { count: { increment: 1 }, updatedAt: now },
    });
    if (rearmed.count > 0) return true;
    try {
      await this.prisma.engagementQuota.create({ data: { userId, operationKey, bucket, count: 1 } });
      return true;
    } catch (err) {
      if (isP2002(err)) return false;
      throw err;
    }
  }

  /** La portée structurelle de l'opération, puis son plafond réglé. `false` ⇒ ne rien créditer. */
  async admit(params: QuotaAdmission): Promise<boolean> {
    const { userId, operationKey, rule, today, targetId, heavy } = params;
    const operation = ENGAGEMENT_OPERATION_CATALOG[operationKey];

    if (operation.frequency === 'per-account') return this.claim(userId, operationKey, ACCOUNT_BUCKET, 1);
    if (operation.frequency === 'per-target') {
      return targetId === undefined ? true : this.claim(userId, operationKey, targetBucket(targetId), 1);
    }

    if (heavy && targetId !== undefined && !(await this.claim(userId, operationKey, contentBucket(targetId), 1))) {
      return false;
    }
    if (rule.cap === null) return true;
    if (operation.capScope === 'day') return this.claim(userId, operationKey, dayBucket(today), rule.cap);
    if (operation.capScope === 'target' && targetId !== undefined) {
      return this.claim(userId, operationKey, targetBucket(targetId), rule.cap);
    }
    return true;
  }

  /** Garde ce qu'un contenu lourd a rapporté, pour pouvoir le reprendre. */
  async remember(userId: string, operationKey: string, targetId: string, points: number): Promise<void> {
    await this.prisma.engagementQuota.updateMany({
      where: { userId, operationKey, bucket: contentBucket(targetId) },
      data: { points },
    });
  }

  /**
   * Les points à reprendre pour un contenu supprimé : ceux qu'il a rapportés
   * s'il a été publié après `since`, remis à zéro dans le même geste pour
   * qu'une seconde suppression ne reprenne rien. Le seau reste consommé : le
   * contenu ne recréditera jamais.
   */
  async reclaim(userId: string, operationKey: string, targetId: string, since: Date): Promise<number> {
    const row = await this.prisma.engagementQuota.findUnique({
      where: { userId_operationKey_bucket: { userId, operationKey, bucket: contentBucket(targetId) } },
      select: { points: true, createdAt: true },
    });
    if (!row || row.points <= 0 || row.createdAt < since) return 0;
    const cleared = await this.prisma.engagementQuota.updateMany({
      where: { userId, operationKey, bucket: contentBucket(targetId), points: row.points },
      data: { points: 0 },
    });
    return cleared.count > 0 ? row.points : 0;
  }
}
