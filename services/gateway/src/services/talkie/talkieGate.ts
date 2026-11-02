/**
 * QUI PEUT PARLER À QUI par le talkie (#13935, D-4) — jugé UNE fois, à
 * l'ouverture d'une prise de parole. Les fragments qui suivent ne relisent que
 * la coupure (`talkieCut.ts`) : le chemin critique ne touche jamais la base.
 *
 * ## L'ordre des verdicts
 *
 * 1. la LOI (`resolveRelationAccess`, feature `talkie`) sur le niveau du site
 *    unique (`niveauEffectif`) : dès Proche, rien si l'un a bloqué l'autre, aucun
 *    refus d'âge. Le consentement qu'elle exige est la PRÉFÉRENCE DE RÉCEPTION du
 *    destinataire (#14407), active par défaut, coupée pour cette personne
 *    (`talkieBlockedAt`) ou pour tous (`notification.talkieEnabled`) ⇒
 *    `TALKIE_BLOCKED` ; tout autre refus ⇒ `TALKIE_NOT_ALLOWED`, indistincts ;
 * 2. la paire a une conversation directe CHIFFRÉE DE BOUT EN BOUT ⇒
 *    `TALKIE_E2EE_CONVERSATION` (E10, #14408) : le relais est en clair au MVP, et
 *    rien de clair ne passe à côté d'une conversation que les deux ont chiffrée ;
 * 3. le destinataire est en APPEL, en Ne pas déranger, ou n'a aucun appareil
 *    connecté ⇒ `TALKIE_FALLBACK_VOICE` : l'émetteur envoie un message vocal.
 *
 * Les étapes 2 et 3 ne se jugent qu'APRÈS la loi : un inconnu n'apprend ni le
 * chiffrement d'une paire, ni la disponibilité de quelqu'un.
 *
 * Une lecture qui échoue FERME (`TALKIE_UNAVAILABLE`) : une voix ne part pas sur
 * un doute.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { NOTIFICATION_PREFERENCE_DEFAULTS, type NotificationPreference } from '@meeshy/shared/types/preferences/notification';
import { TALKIE_ERROR_CODES, type TalkieErrorCode } from '@meeshy/shared/types/talkie';
import { declaredAgeClass } from '@meeshy/shared/utils/age';
import { isWithinDnd } from '@meeshy/shared/utils/notification-dnd';
import { resolveRelationAccess } from '@meeshy/shared/utils/relation-access';
import { isBlockedBetween } from '../../utils/blocking';
import { niveauEffectif } from '../friendship';

export type TalkieGateDb = Pick<
  PrismaClient,
  'user' | 'friendRequest' | 'userRelation' | 'relationFeatureSetting' | 'userPreferences' | 'participant' | 'callParticipant'
>;

export type TalkieVerdict = { readonly ok: true } | { readonly ok: false; readonly code: TalkieErrorCode; readonly message: string };

const OPEN: TalkieVerdict = { ok: true };
const refuse = (code: TalkieErrorCode, message: string): TalkieVerdict => ({ ok: false, code, message });
export const TALKIE_NOT_ALLOWED = refuse(TALKIE_ERROR_CODES.NOT_ALLOWED, 'Talkie indisponible');
const BLOCKED = refuse(TALKIE_ERROR_CODES.BLOCKED, 'Talkie indisponible');
const E2EE = refuse(TALKIE_ERROR_CODES.E2EE_CONVERSATION, 'Le talkie n’est pas chiffré de bout en bout : il est indisponible dans une conversation chiffrée');
const FALLBACK = refuse(TALKIE_ERROR_CODES.FALLBACK_VOICE, 'Envoie un message vocal');
export const TALKIE_UNAVAILABLE = refuse(TALKIE_ERROR_CODES.UNAVAILABLE, 'Talkie momentanément indisponible');

const PARTY_SELECT = { id: true, deactivatedAt: true, birthDate: true } as const;

async function notificationPrefsOf(prisma: Pick<PrismaClient, 'userPreferences'>, userId: string): Promise<NotificationPreference> {
  const row = await prisma.userPreferences.findUnique({ where: { userId }, select: { notification: true } });
  return { ...NOTIFICATION_PREFERENCE_DEFAULTS, ...((row?.notification ?? {}) as Partial<NotificationPreference>) };
}

/** La paire partage-t-elle une conversation DIRECTE active chiffrée de bout en bout ? */
export async function pairHasE2eeDirectConversation(prisma: Pick<PrismaClient, 'participant'>, a: string, b: string): Promise<boolean> {
  const mine = await prisma.participant.findMany({
    where: { userId: a, isActive: true, conversation: { is: { type: 'direct', encryptionMode: 'e2ee' } } },
    select: { conversationId: true },
  });
  if (mine.length === 0) return false;
  const shared = await prisma.participant.findFirst({
    where: { userId: b, isActive: true, conversationId: { in: mine.map((m) => m.conversationId) } },
    select: { id: true },
  });
  return shared !== null;
}

/** Le destinataire est-il dans un appel en cours ? */
async function inActiveCall(prisma: Pick<PrismaClient, 'callParticipant'>, userId: string): Promise<boolean> {
  const live = await prisma.callParticipant.findFirst({
    where: { leftAt: null, participant: { is: { userId } }, callSession: { is: { status: 'active' } } },
    select: { id: true },
  });
  return live !== null;
}

export async function judgeTalkie(
  deps: { readonly prisma: TalkieGateDb; readonly now: () => Date; readonly recipientConnected: (userId: string) => Promise<boolean> },
  fromUserId: string,
  toUserId: string,
): Promise<TalkieVerdict> {
  const { prisma } = deps;
  const [blocked, level, sender, recipient, setting, prefs] = await Promise.all([
    isBlockedBetween(prisma, fromUserId, toUserId),
    niveauEffectif(prisma, fromUserId, toUserId),
    prisma.user.findUnique({ where: { id: fromUserId }, select: PARTY_SELECT }),
    prisma.user.findUnique({ where: { id: toUserId }, select: PARTY_SELECT }),
    prisma.relationFeatureSetting.findUnique({
      where: { ownerId_otherId: { ownerId: toUserId, otherId: fromUserId } },
      select: { talkieBlockedAt: true },
    }),
    notificationPrefsOf(prisma, toUserId),
  ]);
  if (!sender || !recipient || sender.deactivatedAt || recipient.deactivatedAt) return TALKIE_NOT_ALLOWED;

  const now = deps.now();
  const receives = prefs.talkieEnabled !== false && !setting?.talkieBlockedAt;
  const verdict = resolveRelationAccess({
    viewerId: fromUserId,
    targetId: toUserId,
    grantedByViewer: level,
    grantedByTarget: level,
    sharesCommunity: false,
    blockedEitherWay: blocked,
    viewerMinor: declaredAgeClass(sender.birthDate, now),
    targetMinor: declaredAgeClass(recipient.birthDate, now),
    feature: 'talkie',
    consent: receives ? 'granted' : 'refused',
  });
  if (!verdict.allowed) return verdict.reason === 'consent' ? BLOCKED : TALKIE_NOT_ALLOWED;

  if (await pairHasE2eeDirectConversation(prisma, fromUserId, toUserId)) return E2EE;

  const [busy, connected] = await Promise.all([inActiveCall(prisma, toUserId), deps.recipientConnected(toUserId)]);
  if (busy || !connected || isWithinDnd(prefs, now)) return FALLBACK;
  return OPEN;
}
