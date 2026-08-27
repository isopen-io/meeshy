import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { NotificationService } from '../services/notifications/NotificationService';
import { enhancedLogger } from '../utils/logger-enhanced';
import { buildBroadcastRecipientFilter, localizedBroadcastText, type BroadcastTargeting } from './broadcast-recipients';
import {
  RECIPIENT_LANG_SELECT,
  recipientLanguage,
  recipientLanguages,
  type RecipientLanguagePrefs,
} from '../utils/recipient-language';

const logger = enhancedLogger.child({ module: 'BroadcastInAppSenderJob' });

const SENDABLE_STATUSES: ReadonlySet<string> = new Set(['READY', 'SENT']);

type InAppNotifier = Pick<NotificationService, 'createSystemNotification'>;

type Tally = { readonly sent: number; readonly failed: number };

/**
 * Canal IN-APP d'une diffusion admin : une notification système « annonce »
 * par compte ciblé, dans la langue du destinataire, livrée par
 * `NotificationService.createSystemNotification` — donc `notification:new`
 * (toast web/iOS), compteurs, push APNs/FCM, sans rien réinventer.
 *
 * Indépendant du canal e-mail (`BroadcastSenderJob`) : il ne touche ni
 * `status` ni `sentCount`, et s'accumule sur une diffusion déjà envoyée
 * (`SENT`). Les traductions doivent être prêtes (`READY` ou `SENT`).
 */
export class BroadcastInAppSenderJob {
  private readonly BATCH_SIZE = 100;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly notifications: InAppNotifier,
  ) {}

  async execute(broadcastId: string): Promise<void> {
    try {
      const broadcast = await this.prisma.adminBroadcast.findUnique({ where: { id: broadcastId } });
      if (!broadcast || !SENDABLE_STATUSES.has(broadcast.status)) {
        logger.error(`Broadcast ${broadcastId} not found or translations not ready (status=${broadcast?.status ?? 'none'})`);
        return;
      }

      const filter = buildBroadcastRecipientFilter((broadcast.targeting ?? {}) as BroadcastTargeting);
      const totalRecipients = await this.prisma.user.count({ where: filter });
      const translatedSubjects = broadcast.translatedSubjects as Record<string, string> | null;
      const translatedBodies = broadcast.translatedBodies as Record<string, string> | null;

      const deliverTo = async (user: { id: string } & RecipientLanguagePrefs): Promise<boolean | null> => {
        // Deux rôles distincts pour la langue :
        //  - CADRAGE (`lang` de la notification) = le rang le plus haut RENSEIGNÉ ;
        //  - CONTENU (titre/corps) = la DESCENTE ORDONNÉE du Prisme, servie par
        //    `localizedBroadcastText` (SSOT `resolvePrismTranslation`). Les clés
        //    de `translatedSubjects`/`translatedBodies` et les rangs du lecteur y
        //    sont canonicalisées ensemble : un `'pt-BR'` atteint la traduction
        //    `pt`, et un rang 1 sans traduction laisse gagner un rang inférieur.
        const framingLang = recipientLanguage(user, 'en');
        const preferredLanguages = recipientLanguages(user);
        try {
          const created = await this.notifications.createSystemNotification({
            recipientUserId: user.id,
            title: localizedBroadcastText({ translated: translatedSubjects, sourceLanguage: broadcast.sourceLanguage, original: broadcast.subject, preferredLanguages }),
            content: localizedBroadcastText({ translated: translatedBodies, sourceLanguage: broadcast.sourceLanguage, original: broadcast.body, preferredLanguages }),
            systemType: 'announcement',
            priority: 'normal',
            lang: framingLang,
          });
          return created === null ? null : true;
        } catch (error) {
          logger.warn(`In-app broadcast ${broadcastId} failed for user ${user.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          return false;
        }
      };

      let tally: Tally = { sent: 0, failed: 0 };
      for (let skip = 0; skip < totalRecipients; skip += this.BATCH_SIZE) {
        const users = await this.prisma.user.findMany({
          where: filter,
          select: { id: true, ...RECIPIENT_LANG_SELECT },
          skip,
          take: this.BATCH_SIZE,
          orderBy: { createdAt: 'asc' },
        });
        if (users.length === 0) break;

        const outcomes = await Promise.all(users.map(deliverTo));
        tally = outcomes.reduce<Tally>((acc, outcome) => ({
          sent: acc.sent + (outcome === true ? 1 : 0),
          failed: acc.failed + (outcome === false ? 1 : 0),
        }), tally);

        await this.prisma.adminBroadcast.update({
          where: { id: broadcastId },
          data: { inAppSentCount: tally.sent, inAppFailedCount: tally.failed },
        });
      }

      await this.prisma.adminBroadcast.update({
        where: { id: broadcastId },
        data: { inAppSentCount: tally.sent, inAppFailedCount: tally.failed, inAppCompletedAt: new Date() },
      });
      logger.info(`In-app broadcast ${broadcastId} completed: ${tally.sent} delivered, ${tally.failed} failed, ${totalRecipients} targeted`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`In-app broadcast job ${broadcastId} crashed: ${msg}`);
      await this.prisma.adminBroadcast.update({
        where: { id: broadcastId },
        data: { inAppCompletedAt: new Date(), errorMessage: msg },
      }).catch(() => {});
    }
  }
}
