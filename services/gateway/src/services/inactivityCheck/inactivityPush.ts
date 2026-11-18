/**
 * LES NOTIFICATIONS DE LA VÉRIFICATION D'INACTIVITÉ (#18738) — jamais un message de conversation.
 *
 * - `wellness_check`, à la personne : « Tout va bien ? », visible, que l'action « Je vais bien » ou
 *   le toucher referment (`POST /me/wellness/ok`) ;
 * - `inactivity_alert`, à un Sang : « <nom> n'a pas répondu à « Tout va bien ? » », le corps dit
 *   depuis combien d'heures, et la dernière batterie seulement quand elle lui est déjà partagée ; la
 *   position n'est jamais dans le texte d'une bannière — l'app la lit dans l'état servi.
 *
 * Titre et corps CADRÉS dans la langue du destinataire (`utils/recipient-language.ts`). AUCUN
 * HISTORIQUE : chaque annonce retire d'abord la précédente de la même paire (`replacePrevious`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { INACTIVITY_CHECK_CONFIG } from '@meeshy/shared/types/inactivity-check';
import type { InactivityAlertNotificationMetadata, WellnessCheckNotificationMetadata } from '@meeshy/shared/types/notification';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import { RECIPIENT_LANG_SELECT, recipientLanguage, type RecipientLanguagePrefs } from '../../utils/recipient-language';
import type { NotificationService } from '../notifications/NotificationService';
import type { InactivityPair, InactivityPush, InactivityRelayDeps } from './inactivityRelay';

export type InactivityPushDb = Pick<PrismaClient, 'user'>;
export type InactivityNotifier = Pick<NotificationService, 'createNotification'>;

type Person = { readonly id: string; readonly username: string; readonly displayName: string | null; readonly avatar: string | null };

const HOUR_MS = 3_600_000;
const PERSON_SELECT = { id: true, username: true, displayName: true, avatar: true } as const;

const hoursBetween = (from: string, to: string): number => Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / HOUR_MS));

function alertBody(lang: string, push: InactivityPush): string {
  if (push.announcement.kind === 'responded') return notificationString(lang, 'inactivity.respondedBody');
  const count = hoursBetween(push.announcement.inactiveSince, push.announcement.at);
  const battery = push.state?.lastBattery;
  return battery
    ? notificationString(lang, 'inactivity.alertBatteryBody', { count, value: String(battery.level) })
    : notificationString(lang, 'inactivity.alertBody', { count });
}

/** « Tout va bien ? » — à la personne elle-même. */
export function wellnessAskerOf(params: {
  readonly prisma: InactivityPushDb;
  readonly notifications: InactivityNotifier | null;
  readonly replacePrevious?: (userId: string) => Promise<void>;
  readonly now?: () => number;
}): InactivityRelayDeps['askWellness'] {
  const now = params.now ?? Date.now;
  return async (userId, ask) => {
    if (params.notifications === null) return;
    const person = (await params.prisma.user.findUnique({ where: { id: userId }, select: { ...PERSON_SELECT, ...RECIPIENT_LANG_SELECT } })) as (Person & RecipientLanguagePrefs) | null;
    if (person === null) return;
    const lang = recipientLanguage(person, 'fr');
    const metadata: WellnessCheckNotificationMetadata = { action: 'none', wellnessCheck: true };
    await params.replacePrevious?.(userId).catch(() => undefined);
    await params.notifications.createNotification({
      userId,
      type: 'wellness_check',
      priority: 'high',
      lang,
      title: notificationString(lang, 'inactivity.wellnessTitle'),
      content: notificationString(lang, 'inactivity.wellnessBody', { count: hoursBetween(ask.inactiveSince, new Date(now()).toISOString()) }),
      actor: { id: person.id, username: person.username, displayName: person.displayName?.trim() || person.username, avatar: person.avatar },
      context: {},
      metadata,
      collapseId: `wellness-${userId}`,
      expiresAt: new Date(now() + INACTIVITY_CHECK_CONFIG.stateTtlSeconds * 1000),
    });
  };
}

/** L'alerte ou le retour, vers UN Sang. Rend `true` quand la notification a été créée. */
export function inactivityPusherOf(params: {
  readonly prisma: InactivityPushDb;
  readonly notifications: InactivityNotifier | null;
  readonly replacePrevious?: (pair: InactivityPair) => Promise<void>;
  readonly now?: () => number;
}): InactivityRelayDeps['push'] {
  const now = params.now ?? Date.now;
  return async (push) => {
    if (params.notifications === null) return false;
    const [reader, emitter] = await Promise.all([
      params.prisma.user.findUnique({ where: { id: push.readerId }, select: { id: true, ...RECIPIENT_LANG_SELECT } }),
      params.prisma.user.findUnique({ where: { id: push.emitterId }, select: PERSON_SELECT }) as Promise<Person | null>,
    ]);
    if (reader === null || emitter === null) return false;
    const lang = recipientLanguage(reader, 'fr');
    const name = emitter.displayName?.trim() || emitter.username;
    const alert = push.announcement.kind === 'alert';
    const metadata: InactivityAlertNotificationMetadata = { action: 'view_profile', userId: emitter.id, inactivityKind: push.announcement.kind };
    await params.replacePrevious?.({ emitterId: emitter.id, readerId: push.readerId }).catch(() => undefined);
    const created = await params.notifications.createNotification({
      userId: push.readerId,
      type: 'inactivity_alert',
      priority: alert ? 'high' : 'normal',
      lang,
      title: `${name} ${notificationString(lang, alert ? 'inactivity.alertAction' : 'inactivity.respondedAction')}`,
      content: alertBody(lang, push),
      actor: { id: emitter.id, username: emitter.username, displayName: name, avatar: emitter.avatar },
      context: {},
      metadata,
      collapseId: `inactivity-${emitter.id}`,
      expiresAt: new Date(now() + INACTIVITY_CHECK_CONFIG.stateTtlSeconds * 1000),
    });
    return created !== null && created !== undefined;
  };
}
