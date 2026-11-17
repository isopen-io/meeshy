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
 *  - iOS : un push « badge seul » (`badgeSyncPush`) avec le total recalculé,
 *    déclenché par l'écriture du curseur de lecture (`broadcastReadStatus`) ;
 *  - Android : pas de pastille sans bannière — les bannières LUES dont un push
 *    est parti partent par la révocation déjà déployée (`notification_revoked`).
 */

/**
 * Les bannières poussées que le marquage d'une conversation va lire : les NON LUES de la conversation dont un push
 * est parti, cherchées AVANT l'écriture. `isRead: false` fait passer la lecture par l'index [userId, isRead] — la
 * même voie que le marquage —, là où un filtre sur `readAt` après coup balayait tout l'historique du compte.
 * Lecture bornée par la projection et le lot. Ne lève jamais : une révocation manquée laisse une bannière, pas une
 * panne.
 */
export async function pushedUnreadBanners(
  prisma: PrismaClient,
  params: { readonly userId: string; readonly conversationId: string }
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
        isRead: false,
        'context.conversationId': params.conversationId,
        'delivery.pushSent': true,
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
 * Fenêtre de l'anti-rebond, en millisecondes. Une lecture progressive écrit son
 * curseur à chaque salve (~1/s sur le web) : la synchronisation part une fois
 * la lecture posée, au total compté sur le dernier curseur, en UN push.
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
