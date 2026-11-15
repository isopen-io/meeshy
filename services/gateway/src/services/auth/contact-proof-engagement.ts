/**
 * LE CRÉDIT D'UNE COORDONNÉE PROUVÉE (#8959) — `profile.email_verified` et
 * `profile.phone_verified`, une fois par compte (le moteur le tient).
 *
 * Seul le GESTE de l'utilisateur paie : saisir le code reçu, ouvrir le lien de
 * sa boîte. Les portes d'administration qui datent une coordonnée pour le
 * compte de quelqu'un d'autre n'appellent jamais ce module.
 *
 * Le crédit est hors du chemin de la réponse : une panne du moteur (ou son
 * absence dans un environnement réduit) ne fait jamais échouer la preuve.
 *
 * @module services/auth/contact-proof-engagement
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { enhancedLogger } from '../../utils/logger-enhanced';
import { EngagementService } from '../engagement/EngagementService';

const logger = enhancedLogger.child({ module: 'ContactProofEngagement' });

export type ContactProofOperation = 'profile.email_verified' | 'profile.phone_verified';

export type ContactProofRecorder = Pick<EngagementService, 'recordActivity'>;

export type ContactProofEngagementSource = {
  readonly prisma: PrismaClient;
  /** Un double en test ; absent ⇒ le moteur sur `prisma`. */
  readonly engagement?: ContactProofRecorder;
};

export function creditContactProof(
  source: ContactProofEngagementSource,
  userId: string,
  operation: ContactProofOperation,
): void {
  try {
    const engagement = source.engagement ?? new EngagementService(source.prisma);
    engagement
      .recordActivity(userId, operation)
      .catch((error: unknown) => logger.warn(`engagement ${operation} non crédité`, { error }));
  } catch (error) {
    logger.warn(`engagement ${operation} non crédité`, { error });
  }
}
