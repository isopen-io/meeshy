/**
 * LES NOTIFICATIONS DU PARTAGE DE POSITION (#19204) — deux types, jamais un message :
 *
 * - `location_share_started` : « Léo partage sa position avec toi — pendant 8 h », vers un
 *   destinataire que l'émetteur a choisi de prévenir et que la loi sert ;
 * - `location_share_requested` : « Awa te demande de prolonger ton partage », vers l'émetteur.
 *
 * Le titre est CADRÉ dans la langue du lecteur (`utils/recipient-language.ts`). Aucune position,
 * aucune précision, aucun autre destinataire ne voyage : le corps dit une durée ou une invitation.
 * Le pipeline (`createNotification`) décide du reste — préférence `locationShareEnabled`, blocage
 * dans les deux sens (`blocked-actor-content.ts`), comptes vivants, sourdine.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { SharedLocationRequestKind } from '@meeshy/shared/types/shared-location';
import type { LocationShareRequestedNotificationMetadata, LocationShareStartedNotificationMetadata } from '@meeshy/shared/types/notification';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';
import type { NotificationService } from '../notifications/NotificationService';
import type { SharedLocationStartedNotice } from './sharedLocationRelay';

export type SharedLocationNotifier = Pick<NotificationService, 'createNotification'>;
export type SharedLocationNoticesDb = Pick<PrismaClient, 'user'>;

/** Une demande à porter jusqu'à l'émetteur : qui demande, quoi, quand. */
export type SharedLocationRequestNotice = {
  readonly emitterId: string;
  readonly requesterId: string;
  readonly kind: SharedLocationRequestKind;
  readonly requestedAt: string;
};

/** Une demande reste lisible un jour : au-delà, elle ne dit plus rien d'actuel. */
const REQUEST_NOTICE_TTL_MS = 24 * 60 * 60 * 1000;

const PERSON_SELECT = { id: true, username: true, displayName: true, avatar: true, ...RECIPIENT_LANG_SELECT } as const;

type Person = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
  readonly systemLanguage?: string | null;
  readonly regionalLanguage?: string | null;
  readonly customDestinationLanguage?: string | null;
  readonly deviceLocale?: string | null;
};

const nameOf = (person: Person): string => person.displayName?.trim() || person.username;
const actorOf = (person: Person) => ({ id: person.id, username: person.username, displayName: nameOf(person), avatar: person.avatar });

async function peopleById(prisma: SharedLocationNoticesDb, ids: readonly string[]): Promise<ReadonlyMap<string, Person>> {
  const rows = (await prisma.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: PERSON_SELECT })) as readonly Person[];
  return new Map(rows.map((row) => [row.id, row]));
}

/** Un avis ou une demande qui échoue n'arrête jamais les autres. */
const quietly = async (send: () => Promise<unknown>): Promise<boolean> => {
  try {
    const created = await send();
    return created !== null && created !== undefined;
  } catch {
    return false;
  }
};

export function sharedLocationNoticesOf(params: {
  readonly prisma: SharedLocationNoticesDb;
  readonly notifications: SharedLocationNotifier | null;
  readonly now?: () => number;
}) {
  const now = params.now ?? Date.now;
  const notifications = params.notifications;

  const started = async (notices: readonly SharedLocationStartedNotice[]): Promise<void> => {
    if (notifications === null || notices.length === 0) return;
    const people = await peopleById(params.prisma, notices.flatMap((notice) => [notice.emitterId, notice.readerId]));
    await Promise.all(
      notices.map((notice) => {
        const emitter = people.get(notice.emitterId);
        const reader = people.get(notice.readerId);
        if (!emitter || !reader) return Promise.resolve(false);
        const lang = recipientLanguage(reader, 'fr');
        const metadata: LocationShareStartedNotificationMetadata = { action: 'view_profile', userId: emitter.id, durationMinutes: notice.durationMinutes };
        return quietly(() =>
          notifications.createNotification({
            userId: reader.id,
            type: 'location_share_started',
            priority: 'normal',
            lang,
            title: `${nameOf(emitter)} ${notificationString(lang, 'location.startedAction')}`,
            content: notificationString(lang, 'location.startedBody', { count: Math.round(notice.durationMinutes / 60) }),
            actor: actorOf(emitter),
            context: {},
            metadata,
            collapseId: `location-share-${emitter.id}`,
            expiresAt: new Date(notice.expiresAt),
          }),
        );
      }),
    );
  };

  const requested = async (notice: SharedLocationRequestNotice): Promise<boolean> => {
    if (notifications === null) return false;
    const people = await peopleById(params.prisma, [notice.emitterId, notice.requesterId]);
    const emitter = people.get(notice.emitterId);
    const requester = people.get(notice.requesterId);
    if (!emitter || !requester) return false;
    const lang = recipientLanguage(emitter, 'fr');
    const metadata: LocationShareRequestedNotificationMetadata = { action: 'view_profile', userId: requester.id, requestKind: notice.kind };
    return quietly(() =>
      notifications.createNotification({
        userId: emitter.id,
        type: 'location_share_requested',
        priority: 'normal',
        lang,
        title: `${nameOf(requester)} ${notificationString(lang, notice.kind === 'extend' ? 'location.extendAction' : 'location.reaskAction')}`,
        content: notificationString(lang, 'location.requestBody'),
        actor: actorOf(requester),
        context: {},
        metadata,
        collapseId: `location-request-${requester.id}`,
        expiresAt: new Date(now() + REQUEST_NOTICE_TTL_MS),
      }),
    );
  };

  return { started, requested };
}
