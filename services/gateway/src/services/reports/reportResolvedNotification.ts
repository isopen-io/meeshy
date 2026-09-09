import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { reportResolvedStrings } from '@meeshy/shared/utils/report-resolved-strings';
import type { GenericNotificationMetadata } from '@meeshy/shared/types/notification';
import { getSharedNotificationService } from '../notifications/notification-service-registry';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'ReportResolvedNotification' });

const TERMINAL_REPORT_STATUSES = new Set(['resolved', 'rejected', 'dismissed']);

/**
 * #3718 — art. 16 DSA : informer le déclarant de la décision une fois le
 * signalement TERMINÉ. Vrai seulement au moment où le statut BASCULE dans un
 * état terminal — pas à chaque relecture d'un signalement déjà résolu (un
 * modérateur qui édite `moderatorNotes` sans changer le statut, ou qui repose
 * le même statut terminal, ne doit pas renotifier le déclarant).
 */
export function isNewlyResolvedReportTransition(previousStatus: string, nextStatus: string): boolean {
  return TERMINAL_REPORT_STATUSES.has(nextStatus) && previousStatus !== nextStatus;
}

export interface ResolvedReport {
  readonly id: string;
  readonly reporterId: string | null;
  readonly reportedType: string;
  readonly reportType: string;
  readonly status: 'resolved' | 'rejected' | 'dismissed';
  readonly actionTaken?: string | null;
}

/**
 * Notifie le déclarant d'un signalement qu'une décision a été prise —
 * jamais pour un déclarant ANONYME (`reporterId` nul : `Report.reporterId`
 * est nullable, aucun compte à notifier). Best-effort et fail-CLOSED sur
 * l'échec : une notification manquée se rattrape, un signalement qui échoue
 * à se mettre à jour à cause d'un canal secondaire ne se rattrape pas — cette
 * fonction ne lève donc jamais et n'est appelée qu'APRÈS l'écriture du
 * signalement.
 */
export async function notifyReportResolved(prisma: PrismaClient, report: ResolvedReport): Promise<void> {
  if (!report.reporterId) return;

  try {
    const outcome = report.status;
    const hasActionTaken = outcome === 'resolved' && !!report.actionTaken && report.actionTaken !== 'none';

    const reporter = await prisma.user.findUnique({
      where: { id: report.reporterId },
      select: RECIPIENT_LANG_SELECT,
    });
    const lang = recipientLanguage(reporter, 'fr');
    const { title, content } = reportResolvedStrings(lang, hasActionTaken);

    const metadata: GenericNotificationMetadata = {
      reportedType: report.reportedType,
      reportType: report.reportType,
      outcome,
      actionTaken: report.actionTaken ?? null,
      action: 'view_details',
    };

    await getSharedNotificationService()?.createNotification({
      userId: report.reporterId,
      type: 'report_resolved',
      priority: 'normal',
      content,
      title,
      context: {},
      metadata,
    });
  } catch (error) {
    logger.error('Failed to notify reporter of report resolution', error as Error, {
      reportId: report.id,
    });
  }
}
