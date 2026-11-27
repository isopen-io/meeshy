/**
 * CE QUE L'ALERTE DE PROXIMITÉ LAISSE DERRIÈRE ELLE (#20542). La notification `blood_proximity`
 * (#20540) est une COPIE persistée de « X est tout près, à 500 m » : sans retrait, elle survivait à
 * l'effacement de l'historique et au retrait du consentement de X, au-delà des 30 jours des points.
 *
 * Deux retraits, un seul geste chacun :
 * - `everywhere` — X efface son historique : toute alerte qui NOMME X, chez tous ses Sangs, et toute
 *   alerte de SA cloche (« Y est tout près » dit aussi où X était) ;
 * - `at` — X retire `location.proximity` à Y : les alertes qui nomment X chez Y, et elles seules.
 *
 * Les lignes sont SUPPRIMÉES puis ANNONCÉES (`notification:deleted` sur les appareils connectés,
 * révocation push sinon), chacune par `retractedNotificationOf`, le site unique qui lit
 * `delivery.pushSent`. L'expiration des 2 h, elle, est tenue par l'index TTL partiel de
 * `2026-11-27-notification-blood-proximity-ttl.mongodb.js`.
 */
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { BLOOD_PROXIMITY_NOTIFICATION_TYPE } from '@meeshy/shared/types/blood-location';
import { getSharedNotificationService } from '../notifications/notification-service-registry';
import { retractedNotificationOf, type RetractedNotification } from '../notifications/retractedNotifications';

export type BloodProximityRetraction =
  | { readonly kind: 'everywhere'; readonly ownerId: string }
  | { readonly kind: 'at'; readonly ownerId: string; readonly readerId: string };

export type BloodProximityRetractionAnnouncer = {
  readonly announceNotificationsRetracted: (rows: readonly RetractedNotification[]) => Promise<void>;
};

type RawId = { readonly $oid?: string } | string | null | undefined;
type RawRow = { readonly _id?: RawId; readonly userId?: RawId; readonly type?: unknown; readonly context?: unknown; readonly delivery?: unknown };

const idOf = (value: RawId): string | null => (typeof value === 'string' ? value : value?.$oid ?? null);

export function bloodProximityRetractionFilter(scope: BloodProximityRetraction): Prisma.InputJsonObject {
  const type = BLOOD_PROXIMITY_NOTIFICATION_TYPE;
  if (scope.kind === 'at') return { type, userId: { $oid: scope.readerId }, 'actor.id': scope.ownerId };
  return { type, $or: [{ 'actor.id': scope.ownerId }, { userId: { $oid: scope.ownerId } }] };
}

/** Supprime puis annonce ; rend le nombre de lignes retirées. Une panne de la base LÈVE. */
export async function retractBloodProximityNotices(
  prisma: Pick<PrismaClient, 'notification'>,
  announcer: BloodProximityRetractionAnnouncer | null,
  scope: BloodProximityRetraction,
): Promise<number> {
  const raw = (await prisma.notification.findRaw({
    filter: bloodProximityRetractionFilter(scope),
    options: { projection: { _id: 1, userId: 1, type: 1, context: 1, delivery: 1 } },
  })) as unknown as readonly RawRow[];
  const rows = raw.flatMap((row) => {
    const id = idOf(row._id);
    const userId = idOf(row.userId);
    return id && userId ? [retractedNotificationOf({ id, userId, type: row.type, context: row.context, delivery: row.delivery })] : [];
  });
  if (rows.length === 0) return 0;
  await prisma.notification.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
  await announcer?.announceNotificationsRetracted(rows).catch(() => undefined);
  return rows.length;
}

/** Le retrait câblé au service de notifications partagé (absent : les lignes partent sans annonce). */
export function bloodProximityRetractorOf(prisma: Pick<PrismaClient, 'notification'>): (scope: BloodProximityRetraction) => Promise<number> {
  return (scope) => retractBloodProximityNotices(prisma, getSharedNotificationService() ?? null, scope);
}
