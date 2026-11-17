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

const ACTOR_SELECT = { id: true, username: true, displayName: true, avatar: true } as const;

type Person = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
};

const nameOf = (person: Person): string => person.displayName?.trim() || person.username;
const actorOf = (person: Person) => ({ id: person.id, username: person.username, displayName: nameOf(person), avatar: person.avatar });

async function actorOfId(prisma: SharedLocationNoticesDb, id: string): Promise<Person | null> {
  return (await prisma.user.findUnique({ where: { id }, select: ACTOR_SELECT })) as Person | null;
}

/** La langue de CADRAGE du destinataire : les quatre colonnes du prisme, lues ensemble (#4642). */
async function framingLanguageOf(prisma: SharedLocationNoticesDb, id: string): Promise<string | null> {
  const recipient = await prisma.user.findUnique({ where: { id }, select: { id: true, ...RECIPIENT_LANG_SELECT } });
  return recipient === null ? null : recipientLanguage(recipient, 'fr');
}

/** La durée en heures pleines (« Pendant 8 h »), sinon en minutes (« Pendant 10 min »). */
const startedBody = (lang: string, minutes: number): string =>
  minutes % 60 === 0
    ? notificationString(lang, 'location.startedBody', { count: minutes / 60 })
    : notificationString(lang, 'location.startedBodyMinutes', { count: minutes });

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
    await Promise.all(
      notices.map(async (notice) => {
        const [emitter, lang] = await Promise.all([actorOfId(params.prisma, notice.emitterId), framingLanguageOf(params.prisma, notice.readerId)]);
        if (!emitter || lang === null) return false;
        const metadata: LocationShareStartedNotificationMetadata = { action: 'view_profile', userId: emitter.id, durationMinutes: notice.durationMinutes };
        return quietly(() =>
          notifications.createNotification({
            userId: notice.readerId,
            type: 'location_share_started',
            priority: 'normal',
            lang,
            title: `${nameOf(emitter)} ${notificationString(lang, 'location.startedAction')}`,
            content: startedBody(lang, notice.durationMinutes),
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
    const [requester, lang] = await Promise.all([actorOfId(params.prisma, notice.requesterId), framingLanguageOf(params.prisma, notice.emitterId)]);
    if (!requester || lang === null) return false;
    const metadata: LocationShareRequestedNotificationMetadata = { action: 'view_profile', userId: requester.id, requestKind: notice.kind };
    return quietly(() =>
      notifications.createNotification({
        userId: notice.emitterId,
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
