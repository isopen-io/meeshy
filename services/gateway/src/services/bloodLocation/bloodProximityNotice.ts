/**
 * LA NOTIFICATION POUSSÉE QUAND UN SANG S'APPROCHE (#20540) — le double persisté et poussé
 * (APNs/FCM) de `location:blood-proximity`, pour qu'une app FERMÉE l'apprenne aussi.
 *
 * Elle ne décide de rien : `alertBloodProximity` l'appelle là où l'événement socket part, sous ses
 * gardes (fantôme, silence ciblé, drapeau, consentement des deux) et après la cadence de 2 h déjà
 * prise. Le pipeline (`createNotification`) décide du reste — préférence `bloodProximityEnabled`,
 * blocage dans les deux sens (`blocked-actor-content.ts`), comptes vivants, sourdine.
 *
 * « Lina est tout près » / « À 500 m — touche pour vous voir tous les deux sur la carte » : titre et
 * corps CADRÉS dans la langue du destinataire (`utils/recipient-language.ts`). La distance est le
 * PALIER de l'alerte socket (jamais plus précise) et vit au CORPS seul : `showPreview:false` le
 * remplace, et le titre — qui suit seulement `showSenderName` — ne porte jamais de distance. Ne
 * voyagent que l'identité de l'autre (`actor`, `metadata.userId`) et ce palier : jamais une
 * coordonnée, une précision ou l'heure du point. La ligne expire avec
 * la cadence — passé 2 h, « est tout près, à 500 m » ne dit plus rien de vrai.
 *
 * `admits` (#20689) relit la paire JUSTE AVANT `createNotification` : refusée, rien ne s'écrit.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  BLOOD_PROXIMITY_NOTIFICATION_TYPE,
  bloodProximityNotificationMetadata,
} from '@meeshy/shared/types/blood-location';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import { RELATION_THRESHOLDS } from '@meeshy/shared/utils/relation-levels';
import { RECIPIENT_LANG_SELECT, recipientDateLocale, recipientLanguage } from '../../utils/recipient-language';
import type { NotificationService } from '../notifications/NotificationService';
import type { BloodProximityNotice, BloodProximityNoticeOptions } from './bloodLocationTypes';

export type BloodProximityNotifier = Pick<NotificationService, 'createNotification'>;

const ACTOR_SELECT = { id: true, username: true, displayName: true, avatar: true } as const;
const KILOMETER = 1000;

type Person = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
};

const nameOf = (person: Person): string => person.displayName?.trim() || person.username;

/** « 300 m », « 2,5 km », « 300米 » : l'unité et le séparateur décimal du lecteur. */
export function proximityDistanceLabel(locale: string, meters: number): string {
  const inKilometers = meters >= KILOMETER;
  const format = (value: number, unit: 'meter' | 'kilometer'): string =>
    new Intl.NumberFormat(locale, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: 1 }).format(value);
  try {
    return inKilometers ? format(meters / KILOMETER, 'kilometer') : format(meters, 'meter');
  } catch {
    return inKilometers ? `${meters / KILOMETER} km` : `${meters} m`;
  }
}

export function bloodProximityNotifierOf(params: {
  readonly prisma: Pick<PrismaClient, 'user'>;
  readonly notifications: BloodProximityNotifier | null;
  readonly now?: () => number;
}): ((notice: BloodProximityNotice, options?: BloodProximityNoticeOptions) => Promise<boolean>) | undefined {
  const notifications = params.notifications;
  if (notifications === null) return undefined;
  const now = params.now ?? Date.now;
  const ttlMs = RELATION_THRESHOLDS.proximity.cooldownHours * 3_600_000;

  return async (notice, options) => {
    const [other, recipient] = await Promise.all([
      params.prisma.user.findUnique({ where: { id: notice.otherId }, select: ACTOR_SELECT }) as Promise<Person | null>,
      params.prisma.user.findUnique({ where: { id: notice.recipientId }, select: { id: true, ...RECIPIENT_LANG_SELECT } }),
    ]);
    if (!other || !recipient) return false;
    if (options?.admits && !(await options.admits())) return false;
    const lang = recipientLanguage(recipient, 'fr');
    const metadata = bloodProximityNotificationMetadata({ userId: other.id, distanceMeters: notice.distanceMeters });
    const distance = proximityDistanceLabel(recipientDateLocale(recipient, 'fr'), metadata.distanceMeters);
    const created = await notifications.createNotification({
      userId: notice.recipientId,
      type: BLOOD_PROXIMITY_NOTIFICATION_TYPE,
      priority: 'normal',
      lang,
      title: `${nameOf(other)} ${notificationString(lang, 'location.proximityAction')}`,
      content: notificationString(lang, 'location.proximityBody', { value: distance }),
      actor: { id: other.id, username: other.username, displayName: nameOf(other), avatar: other.avatar },
      context: {},
      metadata,
      collapseId: `blood-proximity-${other.id}`,
      expiresAt: new Date(now() + ttlMs),
    });
    return created !== null && created !== undefined;
  };
}
