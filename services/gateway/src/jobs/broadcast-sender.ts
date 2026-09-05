import { PrismaClient } from '@meeshy/shared/prisma/client';
import { EmailService } from '../services/EmailService';
import { enhancedLogger } from '../utils/logger-enhanced';
import { buildBroadcastRecipientFilter, localizedBroadcastText, type BroadcastTargeting } from './broadcast-recipients';
import { RECIPIENT_LANG_SELECT, recipientLanguage, recipientLanguages } from '../utils/recipient-language';

const logger = enhancedLogger.child({ module: 'BroadcastSenderJob' });

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class BroadcastSenderJob {
  private BATCH_SIZE = 50;
  private BATCH_DELAY_MS = 1000;
  private prisma: PrismaClient;
  private emailService: EmailService;

  constructor(prisma: PrismaClient, emailService: EmailService) {
    this.prisma = prisma;
    this.emailService = emailService;
  }

  async execute(broadcastId: string): Promise<void> {
    try {
      const broadcast = await this.prisma.adminBroadcast.findUnique({ where: { id: broadcastId } });
      if (!broadcast || broadcast.status !== 'SENDING') {
        logger.error(`Broadcast ${broadcastId} not found or not in SENDING status`);
        return;
      }

      const filter = await this.buildRecipientFilter(broadcast.targeting as any);

      // Count total recipients
      const totalRecipients = await this.prisma.user.count({ where: filter });
      await this.prisma.adminBroadcast.update({
        where: { id: broadcastId },
        data: { totalRecipients },
      });

      if (totalRecipients === 0) {
        await this.prisma.adminBroadcast.update({
          where: { id: broadcastId },
          data: { status: 'SENT', completedAt: new Date() },
        });
        return;
      }

      const translatedSubjects = (broadcast.translatedSubjects as Record<string, string>) || {};
      const translatedBodies = (broadcast.translatedBodies as Record<string, string>) || {};
      const frontendUrl = process.env.FRONTEND_URL || 'https://meeshy.me';

      let sentCount = 0;
      let failedCount = 0;
      let skip = 0;

      while (skip < totalRecipients) {
        const users = await this.prisma.user.findMany({
          where: filter,
          select: {
            id: true,
            email: true,
            displayName: true,
            username: true,
            ...RECIPIENT_LANG_SELECT,
          },
          skip,
          take: this.BATCH_SIZE,
          orderBy: { createdAt: 'asc' },
        });

        if (users.length === 0) break;

        for (const user of users) {
          // Check email preferences
          try {
            const prefs = await this.prisma.userPreferences.findUnique({
              where: { userId: user.id },
              select: { notification: true },
            });
            const notifPrefs = prefs?.notification as any;
            if (notifPrefs?.emailEnabled === false) {
              continue; // Skip users who opted out
            }
          } catch {
            // If no preferences found, proceed with sending
          }

          // Deux rôles distincts pour la langue, comme le canal IN-APP :
          //  - CADRAGE (`language` de l'e-mail) = le rang le plus haut RENSEIGNÉ ;
          //  - CONTENU (sujet/corps) = la DESCENTE ORDONNÉE du Prisme.
          // Les deux voix d'une diffusion ne peuvent pas élire des langues
          // différentes pour un même destinataire : `localizedBroadcastText`
          // route par la même SSOT (`resolvePrismTranslation`).
          const framingLang = recipientLanguage(user, 'en');
          const preferredLanguages = recipientLanguages(user);
          const localized = (translated: Record<string, string>, original: string) =>
            localizedBroadcastText({
              translated,
              sourceLanguage: broadcast.sourceLanguage,
              original,
              preferredLanguages,
            });
          const subject = localized(translatedSubjects, broadcast.subject);
          const body = localized(translatedBodies, broadcast.body);
          const recipientName = user.displayName || user.username || 'User';
          const unsubscribeUrl = `${frontendUrl}/settings/notifications`;

          try {
            const result = await this.emailService.sendBroadcastEmail({
              to: user.email,
              recipientName,
              subject,
              body,
              language: framingLang,
              unsubscribeUrl,
            });

            if (result.success) {
              sentCount++;
            } else {
              failedCount++;
              logger.warn(`Failed to send broadcast to ${user.email}: ${result.error}`);
            }
          } catch (error) {
            failedCount++;
            const msg = error instanceof Error ? error.message : 'Unknown error';
            logger.error(`Exception sending broadcast to ${user.email}: ${msg}`);
          }
        }

        skip += this.BATCH_SIZE;

        // Update progress in DB
        await this.prisma.adminBroadcast.update({
          where: { id: broadcastId },
          data: { sentCount, failedCount },
        });

        // Delay between batches
        if (skip < totalRecipients) {
          await sleep(this.BATCH_DELAY_MS);
        }
      }

      // Final update
      const finalStatus = failedCount > 0 && sentCount === 0 ? 'FAILED' : 'SENT';
      await this.prisma.adminBroadcast.update({
        where: { id: broadcastId },
        data: {
          status: finalStatus,
          sentCount,
          failedCount,
          completedAt: new Date(),
          ...(finalStatus === 'FAILED' ? { errorMessage: `All ${failedCount} emails failed` } : {}),
        },
      });

      logger.info(`Broadcast ${broadcastId} completed: ${sentCount} sent, ${failedCount} failed`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Broadcast job ${broadcastId} crashed: ${msg}`);
      await this.prisma.adminBroadcast.update({
        where: { id: broadcastId },
        data: {
          status: 'FAILED',
          errorMessage: msg,
          completedAt: new Date(),
        },
      }).catch(() => {});
    }
  }

  /** Ciblage commun (`buildBroadcastRecipientFilter`) + contrainte du canal : une adresse vérifiée. */
  private async buildRecipientFilter(targeting: BroadcastTargeting): Promise<any> {
    return { ...(await buildBroadcastRecipientFilter(this.prisma, targeting)), emailVerifiedAt: { not: null } };
  }
}
