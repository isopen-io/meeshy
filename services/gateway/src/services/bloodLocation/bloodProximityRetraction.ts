/**
 * CE QUE L'ALERTE DE PROXIMITÉ LAISSE DERRIÈRE ELLE (#20542) — site unique. La notification
 * `blood_proximity` (#20540) est une COPIE persistée de « X est tout près, à 500 m » : sans retrait,
 * elle survivait à l'effacement de l'historique, au retrait du consentement de X et à sa propre
 * échéance, au-delà des 30 jours des points.
 *
 * Trois gestes l'effacent, tous ici :
 * - `everywhere` — X efface son historique : toute alerte qui NOMME X, chez tous ses Sangs, et toute
 *   alerte de SA cloche (« Y est tout près » dit aussi où X était) ;
 * - `at` — X retire `location.proximity` à Y, par le réglage ou parce que le lien tombe sous le Sang
 *   (`withdrawRitualSharesBetween`) : les alertes qui nomment X chez Y, et elles seules ;
 * - l'ÉCHÉANCE (2 h) : l'index TTL partiel de `2026-11-27-notification-blood-proximity-ttl.mongodb.js`
 *   la tient une fois posé ; d'ici là, et partout où il ne l'est pas, `purgeExpiredBloodProximityNotices`
 *   balaie toutes les heures les lignes échues (tâche armée par `BLOOD_LOCATION_ENABLED`).
 *
 * Les lignes retirées sont SUPPRIMÉES puis ANNONCÉES (`notification:deleted` sur les appareils du
 * lecteur, révocation push sinon) par `retractedNotificationOf`, le site unique qui lit
 * `delivery.pushSent` : la copie quitte aussi l'écran du lecteur. Une panne de la base LÈVE — le
 * geste qui l'appelle répond en erreur et le rejeu le solde ; une panne de l'annonce, non.
 */
import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { BLOOD_PROXIMITY_NOTIFICATION_TYPE } from '@meeshy/shared/types/blood-location';
import { getSharedNotificationService } from '../notifications/notification-service-registry';
import { retractedNotificationOf, type RetractedNotification } from '../notifications/retractedNotifications';

export type BloodProximityRetraction =
  | { readonly kind: 'everywhere'; readonly ownerId: string }
  | {
      readonly kind: 'at';
      readonly ownerId: string;
      readonly readerId: string;
      /**
       * La ligne que l'alerte vient d'écrire (#20689) : son push part sans être attendu, donc il est
       * révoqué sans lire `pushSent` — et annoncé même si un autre retrait l'a déjà supprimée.
       */
      readonly writtenId?: string;
    };

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

const writtenOf = (scope: BloodProximityRetraction): string | null => (scope.kind === 'at' ? scope.writtenId ?? null : null);

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
    if (!id || !userId) return [];
    const retracted = retractedNotificationOf({ id, userId, type: row.type, context: row.context, delivery: row.delivery });
    return [id === writtenOf(scope) ? { ...retracted, pushSent: true } : retracted];
  });
  const written = writtenOf(scope);
  const announced = written === null || rows.some((row) => row.id === written) || scope.kind !== 'at' ? rows : [...rows, { id: written, userId: scope.readerId, pushSent: true }];
  if (announced.length === 0) return 0;
  if (rows.length > 0) await prisma.notification.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
  await announcer?.announceNotificationsRetracted(announced).catch(() => undefined);
  return rows.length;
}

/** Le retrait câblé au service de notifications partagé (absent : les lignes partent sans annonce). */
export function bloodProximityRetractorOf(prisma: Pick<PrismaClient, 'notification'>): (scope: BloodProximityRetraction) => Promise<number> {
  return (scope) => retractBloodProximityNotices(prisma, getSharedNotificationService() ?? null, scope);
}

/** Les alertes échues : leur ligne part, sans annonce (la lecture les masque déjà). Rend combien. */
export async function purgeExpiredBloodProximityNotices(prisma: Pick<PrismaClient, 'notification'>, now: Date): Promise<number> {
  const { count } = await prisma.notification.deleteMany({
    where: { type: BLOOD_PROXIMITY_NOTIFICATION_TYPE, expiresAt: { lt: now } },
  });
  return count;
}
