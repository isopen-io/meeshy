import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { notificationLogger } from '../../utils/logger-enhanced';
import { guardedTimeout } from '../../utils/guarded-timer';
import { buildBadgeSyncPush } from './badgeSyncPush';
import { computeConversationUnreadBadge } from './conversationUnreadBadge';
import { retractedNotificationOf, type RetractedNotification } from './retractedNotifications';
import type { SendPushOptions } from '../PushNotificationService';

/**
 * Ce qu'une lecture faite ailleurs doit défaire sur le TÉLÉPHONE (#18910,
 * serveur-transport-6). Le socket ne parle qu'à un appareil déjà connecté ; un
 * iPhone dont l'app est fermée garde sa pastille et ses bannières.
 *
 *  - iOS : un push « badge seul » (`badgeSyncPush`) avec le total recalculé ;
 *  - Android : pas de pastille sans bannière — les bannières LUES dont un push
 *    est parti partent par la révocation déjà déployée (`notification_revoked`).
 */

/**
 * Les bannières que le marquage vient de lire et qui ont été poussées : celles
 * dont `readAt` n'est pas antérieur au marquage (`since`, le même instant que
 * l'écriture). Lecture BORNÉE par les ids et la projection, après l'écriture et
 * seulement quand elle a marqué quelque chose — le cas courant ne paie rien.
 * Ne lève jamais : une révocation manquée laisse une bannière, pas une panne.
 */
export async function pushedBannersReadSince(
  prisma: PrismaClient,
  params: { readonly userId: string; readonly conversationId: string; readonly since: string }
): Promise<RetractedNotification[]> {
  try {
    const raw = await (prisma as unknown as {
      $runCommandRaw: (cmd: Record<string, unknown>) => Promise<{
        cursor?: { firstBatch?: ReadonlyArray<{ _id: string | { $oid: string }; type?: unknown; context?: unknown; delivery?: unknown }> };
      }>;
    }).$runCommandRaw({
      find: 'Notification',
      filter: {
        userId: { $oid: params.userId },
        'context.conversationId': params.conversationId,
        'delivery.pushSent': true,
        readAt: { $gte: { $date: params.since } },
      },
      projection: { _id: 1, type: 1, 'context.conversationId': 1, 'delivery.pushSent': 1 },
      singleBatch: true,
      batchSize: 1000,
    });
    return (raw?.cursor?.firstBatch ?? []).map((row) =>
      retractedNotificationOf({
        id: typeof row._id === 'string' ? row._id : row._id.$oid,
        userId: params.userId,
        type: row.type,
        context: row.context,
        delivery: row.delivery,
      })
    );
  } catch (error) {
    notificationLogger.warn('read-elsewhere banners lookup failed — banners left in place', {
      userId: params.userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Fenêtre de l'anti-rebond, en millisecondes. La cascade « messages lus →
 * notifications lues » part AVANT l'écriture du curseur de lecture
 * (`MessageReadStatusService.markMessagesAsRead`), et le total se compte sur ce
 * curseur : lu aussitôt, il compterait encore la conversation qu'on vient de
 * lire, et ce chiffre périmé resterait sur l'icône jusqu'au prochain push.
 */
export const BADGE_SYNC_DEBOUNCE_MS = 2_000;

/**
 * L'anti-rebond par compte : la synchronisation part une fois la fenêtre
 * écoulée depuis la DERNIÈRE lecture, et calcule le total à ce moment-là. Trois
 * conversations lues d'affilée, même à une seconde d'intervalle, font un seul
 * push, au chiffre d'après la dernière. Les minuteries ne retiennent pas le
 * processus (`unref`) ; `flush` les déclenche toutes sur-le-champ (arrêt
 * propre, tests).
 */
export class BadgeSyncDebouncer {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly run: (userId: string) => void) {}

  schedule(userId: string): void {
    const previous = this.timers.get(userId);
    if (previous !== undefined) clearTimeout(previous);
    const timer = guardedTimeout({
      name: 'badge-sync-debounce',
      run: () => this.fire(userId),
      afterMs: BADGE_SYNC_DEBOUNCE_MS,
      logger: notificationLogger,
    });
    timer.unref?.();
    this.timers.set(userId, timer);
  }

  flush(): void {
    [...this.timers.entries()].forEach(([userId, timer]) => {
      clearTimeout(timer);
      this.fire(userId);
    });
  }

  private fire(userId: string): void {
    this.timers.delete(userId);
    this.run(userId);
  }
}

/**
 * Recalcule le total et le remet à l'iPhone. Rien ne part quand le compte n'a
 * aucun appareil iOS, ni quand le total est INDISPONIBLE : servir « 0 » à la
 * place d'une panne effacerait l'icône d'un destinataire qui a des non-lus
 * (`computeConversationUnreadBadge` lève exprès). Ne lève jamais.
 */
export async function sendBadgeSyncToIos(params: {
  readonly prisma: PrismaClient;
  readonly pushService: { sendToUser(options: SendPushOptions): Promise<unknown> } | undefined;
  readonly userId: string;
}): Promise<void> {
  const { prisma, pushService, userId } = params;
  if (!pushService) return;
  try {
    const device = await prisma.pushToken.findFirst({
      where: { userId, isActive: true, platform: 'ios', type: { in: ['apns', 'fcm'] } },
      select: { id: true },
    });
    if (!device) return;
    const badge = await computeConversationUnreadBadge(prisma, userId);
    await pushService.sendToUser(buildBadgeSyncPush(userId, badge));
  } catch (error) {
    notificationLogger.warn('badge sync after read failed — icon left as is', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
