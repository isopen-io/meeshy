import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { notificationLogger } from '../../utils/logger-enhanced';
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
 * L'anti-rebond par compte : une synchronisation déjà EN FILE absorbe les
 * lectures qui arrivent avant son tour — elle calcule le total à son exécution,
 * donc voit leur effet. Trois conversations lues d'affilée = un seul push.
 */
export class BadgeSyncCoalescer {
  private readonly pending = new Set<string>();

  /** `true` si l'appelant doit mettre une synchronisation en file ; `false` si une l'est déjà. */
  claim(userId: string): boolean {
    if (this.pending.has(userId)) return false;
    this.pending.add(userId);
    return true;
  }

  /** À appeler quand la synchronisation commence : une lecture ultérieure en rouvre une. */
  release(userId: string): void {
    this.pending.delete(userId);
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
