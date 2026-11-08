/**
 * LE RÉVEIL DU TALKIE (#17142) — un Proche parle à quelqu'un dont aucune socket n'est
 * ouverte : un push le réveille, et c'est la SEULE notification dont la voix se joue
 * depuis la notification elle-même (précision du porteur, 2026-11-08).
 *
 * Deux canaux, jamais les deux :
 * - `pushtotalk` — un jeton PushToTalk iOS est enregistré : APNs `pushtotalk`, le
 *   framework rend l'orateur actif et rejoint la session (`PushNotificationService`) ;
 * - `push` — sinon une notification haute priorité de catégorie `TALKIE` : APNs
 *   `time-sensitive`, FCM data-only haute priorité sur Android, notification du
 *   service worker sur le web.
 *
 * Mêmes clés partout (`TalkieWakePushData`), plus `audioUrl` : la lecture du tampon en
 * mémoire par capacité signée (`talkieAudioToken.ts`, `routes/talkie-audio.ts`). C'est la
 * SEULE notification dont la voix se joue depuis la notification : quand la prise de
 * parole finit sans que personne l'ait rejointe, un push de SUIVI, même catégorie et même
 * `collapse-id`, remplace la bannière et PORTE l'audio au format des autres pièces jointes
 * (`attachmentUrl`, `attachmentMimeType: 'audio/aac'` — mime complet, jamais l'extension
 * nue —, taille, durée), que la NSE télécharge et que le lecteur existant joue. Le
 * réveil en direct ne porte pas de pièce jointe : à cet instant rien n'est encore dit.
 *
 * Le nom de l'émetteur suit `notification.showSenderName` du destinataire, les libellés
 * sa langue de CADRAGE (`recipient-language.ts`). Les préférences de livraison
 * (`pushEnabled`, Ne pas déranger) s'appliquent au chokepoint, comme à tout push.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  TALKIE_JOIN_WINDOW_MS,
  TALKIE_MAX_DURATION_MS,
  TALKIE_PUSH_TYPES,
  type TalkieWakePushData,
} from '@meeshy/shared/types/talkie';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import type { PushNotificationService, SendPushOptions } from '../PushNotificationService';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';
import type { TalkieWakeChannel } from './talkieGate';
import { talkieAudioUrl } from './talkieAudioToken';
import { retireOrphanPushToTalkTokens, type PushToTalkPrisma } from './pushToTalkTokens';

export const TALKIE_PUSH_CATEGORY = 'TALKIE';
/** Une voix réveillée vit au plus le temps d'une prise de parole et de sa fenêtre de rattrapage. */
export const TALKIE_WAKE_TTL_MS = TALKIE_MAX_DURATION_MS + TALKIE_JOIN_WINDOW_MS;
/** Le mime COMPLET des trames ADTS : la NSE ne reconnaît un audio qu'au préfixe `audio/`. */
export const TALKIE_AUDIO_MIME = 'audio/aac';

const WAKE_TOKEN_TYPES = ['pushtotalk', 'apns', 'fcm'] as const;

/** Le canal de réveil du destinataire : PushToTalk d'abord (session encore valide), sinon tout jeton APNs ou FCM actif, sinon `null`. */
export async function talkieWakeChannel(
  prisma: PushToTalkPrisma,
  userId: string,
  now: Date = new Date(),
): Promise<TalkieWakeChannel | null> {
  if (process.env.ENABLE_PUSH_NOTIFICATIONS === 'false') return null;
  await retireOrphanPushToTalkTokens(prisma, userId, now);
  const tokens = await prisma.pushToken.findMany({
    where: { userId, isActive: true, type: { in: [...WAKE_TOKEN_TYPES] } },
    select: { type: true },
  });
  if (tokens.some((token) => token.type === 'pushtotalk')) return 'pushtotalk';
  return tokens.length > 0 ? 'push' : null;
}

export type TalkieWakePhase =
  | { readonly phase: 'live'; readonly channel: TalkieWakeChannel }
  | { readonly phase: 'ended'; readonly availableUntil: Date; readonly bytes: number; readonly durationMs: number };

export type TalkieWakePushInput = {
  readonly talkieId: string;
  readonly toUserId: string;
  readonly fromUserId: string;
  /** `null` quand le destinataire masque le nom de l'expéditeur : titre neutre. */
  readonly fromName: string | null;
  readonly language: string | undefined;
  /** L'adresse signée de la voix gardée (`talkieAudioUrl`). */
  readonly audioUrl: string;
} & TalkieWakePhase;

type TalkieAttachmentFields = {
  readonly attachmentUrl: string;
  readonly attachmentMimeType: string;
  readonly attachmentDurationMs: string;
  readonly attachmentFileSize: string;
  readonly attachmentId: string;
  readonly attachmentLanguage: string;
};

export type TalkieWakePushPayloadData = TalkieWakePushData & {
  readonly phase: 'live' | 'ended';
  readonly audioUrl: string;
  readonly availableUntil?: string;
} & Partial<TalkieAttachmentFields>;

const attachmentOf = (input: TalkieWakePushInput): Partial<TalkieAttachmentFields> =>
  input.phase === 'ended'
    ? {
        availableUntil: input.availableUntil.toISOString(),
        attachmentUrl: input.audioUrl,
        attachmentMimeType: TALKIE_AUDIO_MIME,
        attachmentDurationMs: String(input.durationMs),
        attachmentFileSize: String(input.bytes),
        attachmentId: input.talkieId,
        attachmentLanguage: '',
      }
    : {};

export function buildTalkieWakePushes(input: TalkieWakePushInput): SendPushOptions[] {
  const title = input.fromName === null
    ? notificationString(input.language, 'talkie.incoming.titleHidden')
    : notificationString(input.language, 'talkie.incoming.title', { actor: input.fromName });
  const body = notificationString(input.language, 'talkie.incoming.body');
  const data: TalkieWakePushPayloadData = {
    type: TALKIE_PUSH_TYPES.INCOMING,
    talkieId: input.talkieId,
    fromUserId: input.fromUserId,
    fromName: input.fromName ?? '',
    title,
    body,
    phase: input.phase,
    audioUrl: input.audioUrl,
    ...attachmentOf(input),
  };
  const collapseId = `talkie-${input.talkieId}`;
  const ttlMs = TALKIE_WAKE_TTL_MS;

  if (input.phase === 'live' && input.channel === 'pushtotalk') {
    return [{ userId: input.toUserId, types: ['pushtotalk'], platforms: ['ios'], payload: { title, body, category: TALKIE_PUSH_CATEGORY, data } }];
  }
  return [
    {
      userId: input.toUserId,
      types: ['apns'],
      platforms: ['ios'],
      payload: { title, body, interruptionLevel: 'time-sensitive', category: TALKIE_PUSH_CATEGORY, collapseId, ttlMs, data },
    },
    {
      userId: input.toUserId,
      types: ['fcm'],
      platforms: ['android', 'web'],
      payload: { title, body, dataOnlyOnAndroid: true, category: TALKIE_PUSH_CATEGORY, collapseId, ttlMs, data },
    },
  ];
}

export type TalkieWakeDeps = {
  readonly prisma: Pick<PrismaClient, 'user' | 'userPreferences'>;
  readonly push: Pick<PushNotificationService, 'sendToUser'>;
  readonly now: () => Date;
};

/** Résout le nom affichable et la langue du destinataire, puis envoie le réveil (ou son suivi). */
export async function sendTalkieWake(
  deps: TalkieWakeDeps,
  params: { readonly talkieId: string; readonly fromUserId: string; readonly toUserId: string } & TalkieWakePhase,
): Promise<void> {
  const [sender, recipient, prefs] = await Promise.all([
    deps.prisma.user.findUnique({ where: { id: params.fromUserId }, select: { displayName: true, username: true } }),
    deps.prisma.user.findUnique({ where: { id: params.toUserId }, select: RECIPIENT_LANG_SELECT }),
    deps.prisma.userPreferences.findUnique({ where: { userId: params.toUserId }, select: { notification: true } }),
  ]);
  const notification = (prefs?.notification ?? {}) as Record<string, unknown>;
  const showName = notification.showSenderName !== false && sender !== null;
  const expiresAt = params.phase === 'ended' ? params.availableUntil : new Date(deps.now().getTime() + TALKIE_WAKE_TTL_MS);
  const pushes = buildTalkieWakePushes({
    ...params,
    fromName: showName ? sender.displayName || sender.username : null,
    language: recipientLanguage(recipient, 'fr'),
    audioUrl: talkieAudioUrl({ talkieId: params.talkieId, toUserId: params.toUserId, expiresAt }),
  });
  await Promise.all(pushes.map((push) => deps.push.sendToUser(push)));
}
