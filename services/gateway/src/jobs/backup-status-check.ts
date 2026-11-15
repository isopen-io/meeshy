/**
 * LE CONTRÔLE DE LA SAUVEGARDE NOCTURNE — UNE FOIS PAR JOUR, À 5 H, HEURE DE
 * PARIS (#9668, décision porteur du 2026-10-08 : « tous les jours à 5 h, pas
 * toutes les heures »).
 *
 * Ni intervalle ni sondage : une minuterie unique est armée sur le prochain
 * 5 h de Paris (`nextParisTime`, changements d'heure compris), puis réarmée
 * sur le suivant après chaque contrôle. Un redémarrage n'en déclenche aucun :
 * il réarme sur le prochain 5 h.
 *
 * Le contrôle lui-même — règle d'alerte, dédoublonnage par `SET NX`,
 * rétablissement — est `runBackupStatusCheck` (`services/admin/backup-alert.ts`) ;
 * ce fichier le BRANCHE : le verdict monté, le magasin partagé (Redis), les
 * comptes ADMIN et BIGBOSS lus en base, la notification système et l'e-mail.
 *
 * Désactivé (`BACKUP_STATUS_ALERTS_ENABLED` différent de `true`), le job ne
 * s'arme même pas.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  isBackupStatusAlertsEnabled,
  runBackupStatusCheck,
  type BackupAlertMessage,
  type BackupAlertRecipient,
  type BackupAlertStore,
  type BackupCheckReport,
} from '../services/admin/backup-alert';
import { BACKUP_CHECK_HOUR, backupStatusFile, nextParisTime, readBackupVerdict, type BackupVerdict } from '../services/admin/backup-status';
import { getCacheStore } from '../services/CacheStore';
import type { EmailService } from '../services/EmailService';
import { backupAlertText } from '../services/email/backup-alert-email';
import { NotificationService } from '../services/notifications/NotificationService';
import { getSharedNotificationService } from '../services/notifications/notification-service-registry';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { guardedTimeout } from '../utils/guarded-timer.js';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../utils/recipient-language';

const logger = enhancedLogger.child({ module: 'BackupStatusCheckJob' });

/** Une minuterie qui se déclencherait un rien trop tôt ne doit pas réarmer sur le MÊME 5 h. */
const REARM_MARGIN_MS = 60 * 1000;
const RECIPIENT_CAP = 500;

type Notifier = Pick<NotificationService, 'createSystemNotification'>;
type Mailer = Pick<EmailService, 'sendBackupAlertEmail'>;

export type BackupStatusCheckJobDeps = {
  readonly prisma: PrismaClient;
  readonly emailService: Mailer;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly now?: () => Date;
  readonly store?: () => BackupAlertStore;
  readonly notifier?: () => Notifier;
  readonly readVerdict?: () => Promise<BackupVerdict | null>;
};

/** Le prochain contrôle : 5 h, heure de Paris, strictement après `now`. */
export const nextBackupCheckAt = (now: Date): Date => nextParisTime(now, BACKUP_CHECK_HOUR);

export async function loadBackupAlertRecipients(prisma: PrismaClient): Promise<readonly BackupAlertRecipient[]> {
  const users = await prisma.user.findMany({
    where: { role: { in: ['BIGBOSS', 'ADMIN'] }, isActive: true },
    select: { id: true, role: true, email: true, username: true, displayName: true, deletedAt: true, ...RECIPIENT_LANG_SELECT },
    take: RECIPIENT_CAP,
  });
  return users
    .filter((user) => !user.deletedAt)
    .map((user) => ({
      id: user.id,
      role: user.role,
      email: user.email?.trim() ? user.email.trim() : null,
      name: user.displayName?.trim() || user.username,
      language: recipientLanguage(user, 'fr'),
    }));
}

export class BackupStatusCheckJob {
  private timer: NodeJS.Timeout | null = null;

  private running = false;

  private fallbackNotifier: Notifier | null = null;

  constructor(private readonly deps: BackupStatusCheckJobDeps) {}

  private get env(): Readonly<Record<string, string | undefined>> {
    return this.deps.env ?? process.env;
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private notifier(): Notifier {
    if (this.deps.notifier) return this.deps.notifier();
    const shared = getSharedNotificationService();
    if (shared) return shared;
    this.fallbackNotifier ??= new NotificationService(this.deps.prisma);
    return this.fallbackNotifier;
  }

  start(): void {
    if (!isBackupStatusAlertsEnabled(this.env)) {
      logger.info('Backup status check disabled (BACKUP_STATUS_ALERTS_ENABLED is not true)');
      return;
    }
    if (this.running) return;
    this.running = true;
    this.arm(this.now());
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  isArmed(): boolean {
    return this.timer !== null;
  }

  /** Le prochain 5 h après `after` ; un contrôle qui a débordé ne déclenche jamais de rattrapage en rafale. */
  private arm(after: Date): void {
    if (!this.running) return;
    const following = nextBackupCheckAt(after);
    const at = following.getTime() > this.now().getTime() ? following : nextBackupCheckAt(this.now());
    const afterMs = Math.max(0, at.getTime() - this.now().getTime());
    logger.info(`Backup status check armed for ${at.toISOString()}`);
    this.timer = guardedTimeout({
      name: 'backup-status-check',
      afterMs,
      logger,
      run: async () => {
        this.timer = null;
        try {
          await this.runNow();
        } finally {
          this.arm(new Date(at.getTime() + REARM_MARGIN_MS));
        }
      },
    });
    this.timer.unref?.();
  }

  async runNow(): Promise<BackupCheckReport> {
    const notifier = this.notifier();
    const report = await runBackupStatusCheck({
      enabled: isBackupStatusAlertsEnabled(this.env),
      now: () => this.now(),
      readVerdict: this.deps.readVerdict ?? (() => readBackupVerdict(backupStatusFile(this.env))),
      store: this.deps.store?.() ?? getCacheStore(),
      recipients: () => loadBackupAlertRecipients(this.deps.prisma),
      notify: async (recipient: BackupAlertRecipient, message: BackupAlertMessage) => {
        const { title, body } = backupAlertText(message, recipient.language);
        const created = await notifier.createSystemNotification({
          recipientUserId: recipient.id,
          title,
          content: body,
          systemType: 'security',
          priority: message.kind === 'recovered' ? 'normal' : 'urgent',
          lang: recipient.language,
        });
        return created !== null;
      },
      email: async (recipient: BackupAlertRecipient, message: BackupAlertMessage) => {
        if (recipient.email === null) return false;
        const result = await this.deps.emailService.sendBackupAlertEmail({ to: recipient.email, name: recipient.name, language: recipient.language, message });
        if (!result.success) logger.error(`Backup alert email not sent: ${result.error ?? 'unknown error'}`);
        return result.success;
      },
    });
    logger.info('Backup status check', report);
    return report;
  }
}
