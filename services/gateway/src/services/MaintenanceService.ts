/**
 * Service de maintenance pour Meeshy
 * Gestion des tâches de maintenance automatiques
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import { logger } from '../utils/logger';
import { AttachmentService } from './attachments';
import { EmailService } from './EmailService';

export class MaintenanceService {
  private prisma: PrismaClient;
  private attachmentService: AttachmentService;
  private maintenanceInterval: NodeJS.Timeout | null = null;
  private dailyCleanupInterval: NodeJS.Timeout | null = null;
  // ✅ FIX BUG #1: Aligner avec getUserStatus() - 30 minutes pour offline
  // Permet l'état "away" (5-30 min) de fonctionner correctement
  private readonly OFFLINE_THRESHOLD_MINUTES = 30; // 30 minutes d'inactivité = hors ligne (cohérent avec getUserStatus)
  private readonly ORPHANED_ATTACHMENT_THRESHOLD_HOURS = 24; // 24 heures avant suppression des attachments orphelins
  private statusBroadcastCallback: ((userId: string, isOnline: boolean, isAnonymous: boolean) => void) | null = null;
  private lastDailyCleanup: Date | null = null;

  private emailService?: EmailService;

  constructor(prisma: PrismaClient, attachmentService: AttachmentService, emailService?: EmailService) {
    this.prisma = prisma;
    this.attachmentService = attachmentService;
    this.emailService = emailService;
  }

  /**
   * Définir une callback pour broadcaster les changements de statut
   */
  setStatusBroadcastCallback(callback: (userId: string, isOnline: boolean, isAnonymous: boolean) => void): void {
    this.statusBroadcastCallback = callback;
  }

  /**
   * Démarrer les tâches de maintenance
   */
  async startMaintenanceTasks(): Promise<void> {
    logger.info('🚀 Démarrage des tâches de maintenance...');

    // Reset all stale online statuses from previous instance
    try {
      const [resetUsers, resetAnon] = await Promise.all([
        this.prisma.user.updateMany({
          where: { isOnline: true },
          data: { isOnline: false }
        }),
        this.prisma.anonymousParticipant.updateMany({
          where: { isOnline: true },
          data: { isOnline: false }
        })
      ]);
      logger.info(`🔄 Reset presence: ${resetUsers.count} users, ${resetAnon.count} anonymous`);
    } catch (error) {
      logger.error('❌ Failed to reset stale presence on startup:', error);
    }

    // OPTIMISATION: Tâche de maintenance pour l'état en ligne/hors ligne (toutes les 15 secondes)
    // Ancien: 60000ms (60s) -> Nouveau: 15000ms (15s) = 4x plus rapide
    this.maintenanceInterval = setInterval(async () => {
      logger.debug('🔄 Exécution de la tâche de maintenance automatique...');
      await this.updateOfflineUsers();
    }, 15000); // Vérifier toutes les 15 secondes (4x plus rapide)

    // Tâche de nettoyage journalier (toutes les heures, mais ne s'exécute qu'une fois par jour)
    this.dailyCleanupInterval = setInterval(async () => {
      await this.runDailyCleanup();
    }, 60 * 60 * 1000); // Vérifier toutes les heures

    // Exécuter immédiatement le nettoyage journalier au démarrage
    await this.runDailyCleanup();

    logger.info('✅ Tâches de maintenance démarrées (intervalle: 15s pour statuts, 1h pour nettoyage journalier)');
  }

  /**
   * Arrêter les tâches de maintenance
   */
  stopMaintenanceTasks(): void {
    if (this.maintenanceInterval) {
      clearInterval(this.maintenanceInterval);
      this.maintenanceInterval = null;
    }
    if (this.dailyCleanupInterval) {
      clearInterval(this.dailyCleanupInterval);
      this.dailyCleanupInterval = null;
    }
    logger.info('🛑 Tâches de maintenance arrêtées');
  }

  /**
   * Mettre à jour les utilisateurs hors ligne basé sur leur dernière activité
   */
  private async updateOfflineUsers(): Promise<void> {
    try {
      const offlineThreshold = new Date();
      offlineThreshold.setMinutes(offlineThreshold.getMinutes() - this.OFFLINE_THRESHOLD_MINUTES);

      // Trouver tous les utilisateurs marqués comme en ligne mais inactifs depuis plus de 30 minutes
      const inactiveUsers = await this.prisma.user.findMany({
        where: {
          isOnline: true,
          lastActiveAt: {
            lt: offlineThreshold
          },
          isActive: true
        },
        select: {
          id: true,
          username: true,
          lastActiveAt: true
        }
      });

      if (inactiveUsers.length > 0) {
        await this.prisma.user.updateMany({
          where: {
            id: {
              in: inactiveUsers.map(user => user.id)
            }
          },
          data: {
            isOnline: false
          }
        });

        // Broadcaster le changement pour que les clients mettent à jour leur UI
        if (this.statusBroadcastCallback) {
          for (const u of inactiveUsers) {
            this.statusBroadcastCallback(u.id, false, false);
          }
        }

        logger.warn(`🔄 [CLEANUP] ${inactiveUsers.length} utilisateurs marqués comme hors ligne (inactifs depuis >${this.OFFLINE_THRESHOLD_MINUTES}min)`, {
          users: inactiveUsers.map(u => ({
            id: u.id,
            username: u.username,
            lastActiveAt: u.lastActiveAt,
            inactiveMinutes: Math.floor((Date.now() - u.lastActiveAt.getTime()) / 60000)
          }))
        });
      } else {
        logger.debug(`✅ [CLEANUP] Aucun utilisateur inactif à nettoyer`);
      }

      // CORRECTION: Gérer également les participants anonymes inactifs
      const inactiveAnonymous = await this.prisma.anonymousParticipant.findMany({
        where: {
          isOnline: true,
          lastActiveAt: {
            lt: offlineThreshold
          },
          isActive: true
        },
        select: {
          id: true,
          username: true,
          lastActiveAt: true
        }
      });

      if (inactiveAnonymous.length > 0) {
        await this.prisma.anonymousParticipant.updateMany({
          where: {
            id: {
              in: inactiveAnonymous.map(participant => participant.id)
            }
          },
          data: {
            isOnline: false
          }
        });

        // Broadcaster le changement pour que les clients mettent à jour leur UI
        if (this.statusBroadcastCallback) {
          for (const p of inactiveAnonymous) {
            this.statusBroadcastCallback(p.id, false, true);
          }
        }

        logger.warn(`🔄 [CLEANUP] ${inactiveAnonymous.length} participants anonymes marqués comme hors ligne (inactifs depuis >${this.OFFLINE_THRESHOLD_MINUTES}min)`, {
          participants: inactiveAnonymous.map(p => ({
            id: p.id,
            username: p.username,
            lastActiveAt: p.lastActiveAt,
            inactiveMinutes: Math.floor((Date.now() - p.lastActiveAt.getTime()) / 60000)
          }))
        });
      } else {
        logger.debug(`✅ [CLEANUP] Aucun participant anonyme inactif à nettoyer`);
      }
    } catch (error) {
      logger.error('❌ Erreur lors de la mise à jour des utilisateurs hors ligne:', error);
    }
  }

  /**
   * Mettre à jour manuellement l'état en ligne/hors ligne d'un utilisateur
   */
  async updateUserOnlineStatus(userId: string, isOnline: boolean, broadcast: boolean = false): Promise<void> {
    try {
      // lastActiveAt mis à jour uniquement à la connexion (= opération utilisateur réelle)
      // À la déconnexion, on garde le dernier lastActiveAt pour que le calcul
      // VERT→ORANGE→GRIS reflète la vraie dernière activité
      const updateData: { isOnline: boolean; lastActiveAt?: Date } = { isOnline };
      if (isOnline) {
        updateData.lastActiveAt = new Date();
      }

      await this.prisma.user.update({
        where: { id: userId },
        data: updateData
      });

      logger.info(`👤 Statut utilisateur ${userId} mis à jour: ${isOnline ? 'en ligne' : 'hors ligne'}`);

      if (broadcast && this.statusBroadcastCallback) {
        this.statusBroadcastCallback(userId, isOnline, false);
      }
    } catch (error) {
      logger.error(`❌ Erreur lors de la mise à jour du statut de l'utilisateur ${userId}:`, error);
    }
  }

  /**
   * ✅ FIX BUG #2: Mettre à jour lastActiveAt sans changer isOnline
   * Appelé lors d'activités: typing, envoi de message, etc.
   * Permet de garder l'utilisateur "online" (vert) tant qu'il est actif
   */
  async updateUserLastActive(userId: string, isAnonymous: boolean = false): Promise<void> {
    try {
      if (isAnonymous) {
        await this.prisma.anonymousParticipant.update({
          where: { id: userId },
          data: {
            lastActiveAt: new Date()
          }
        });
      } else {
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            lastActiveAt: new Date()
          }
        });
      }

      logger.debug(`⏱️  LastActive mis à jour pour ${isAnonymous ? 'participant anonyme' : 'utilisateur'} ${userId}`);
    } catch (error) {
      // Ne pas logger en erreur car ce n'est pas critique
      logger.debug(`⚠️  Erreur mise à jour lastActive pour ${userId}:`, error);
    }
  }

  /**
   * Mettre à jour manuellement l'état en ligne/hors ligne d'un participant anonyme
   */
  async updateAnonymousOnlineStatus(participantId: string, isOnline: boolean, broadcast: boolean = false): Promise<void> {
    try {
      const updateData: { isOnline: boolean; lastActiveAt?: Date } = { isOnline };
      if (isOnline) {
        updateData.lastActiveAt = new Date();
      }

      await this.prisma.anonymousParticipant.update({
        where: { id: participantId },
        data: updateData
      });

      logger.info(`👤 Statut participant anonyme ${participantId} mis à jour: ${isOnline ? 'en ligne' : 'hors ligne'}`);

      if (broadcast && this.statusBroadcastCallback) {
        this.statusBroadcastCallback(participantId, isOnline, true);
      }
    } catch (error) {
      logger.error(`❌ Erreur lors de la mise à jour du statut du participant anonyme ${participantId}:`, error);
    }
  }

  /**
   * Exécuter les tâches de nettoyage journalier
   * Ne s'exécute qu'une fois par jour (entre 2h et 3h du matin)
   */
  private async runDailyCleanup(): Promise<void> {
    const now = new Date();
    const currentHour = now.getHours();

    // Vérifier si on est dans la fenêtre de nettoyage (2h-3h du matin)
    const isInCleanupWindow = currentHour >= 2 && currentHour < 3;

    // Vérifier si le nettoyage a déjà été fait aujourd'hui
    const lastCleanupDate = this.lastDailyCleanup?.toDateString();
    const todayDate = now.toDateString();
    const alreadyRunToday = lastCleanupDate === todayDate;

    if (isInCleanupWindow && !alreadyRunToday) {
      logger.info('🧹 [DAILY CLEANUP] Démarrage du nettoyage journalier...');

      try {
        // Nettoyer les attachments orphelins
        await this.cleanupOrphanedAttachments();

        // Nettoyer les messages vides sans contenu ni attachement
        await this.cleanupEmptyMessages();

        // Nettoyer les sessions et données expirées
        await this.cleanupExpiredData();

        // Traiter les demandes de suppression de compte
        await this.processAccountDeletionRequests();

        this.lastDailyCleanup = now;
        logger.info('✅ [DAILY CLEANUP] Nettoyage journalier terminé avec succès');
      } catch (error) {
        logger.error('❌ [DAILY CLEANUP] Erreur lors du nettoyage journalier:', error);
      }
    } else if (!isInCleanupWindow && !alreadyRunToday) {
      logger.debug(`⏰ [DAILY CLEANUP] En attente de la fenêtre de nettoyage (2h-3h), heure actuelle: ${currentHour}h`);
    }
  }

  /**
   * Nettoyer les attachments orphelins
   * Supprime les attachments qui ne sont pas liés à un message et qui ont plus de 24h
   */
  private async cleanupOrphanedAttachments(): Promise<void> {
    try {
      logger.info('🧹 [CLEANUP] Démarrage du nettoyage des attachments orphelins...');

      const orphanedThreshold = new Date();
      orphanedThreshold.setHours(orphanedThreshold.getHours() - this.ORPHANED_ATTACHMENT_THRESHOLD_HOURS);

      // Trouver tous les attachments qui :
      // 1. Ne sont pas liés à un message (messageId null)
      // 2. Ont été créés il y a plus de 24 heures
      const orphanedAttachments = await this.prisma.messageAttachment.findMany({
        where: {
          messageId: null,
          createdAt: {
            lt: orphanedThreshold
          }
        },
        select: {
          id: true,
          originalName: true,
          fileSize: true,
          createdAt: true,
          uploadedBy: true
        }
      });

      if (orphanedAttachments.length === 0) {
        logger.info('✅ [CLEANUP] Aucun attachment orphelin trouvé');
        return;
      }

      logger.info(`🗑️  [CLEANUP] ${orphanedAttachments.length} attachments orphelins trouvés, suppression en cours...`);

      let successCount = 0;
      let failCount = 0;
      let totalSize = 0;

      for (const attachment of orphanedAttachments) {
        try {
          await this.attachmentService.deleteAttachment(attachment.id);
          successCount++;
          totalSize += attachment.fileSize;

          logger.debug(`🗑️  [CLEANUP] Attachment supprimé: ${attachment.originalName} (${attachment.fileSize} bytes, créé le ${attachment.createdAt.toISOString()})`);
        } catch (error) {
          failCount++;
          logger.error(`❌ [CLEANUP] Erreur suppression attachment ${attachment.id}:`, error);
        }
      }

      const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
      logger.info(`✅ [CLEANUP] Nettoyage terminé: ${successCount} attachments supprimés (${totalSizeMB} MB libérés), ${failCount} échecs`);

    } catch (error) {
      logger.error('❌ [CLEANUP] Erreur lors du nettoyage des attachments orphelins:', error);
    }
  }

  /**
   * Nettoyer les messages vides (pas de contenu et pas d'attachement)
   * Ces messages fantômes peuvent apparaître suite à des envois interrompus
   * ou des suppressions partielles d'attachements
   */
  private async cleanupEmptyMessages(): Promise<void> {
    try {
      logger.info('🧹 [CLEANUP] Démarrage du nettoyage des messages vides...');

      const staleThreshold = new Date();
      staleThreshold.setHours(staleThreshold.getHours() - this.ORPHANED_ATTACHMENT_THRESHOLD_HOURS);

      // Trouver les messages vides via MongoDB raw query :
      // content whitespace-only ($regex), pas de soft-delete, >24h,
      // et pas d'attachements liés (lookup + match vide)
      const emptyMessageIds = await this.prisma.message.findRaw({
        filter: {
          content: { $regex: '^\\s*$' },
          deletedAt: null,
          createdAt: { $lt: { $date: staleThreshold.toISOString() } },
        },
        options: {
          projection: { _id: 1 },
        },
      }) as unknown as Array<{ _id: { $oid: string } }>;

      if (!emptyMessageIds.length) {
        logger.info('✅ [CLEANUP] Aucun message vide trouvé');
        return;
      }

      const candidateIds = emptyMessageIds.map(m => m._id.$oid);

      // Filtrer ceux qui ont des attachements (relation MessageAttachment.messageId)
      const withAttachments = await this.prisma.messageAttachment.findMany({
        where: { messageId: { in: candidateIds } },
        select: { messageId: true },
        distinct: ['messageId'],
      });

      const attachedSet = new Set(withAttachments.map(a => a.messageId).filter(Boolean));
      const toDelete = candidateIds.filter(id => !attachedSet.has(id));

      if (toDelete.length === 0) {
        logger.info('✅ [CLEANUP] Aucun message vide sans attachement trouvé');
        return;
      }

      logger.info(`🗑️  [CLEANUP] ${toDelete.length} messages vides trouvés, soft-delete en cours...`);

      const result = await this.prisma.message.updateMany({
        where: { id: { in: toDelete } },
        data: { deletedAt: new Date() },
      });

      logger.info(`✅ [CLEANUP] ${result.count} messages vides soft-deleted`);
    } catch (error) {
      logger.error('❌ [CLEANUP] Erreur lors du nettoyage des messages vides:', error);
    }
  }

  /**
   * Nettoyer les sessions expirées et les données temporaires
   */
  async cleanupExpiredData(): Promise<void> {
    try {
      // Nettoyer les sessions anonymes expirées (plus de 24h)
      const expiredAnonymousSessions = await this.prisma.anonymousParticipant.deleteMany({
        where: {
          lastActiveAt: {
            lt: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 heures
          }
        }
      });

      if (expiredAnonymousSessions.count > 0) {
        logger.info(`🧹 ${expiredAnonymousSessions.count} sessions anonymes expirées supprimées`);
      }

      // Nettoyer les liens de partage expirés (plus de 7 jours)
      const expiredShareLinks = await this.prisma.conversationShareLink.deleteMany({
        where: {
          expiresAt: {
            lt: new Date()
          }
        }
      });

      if (expiredShareLinks.count > 0) {
        logger.info(`🧹 ${expiredShareLinks.count} liens de partage expirés supprimés`);
      }

    } catch (error) {
      logger.error('❌ Erreur lors du nettoyage des données expirées:', error);
    }
  }

  /**
   * Traiter les demandes de suppression de compte :
   * 1. Expirer les grace periods terminées (CONFIRMED -> GRACE_PERIOD_EXPIRED)
   * 2. Envoyer les rappels hebdomadaires pour les requests GRACE_PERIOD_EXPIRED
   */
  private async processAccountDeletionRequests(): Promise<void> {
    try {
      const now = new Date();

      // 1. Expiration des grace periods
      const expiredRequests = await this.prisma.accountDeletionRequest.findMany({
        where: {
          status: 'CONFIRMED',
          gracePeriodEndsAt: { lt: now }
        }
      });

      if (expiredRequests.length > 0) {
        let expiredCount = 0;
        for (const req of expiredRequests) {
          try {
            await this.prisma.$transaction([
              this.prisma.accountDeletionRequest.update({
                where: { id: req.id },
                data: { status: 'GRACE_PERIOD_EXPIRED' }
              }),
              this.prisma.user.update({
                where: { id: req.userId },
                data: { isActive: false, deletedAt: new Date() }
              })
            ]);
            expiredCount++;
          } catch (error) {
            logger.error(`❌ [DELETION] Failed to expire request=${req.id} for user=${req.userId}:`, error);
          }
        }
        logger.info(`🗑️  [DELETION] ${expiredCount}/${expiredRequests.length} grace periods expired`);
      }

      // 2. Rappels hebdomadaires
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const reminderRequests = await this.prisma.accountDeletionRequest.findMany({
        where: {
          status: 'GRACE_PERIOD_EXPIRED',
          OR: [
            { lastReminderAt: null },
            { lastReminderAt: { lt: sevenDaysAgo } }
          ]
        },
        include: {
          user: {
            select: { email: true, displayName: true, firstName: true, systemLanguage: true }
          }
        }
      });

      if (reminderRequests.length > 0 && this.emailService) {
        for (const req of reminderRequests) {
          try {
            const user = req.user;
            if (!user?.email) continue;

            const name = user.displayName || user.firstName || 'Utilisateur';
            const baseUrl = process.env.GATEWAY_URL || process.env.API_URL || 'https://gate.meeshy.me';

            // We need the raw tokens to build links, but we only store hashes.
            // The reminder email uses confirmTokenHash for delete-now and cancelTokenHash for cancel.
            // Since we can't reverse hashes, we pass the hash directly — the links will use a
            // special hash-based lookup. Actually, the routes expect raw tokens that get hashed.
            // So for reminders, we generate new tokens and update the hashes.
            const crypto = await import('crypto');
            const newConfirmToken = crypto.randomBytes(32).toString('base64url');
            const newCancelToken = crypto.randomBytes(32).toString('base64url');
            const newConfirmHash = crypto.createHash('sha256').update(newConfirmToken).digest('hex');
            const newCancelHash = crypto.createHash('sha256').update(newCancelToken).digest('hex');

            await this.prisma.accountDeletionRequest.update({
              where: { id: req.id },
              data: {
                confirmTokenHash: newConfirmHash,
                cancelTokenHash: newCancelHash,
                lastReminderAt: now,
                reminderCount: { increment: 1 },
              }
            });

            const deleteNowLink = `${baseUrl}/api/v1/me/delete-account/delete-now?token=${newConfirmToken}`;
            const cancelLink = `${baseUrl}/api/v1/me/delete-account/cancel?token=${newCancelToken}`;
            const gracePeriodEndDate = req.gracePeriodEndsAt
              ? req.gracePeriodEndsAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
              : 'N/A';

            await this.emailService.sendAccountDeletionReminderEmail({
              to: user.email,
              name,
              deleteNowLink,
              cancelLink,
              gracePeriodEndDate,
              language: user.systemLanguage || 'en',
            });

            logger.info(`📧 [DELETION] Reminder sent to user=${req.userId} (reminder #${req.reminderCount + 1})`);
          } catch (error) {
            logger.error(`❌ [DELETION] Failed to send reminder for request=${req.id}:`, error);
          }
        }
      }

      if (expiredRequests.length === 0 && reminderRequests.length === 0) {
        logger.debug('✅ [DELETION] No account deletion requests to process');
      }
    } catch (error) {
      logger.error('❌ [DELETION] Error processing account deletion requests:', error);
    }
  }

  /**
   * Obtenir les statistiques de maintenance
   */
  async getMaintenanceStats(): Promise<any> {
    try {
      const [onlineUsers, totalUsers, anonymousSessions, onlineAnonymous] = await Promise.all([
        this.prisma.user.count({
          where: { isOnline: true, isActive: true }
        }),
        this.prisma.user.count({
          where: { isActive: true }
        }),
        this.prisma.anonymousParticipant.count({
          where: { isActive: true }
        }),
        this.prisma.anonymousParticipant.count({
          where: { isOnline: true, isActive: true }
        })
      ]);

      const maintenanceActive = this.maintenanceInterval !== null;
      logger.info(`📊 Statistiques de maintenance - Maintenance active: ${maintenanceActive}, Utilisateurs en ligne: ${onlineUsers}/${totalUsers}, Anonymes en ligne: ${onlineAnonymous}/${anonymousSessions}`);

      return {
        onlineUsers,
        totalUsers,
        anonymousSessions,
        onlineAnonymous,
        offlineThresholdMinutes: this.OFFLINE_THRESHOLD_MINUTES,
        maintenanceActive
      };
    } catch (error) {
      logger.error('❌ Erreur lors de la récupération des statistiques de maintenance:', error);
      return null;
    }
  }
}
