/**
 * QUI PEUT PARLER À QUI par le talkie (#13935, D-4) — jugé à l'ouverture d'une
 * prise de parole, puis REJUGÉ en arrière-plan pendant qu'elle dure
 * (`talkieRelay.ts`). Un fragment ne relit que la coupure (`talkieCut.ts`) : le
 * chemin critique ne touche jamais la base.
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
 * 3. la présence du destinataire n'est pas servie à l'émetteur (masquée, ou hors du
 *    niveau), ou il est en APPEL, en Ne pas déranger, ou sans appareil connecté ⇒
 *    `TALKIE_FALLBACK_VOICE` : l'émetteur envoie un message vocal. Le même code dans
 *    tous ces cas : il ne dit rien qu'on ne voie déjà.
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
import { SERVER_BLIND_REGIME_FILTER } from '../conversations/encryptionRegime';
import { accountParticipantIds, LIVE_CALL_PARTICIPATION } from '../calls/liveCallParticipations';

export type TalkieGateDb = Pick<
  PrismaClient,
  'user' | 'friendRequest' | 'userRelation' | 'relationFeatureSetting' | 'userPreferences' | 'participant' | 'callParticipant'
>;

export type TalkieRefusal = { readonly ok: false; readonly code: TalkieErrorCode; readonly message: string };
export type TalkieVerdict = { readonly ok: true } | TalkieRefusal;

const OPEN: TalkieVerdict = { ok: true };
const refuse = (code: TalkieErrorCode, message: string): TalkieRefusal => ({ ok: false, code, message });
export const TALKIE_NOT_ALLOWED: TalkieRefusal = refuse(TALKIE_ERROR_CODES.NOT_ALLOWED, 'Talkie indisponible');
const BLOCKED = refuse(TALKIE_ERROR_CODES.BLOCKED, 'Talkie indisponible');
const E2EE = refuse(TALKIE_ERROR_CODES.E2EE_CONVERSATION, 'Le talkie n’est pas chiffré de bout en bout : il est indisponible dans une conversation chiffrée');
const FALLBACK = refuse(TALKIE_ERROR_CODES.FALLBACK_VOICE, 'Envoie un message vocal');
export const TALKIE_UNAVAILABLE: TalkieRefusal = refuse(TALKIE_ERROR_CODES.UNAVAILABLE, 'Talkie momentanément indisponible');

const PARTY_SELECT = { id: true, role: true, isActive: true, deletedAt: true, deactivatedAt: true, birthDate: true } as const;

type Party = { readonly isActive: boolean; readonly deletedAt: Date | null; readonly deactivatedAt: Date | null };

/** Un compte qui peut parler ou être parlé : actif, ni supprimé, ni désactivé. */
const usable = <T extends Party>(party: T | null): party is T => !!party && party.isActive && !party.deletedAt && !party.deactivatedAt;

async function notificationPrefsOf(prisma: Pick<PrismaClient, 'userPreferences'>, userId: string): Promise<NotificationPreference> {
  const row = await prisma.userPreferences.findUnique({ where: { userId }, select: { notification: true } });
  return { ...NOTIFICATION_PREFERENCE_DEFAULTS, ...((row?.notification ?? {}) as Partial<NotificationPreference>) };
}

/**
 * La paire partage-t-elle une conversation DIRECTE active que le serveur ne lit pas ? Le
 * filtre canonique (`SERVER_BLIND_REGIME_FILTER`) : `e2ee` en toute casse, ou tout mode
 * inconnu — jamais une jumelle qui ouvrirait sur un mode qu'elle ne connaît pas.
 */
export async function pairHasE2eeDirectConversation(prisma: Pick<PrismaClient, 'participant'>, a: string, b: string): Promise<boolean> {
  const mine = await prisma.participant.findMany({
    where: { userId: a, isActive: true, conversation: { is: { type: 'direct', ...SERVER_BLIND_REGIME_FILTER } } },
    select: { conversationId: true },
  });
  if (mine.length === 0) return false;
  const shared = await prisma.participant.findFirst({
    where: { userId: b, isActive: true, conversationId: { in: mine.map((m) => m.conversationId) } },
    select: { id: true },
  });
  return shared !== null;
}

/** Le destinataire est-il dans un appel en cours ? Lu par ses `Participant.id` (clé indexée, #10831). */
async function inActiveCall(prisma: Pick<PrismaClient, 'participant' | 'callParticipant'>, userId: string): Promise<boolean> {
  const participantIds = await accountParticipantIds(prisma, userId);
  if (participantIds.length === 0) return false;
  const live = await prisma.callParticipant.findFirst({
    where: { participantId: { in: participantIds }, ...LIVE_CALL_PARTICIPATION, callSession: { is: { status: 'active' } } },
    select: { id: true },
  });
  return live !== null;
}

export type TalkieGateDeps = {
  readonly prisma: TalkieGateDb;
  readonly now: () => Date;
  readonly recipientConnected: (userId: string) => Promise<boolean>;
  /** La présence du destinataire est-elle SERVIE à l'émetteur (`resolvePresenceVisibility`) ? */
  readonly presenceServed: (viewer: { readonly userId: string; readonly role: string }, targetId: string) => Promise<boolean>;
};

export async function judgeTalkie(
  deps: TalkieGateDeps,
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
  if (!usable(sender) || !usable(recipient)) return TALKIE_NOT_ALLOWED;

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
    viewerRole: sender.role,
    targetRole: recipient.role,
    feature: 'talkie',
    consent: receives ? 'granted' : 'refused',
  });
  if (!verdict.allowed) return verdict.reason === 'consent' ? BLOCKED : TALKIE_NOT_ALLOWED;

  if (await pairHasE2eeDirectConversation(prisma, fromUserId, toUserId)) return E2EE;

  // La disponibilité (appel, Ne pas déranger, appareils connectés) n'est lue que si la
  // présence du destinataire est SERVIE à l'émetteur : sinon le même repli, quel que soit
  // l'état — le talkie ne devient pas un oracle de la présence que la cible a masquée.
  if (!(await deps.presenceServed({ userId: fromUserId, role: sender.role }, toUserId))) return FALLBACK;
  const [busy, connected] = await Promise.all([inActiveCall(prisma, toUserId), deps.recipientConnected(toUserId)]);
  if (busy || !connected || isWithinDnd(prefs, now)) return FALLBACK;
  return OPEN;
}
