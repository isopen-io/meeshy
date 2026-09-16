import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { logger } from '../utils/logger';
import { cleanupExpiredSessions } from './SessionService';
import { repairOrphanedMessageSenders } from './messaging/repairOrphanedMessageSenders';

const ANONYMOUS_PARTICIPANT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Le balayage des données expirées du nettoyage journalier
 * (`MaintenanceService.cleanupExpiredData`, qui le délègue ici).
 *
 * Quatre étapes, chacune sous son propre `try/catch` : un Mongo indisponible sur
 * l'une ne doit pas empêcher les autres d'avoir lieu, ni faire échouer le
 * balayage journalier qui l'appelle.
 */
export async function cleanupExpiredData(prisma: PrismaClient): Promise<void> {
  try {
    const expiredBefore = new Date(Date.now() - ANONYMOUS_PARTICIPANT_TTL_MS);

    const expiredAnonymousSessions = await prisma.participant.deleteMany({
      where: {
        type: 'anonymous',
        lastActiveAt: { lt: expiredBefore },
        // Un anonyme qui a ÉCRIT reste (#6501). `Message.sender` est une
        // relation REQUISE : le retirer rendait chacun de ses messages
        // orphelin, et UN orphelin suffit à faire rejeter par Prisma toute
        // lecture de la conversation — pour tous ses membres.
        sentMessages: { none: {} },
      },
    });

    if (expiredAnonymousSessions.count > 0) {
      logger.info(`🧹 ${expiredAnonymousSessions.count} sessions anonymes expirées supprimées`);
    }

    // Épargner n'est pas PROLONGER. Cette purge était la seule échéance d'une
    // session anonyme — l'authentification n'en lit aucune autre. L'anonyme
    // expiré qui a écrit garde sa ligne, donc ses messages gardent leur auteur,
    // mais sa session se termine comme `endGuestSession` la termine : une ligne
    // inactive est refusée à l'authentification et au rafraîchissement, et une
    // nouvelle entrée par lien émet un nouveau jeton, donc une nouvelle ligne.
    const endedWriterSessions = await prisma.participant.updateMany({
      where: {
        type: 'anonymous',
        isActive: true,
        lastActiveAt: { lt: expiredBefore },
        sentMessages: { some: {} },
      },
      data: { isActive: false, isOnline: false, leftAt: new Date() },
    });

    if (endedWriterSessions.count > 0) {
      logger.info(`🧹 ${endedWriterSessions.count} sessions anonymes expirées terminées (auteurs conservés, #6501)`);
    }

    const expiredShareLinks = await prisma.conversationShareLink.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });

    if (expiredShareLinks.count > 0) {
      logger.info(`🧹 ${expiredShareLinks.count} liens de partage expirés supprimés`);
    }
  } catch (error) {
    logger.error('❌ Erreur lors du nettoyage des données expirées:', error);
  }

  // Ce qu'un effaceur a DÉJÀ laissé — la purge ci-dessus avant #6501, un
  // nettoyage manuel, une migration — se répare ici, dans toutes les
  // conversations, avant qu'une lecture ne le rencontre.
  try {
    await repairOrphanedMessageSenders(prisma);
  } catch (error) {
    logger.error('❌ Erreur lors de la réparation des expéditeurs orphelins (#6501):', error);
  }

  // Invalider les `UserSession` dont l'échéance est dépassée (#5712) —
  // `cleanupExpiredSessions` existait déjà (filtre `expiresAt`, motif
  // `expired`) mais n'avait jusqu'ici AUCUN appelant de production. Mesuré :
  // 140 lignes expirées depuis jusqu'à six mois restaient `isValid: true`,
  // faussant toute lecture qui s'y fie (listing de sessions, `/auth/refresh`
  // dont le régime `sid` s'arrête à `isValid`) sans jamais accorder d'accès
  // — le chemin d'authentification filtre déjà `expiresAt` lui-même.
  try {
    const invalidated = await cleanupExpiredSessions();
    if (invalidated > 0) {
      logger.info(`🧹 ${invalidated} sessions expirées invalidées (#5712)`);
    }
  } catch (error) {
    logger.error('❌ Erreur lors de l\'invalidation des sessions expirées:', error);
  }
}
