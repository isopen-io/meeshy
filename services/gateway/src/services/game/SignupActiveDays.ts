/**
 * LES JOURS D'ACTIVITÉ DES TRENTE PREMIERS JOURS (#20620, #17363) — ce que lit le retour CLASSIQUE au jour N de
 * `GET /admin/analytics/game`. `lastActiveAt` s'écrase à chaque visite : il ne dit que le dernier jour. Ici, le compte
 * garde le RANG des jours pleins depuis son inscription où il a été actif (0 le jour même, 30 au plus), sans contenu
 * ni heure — 31 entiers au plus.
 *
 * Écrit par `StatusService` au premier passage du jour : la mise à jour de `lastActiveAt` rend déjà `createdAt` et les
 * jours gardés (`SIGNUP_ACTIVE_DAYS_SELECT`), donc un compte de plus de trente jours ne coûte aucune écriture de plus.
 * Deux passages concurrents peuvent pousser le même jour deux fois : la lecture dédoublonne, et la taille reste
 * bornée par les passages du jour. Vidé quand le compte a quatorze semaines (`purgeExpired`, nettoyage journalier).
 *
 * Un compte opposé à l'analyse (`analyticsConsentWithdrawnAt`) n'écrit rien, et la lecture l'écarte ; un compte supprimé
 * voit ses jours vidés à l'anonymisation (`anonymizeUserIdentity`) ; `GET /me/export` les rend à leur titulaire.
 *
 * Aucune reconstitution du passé : la mesure commence au déploiement.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { SIGNUP_ACTIVE_DAYS_LAST_OFFSET, SIGNUP_ACTIVE_DAYS_RETENTION_DAYS } from '@meeshy/shared/types/game-baseline';
import { logger } from '../../utils/logger';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Ce que la mise à jour de `lastActiveAt` doit rendre pour que le jour se garde sans lecture de plus. */
export const SIGNUP_ACTIVE_DAYS_SELECT = { createdAt: true, signupActiveDays: true, analyticsConsentWithdrawnAt: true } as const;

export type SignupActiveDaysRow = {
  readonly createdAt?: Date | null;
  readonly signupActiveDays?: readonly number[] | null;
  /** Le compte s'est opposé à l'analyse d'usage (art. 21 RGPD) : rien ne s'écrit plus. */
  readonly analyticsConsentWithdrawnAt?: Date | null;
};

/** Le rang du jour plein depuis l'inscription (0 le jour même), ou `null` hors des trente premiers jours. */
export function signupDayOffset(createdAt: Date, at: Date): number | null {
  const elapsed = at.getTime() - createdAt.getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return null;
  const offset = Math.floor(elapsed / DAY_MS);
  return offset <= SIGNUP_ACTIVE_DAYS_LAST_OFFSET ? offset : null;
}

export class SignupActiveDaysRecorder {
  constructor(private readonly prisma: Pick<PrismaClient, 'user'>) {}

  /** Le compte vient d'être actif : son jour se garde s'il est dans les trente premiers et pas encore gardé. Ne lève jamais. */
  async observe(userId: string, row: SignupActiveDaysRow | null | undefined, now: Date = new Date()): Promise<void> {
    const createdAt = row?.createdAt;
    if (!(createdAt instanceof Date) || row?.analyticsConsentWithdrawnAt) return;
    const offset = signupDayOffset(createdAt, now);
    if (offset === null || (row?.signupActiveDays ?? []).includes(offset)) return;
    try {
      await this.prisma.user.updateMany({ where: { id: userId }, data: { signupActiveDays: { push: offset } } });
    } catch (error) {
      logger.debug(`⚠️  Jour d'activité non gardé pour ${userId}:`, error);
    }
  }

  /** Vide les jours des comptes de plus de quatorze semaines : plus aucune semaine mesurée ne les lit. */
  async purgeExpired(now: Date = new Date()): Promise<number> {
    const result = await this.prisma.user.updateMany({
      where: { createdAt: { lt: new Date(now.getTime() - SIGNUP_ACTIVE_DAYS_RETENTION_DAYS * DAY_MS) }, signupActiveDays: { isEmpty: false } },
      data: { signupActiveDays: { set: [] } },
    });
    return result.count;
  }
}
