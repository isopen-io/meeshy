/**
 * LE PUSH DE LA CHUTE (#18748) — un push SEUL, jamais une ligne `Notification` : rien de la chute
 * ne survit à l'épisode (donnée de santé, art. 9 RGPD), et la réponse remplace l'alerte sur l'écran
 * verrouillé par le même `collapseId`.
 *
 * Le texte est GÉNÉRIQUE — « ⚠️ Alerte de sécurité », « <nom> · <HH:mm> — ouvrez Meeshy » — sans
 * aucun mot de santé : ce qui s'est passé ne se lit que dans l'app, déverrouillée. Cadré dans la
 * langue du destinataire (`utils/recipient-language.ts`), l'heure dans SON fuseau. Une alerte de
 * sécurité traverse « Ne pas déranger » et part `time-sensitive` ; `pushEnabled: false` la coupe.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { FALL_CLEARED_PUSH_TYPE, FALL_DETECTED_PUSH_TYPE, FALL_DETECTION_CONFIG } from '@meeshy/shared/types/fall-detection';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import type { SendPushOptions } from '../PushNotificationService';
import { FALL_ALERT_PUSH_CATEGORY } from '../notifications/push-header';
import { RECIPIENT_LANG_SELECT, recipientLanguage, type RecipientLanguagePrefs } from '../../utils/recipient-language';
import type { FallPush, FallRelayDeps } from './fallRelay';

export type FallPushDb = Pick<PrismaClient, 'user'>;
export type FallPushSend = (options: SendPushOptions) => Promise<unknown>;

type Emitter = { readonly id: string; readonly username: string; readonly displayName: string | null };
type Reader = RecipientLanguagePrefs & { readonly id: string; readonly timezone?: string | null };

const EPISODE_MS = FALL_DETECTION_CONFIG.episodeTtlMinutes * 60_000;

/** `HH:mm` dans le fuseau du lecteur ; un fuseau absent ou illisible retombe sur UTC. */
function clockOf(at: string, timezone: string | null | undefined): string {
  const format = (timeZone: string): string =>
    new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(new Date(at));
  try {
    return format(timezone || 'UTC');
  } catch {
    return format('UTC');
  }
}

export function fallPusherOf(params: { readonly prisma: FallPushDb; readonly send: FallPushSend }): FallRelayDeps['push'] {
  return async (push: FallPush) => {
    const [reader, emitter] = await Promise.all([
      params.prisma.user.findUnique({ where: { id: push.readerId }, select: { id: true, timezone: true, ...RECIPIENT_LANG_SELECT } }) as Promise<Reader | null>,
      params.prisma.user.findUnique({ where: { id: push.emitterId }, select: { id: true, username: true, displayName: true } }) as Promise<Emitter | null>,
    ]);
    if (reader === null || emitter === null) return false;
    const lang = recipientLanguage(reader, 'fr');
    const actor = emitter.displayName?.trim() || emitter.username;
    const detected = push.kind === 'detected';
    const thread = `fall-${emitter.id}`;
    await params.send({
      userId: push.readerId,
      bypassDnd: true,
      types: ['apns', 'fcm'],
      payload: {
        title: notificationString(lang, detected ? 'fall.alertTitle' : 'fall.respondedTitle'),
        body: detected
          ? notificationString(lang, 'fall.alertBody', { actor, value: clockOf(push.at, reader.timezone) })
          : notificationString(lang, 'fall.respondedBody', { actor }),
        category: FALL_ALERT_PUSH_CATEGORY,
        ...(detected ? { interruptionLevel: 'time-sensitive' as const } : {}),
        collapseId: thread,
        threadId: thread,
        ttlMs: EPISODE_MS,
        data: { type: detected ? FALL_DETECTED_PUSH_TYPE : FALL_CLEARED_PUSH_TYPE, userId: emitter.id },
      },
    });
    return true;
  };
}
