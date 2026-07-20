/**
 * Notification Digest Job
 * Sends a daily re-engagement email at 18h UTC to users with unread
 * notifications. The email is a teaser (counts only — no actor/content) whose
 * single CTA is a one-click magic-login link (MagicLinkService) deep-linking
 * into the most-recent conversation. Marks processed notifications with
 * delivery.emailSent = true.
 */

import { PrismaClient } from '@meeshy/shared/prisma/client';
import { EmailService, NotificationDigestEmailData } from '../services/EmailService';
import { MagicLinkService } from '../services/MagicLinkService';
import { enhancedLogger } from '../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'NotificationDigestJob' });

const TARGET_HOUR_UTC = 18;
const BATCH_SIZE = 50;
const BATCH_DELAY_MS = 1000;

type PendingNotification = { context?: unknown };

function conversationIdOf(n: PendingNotification): string | null {
  const ctx = n.context as { conversationId?: unknown } | null;
  const id = ctx?.conversationId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/** Internal deep-link path: most-recent notification's conversation, else list. */
function resolveDeepLinkPath(pending: PendingNotification[]): string {
  const convId = pending.map(conversationIdOf).find((id): id is string => id !== null);
  return convId ? `/conversations/${convId}` : '/conversations';
}

/**
 * Build the CTA URL. With a token, target the magic-link validate page (reads
 * `token`, clamps `returnUrl` to an internal path — open-redirect safe).
 * When token issuance failed, fall back to the plain in-app deep-link: the
 * validate page treats a missing token as a hard error, so we must NOT send the
 * user there tokenless — landing directly on the destination lets the normal
 * auth flow take over while preserving the target.
 */
function buildMagicUrl(frontendUrl: string, returnPath: string, token: string | null): string {
  if (!token) {
    return `${frontendUrl}${returnPath}`;
  }
  const returnUrl = encodeURIComponent(returnPath);
  return `${frontendUrl}/auth/magic-link/validate?token=${encodeURIComponent(token)}&returnUrl=${returnUrl}`;
}

function getMillisecondsUntilNextRun(targetHourUTC: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(targetHourUTC, 0, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.getTime() - now.getTime();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface DeliveryField {
  emailSent?: boolean;
  emailSentAt?: string;
  pushSent?: boolean;
}

function isNotYetEmailed(delivery: unknown): boolean {
  if (!delivery) return true;
  const d = delivery as DeliveryField;
  return !d.emailSent;
}

export class NotificationDigestJob {
  private timeoutId: NodeJS.Timeout | null = null;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(
    private prisma: PrismaClient,
    private emailService: EmailService,
    private magicLinkService: MagicLinkService,
  ) {}

  start(): void {
    if (this.timeoutId || this.intervalId) {
      logger.warn('[NotificationDigestJob] Job already running');
      return;
    }

    const delayMs = getMillisecondsUntilNextRun(TARGET_HOUR_UTC);
    const delayHours = (delayMs / 3600000).toFixed(1);
    logger.info(`[NotificationDigestJob] Starting — first run in ${delayHours}h (${TARGET_HOUR_UTC}:00 UTC)`);

    this.timeoutId = setTimeout(() => {
      this.timeoutId = null;
      this.doWork();
      // Then every 24h
      this.intervalId = setInterval(() => this.doWork(), 24 * 60 * 60 * 1000);
      this.intervalId.unref?.();
    }, delayMs);
    this.timeoutId.unref?.();
  }

  stop(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    logger.info('[NotificationDigestJob] Stopped');
  }

  async runNow(): Promise<void> {
    await this.doWork();
  }

  private async doWork(): Promise<void> {
    try {
      logger.info('[NotificationDigestJob] Starting digest run...');

      // Find distinct userIds with unread notifications
      const unreadNotifs = await this.prisma.notification.findMany({
        where: { isRead: false },
        select: { userId: true, delivery: true },
      });

      // Group by userId, filtering out already-emailed notifications in application code
      const userCounts = new Map<string, number>();
      for (const n of unreadNotifs) {
        if (isNotYetEmailed(n.delivery)) {
          userCounts.set(n.userId, (userCounts.get(n.userId) || 0) + 1);
        }
      }

      if (userCounts.size === 0) {
        logger.info('[NotificationDigestJob] No users with pending notifications — skipping');
        return;
      }

      logger.info(`[NotificationDigestJob] Found ${userCounts.size} users with pending notifications`);

      let emailsSent = 0;
      let usersSkipped = 0;
      const userEntries = Array.from(userCounts.entries());

      // Process in batches
      for (let i = 0; i < userEntries.length; i += BATCH_SIZE) {
        const batch = userEntries.slice(i, i + BATCH_SIZE);

        for (const [userId, count] of batch) {
          try {
            const sent = await this.processUser(userId, count);
            if (sent) emailsSent++;
            else usersSkipped++;
          } catch (err) {
            logger.error(`[NotificationDigestJob] Error processing user ${userId}:`, err);
          }
        }

        // Rate limiting between batches
        if (i + BATCH_SIZE < userEntries.length) {
          await sleep(BATCH_DELAY_MS);
        }
      }

      logger.info(`[NotificationDigestJob] Done — ${emailsSent} emails sent, ${usersSkipped} users skipped`);
    } catch (err) {
      logger.error('[NotificationDigestJob] Fatal error during digest run:', err);
    }
  }

  private async processUser(userId: string, unreadCount: number): Promise<boolean> {
    // Check user preferences — source unique : UserPreferences.notification (JSON)
    const prefs = await this.prisma.userPreferences.findFirst({
      where: { userId },
      select: { notification: true },
    });

    const notifPrefs = prefs?.notification as Record<string, unknown> | null;
    if (notifPrefs?.emailEnabled === false) {
      return false;
    }

    // Get user info
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true, username: true, systemLanguage: true, isActive: true },
    });

    // Never re-engage a deactivated/banned account (don't email it, don't mint a token).
    if (!user?.email || !user.isActive) return false;

    // Get recent unread notifications not yet emailed
    const allUnread = await this.prisma.notification.findMany({
      where: { userId, isRead: false },
      orderBy: { createdAt: 'desc' },
      select: { id: true, context: true, createdAt: true, delivery: true },
    });

    // Filter out already emailed in app code
    const pending = allUnread.filter(n => isNotYetEmailed(n.delivery));
    if (pending.length === 0) return false;

    const frontendUrl = process.env.FRONTEND_URL || 'https://meeshy.me';
    const lang = user.systemLanguage || 'en';

    // Deep-link target: most-recent notification's conversation (notifications
    // are ordered desc), else the conversations list.
    const returnPath = resolveDeepLinkPath(pending);

    // One-click magic-login token (reuses MagicLinkService — single source of
    // truth). On failure we still send, falling back to a plain (unauthenticated)
    // deep-link rather than dropping the re-engagement email entirely.
    const token = await this.magicLinkService.issueLoginTokenForUser(userId);
    const magicUrl = buildMagicUrl(frontendUrl, returnPath, token);

    const digestData: NotificationDigestEmailData = {
      to: user.email,
      name: user.displayName || user.username || 'there',
      language: lang,
      unreadCount: pending.length,
      magicUrl,
      settingsUrl: `${frontendUrl}/settings#notifications`,
    };

    const result = await this.emailService.sendNotificationDigestEmail(digestData);

    if (result.success) {
      // Mark these specific notifications as emailed, PRESERVING each
      // document's existing delivery state (pushSent is flipped by the push
      // pipeline — a blanket write would reset it to false and corrupt the
      // multi-channel tracking).
      const emailSentAt = new Date().toISOString();
      await Promise.all(pending.map(n =>
        this.prisma.notification.update({
          where: { id: n.id },
          data: {
            delivery: {
              ...((n.delivery ?? {}) as Record<string, unknown>),
              emailSent: true,
              emailSentAt,
            },
          },
        })
      ));
      return true;
    }

    logger.warn(`[NotificationDigestJob] Failed to send digest to ${user.email}: ${result.error}`);
    return false;
  }
}
