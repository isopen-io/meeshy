/**
 * LE PUSH DE LA CHUTE (#18748) — un push SEUL, jamais une ligne `Notification` : rien de la chute
 * ne survit à l'épisode (donnée de santé, art. 9 RGPD), et la réponse — ou la levée chez qui perd
 * l'accès — remplace l'alerte sur l'écran verrouillé par le même `collapseId`.
 *
 * Ce qui traverse Apple et Google ne dit RIEN de la santé : texte générique (« ⚠️ Alerte de
 * sécurité », « <nom> · <HH:mm> — ouvrez Meeshy »), types `safety_alert` / `safety_alert_cleared`,
 * catégorie `MEESHY_SAFETY_ALERT`, et un `collapseId` OPAQUE (pseudonyme HMAC de l'émetteur) que le
 * transport ne journalise pas. Cadré dans la langue du destinataire (`utils/recipient-language.ts`),
 * l'heure dans SON fuseau. Une alerte qui PERCE traverse « Ne pas déranger » et part
 * `time-sensitive` ; au-delà du plafond quotidien (`fallUrgencyStep`), elle part sans percer.
 * `pushEnabled: false` la coupe.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { FALL_DETECTION_CONFIG, SAFETY_ALERT_CLEARED_PUSH_TYPE, SAFETY_ALERT_PUSH_TYPE } from '@meeshy/shared/types/fall-detection';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import type { SendPushOptions } from '../PushNotificationService';
import { SAFETY_ALERT_PUSH_CATEGORY } from '../notifications/push-header';
import { RECIPIENT_LANG_SELECT, recipientLanguage, type RecipientLanguagePrefs } from '../../utils/recipient-language';
import { sealedPseudonym } from '../../utils/secret-at-rest';
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

/** Le fil OPAQUE d'un émetteur : stable d'un push à l'autre (remplacement), sans son identifiant. */
export const safetyAlertThreadOf = (emitterId: string): string => `sa-${sealedPseudonym('safety-alert.thread', emitterId).slice(0, 32)}`;

type Texts = { readonly title: string; readonly body: string };

function textsOf(push: FallPush, lang: string, actor: string, reader: Reader): Texts {
  if (push.kind === 'detected') {
    return { title: notificationString(lang, 'fall.alertTitle'), body: notificationString(lang, 'fall.alertBody', { actor, value: clockOf(push.at, reader.timezone) }) };
  }
  if (push.kind === 'responded') return { title: notificationString(lang, 'fall.respondedTitle'), body: notificationString(lang, 'fall.respondedBody', { actor }) };
  return { title: notificationString(lang, 'fall.respondedTitle'), body: actor };
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
    const piercing = detected && push.urgent !== false;
    const thread = safetyAlertThreadOf(emitter.id);
    await params.send({
      userId: push.readerId,
      bypassDnd: !detected || piercing,
      types: ['apns', 'fcm'],
      payload: {
        ...textsOf(push, lang, actor, reader),
        category: SAFETY_ALERT_PUSH_CATEGORY,
        ...(piercing ? { interruptionLevel: 'time-sensitive' as const } : {}),
        collapseId: thread,
        threadId: thread,
        ttlMs: EPISODE_MS,
        data: { type: detected ? SAFETY_ALERT_PUSH_TYPE : SAFETY_ALERT_CLEARED_PUSH_TYPE, userId: emitter.id },
      },
    });
    return true;
  };
}
