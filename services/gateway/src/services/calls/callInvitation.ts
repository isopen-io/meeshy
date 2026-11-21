import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { CALL_MAX_PARTICIPANTS } from '@meeshy/shared/types/call-rules';
import { CALL_TERMINAL_STATUSES } from '@meeshy/shared/types/video-call';
import type { CallControlErrorCode, CallInvitedUser } from '@meeshy/shared/types/call-controls';
import { MemberRole } from '@meeshy/shared/types/role-types';
import { actorHasMinimumRole } from '@meeshy/shared/utils/conversation-authority';
import type { CallService } from '../CallService';
import { amitieAcceptee } from '../friendship';
import { activeCallStanding } from './callModerationPolicy';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';
import { isConversationClosed } from '../messaging/conversationWriteAdmission';
import { newMemberRefusal } from '../conversations/newMemberAdmission';
import { loadSalonCommunity, planSalonEntry, type SalonCommunity } from '../conversations/communityMembershipSync';
import { callInvitationRoute, type CallInvitationRoute } from './callInvitationRoute';

/**
 * INVITER UNE PERSONNE DANS UN APPEL EN COURS (#8433).
 *
 * Un participant CONNECTÉ invite un de ses amis acceptés, membre ou non de la
 * conversation. L'invitation est notée sur la session (`invitedUserIds`) : elle
 * vit et meurt avec l'appel, n'a pas de cycle propre, et une liste suffit là où
 * un modèle dédié n'ajouterait qu'une jointure. Elle ouvre CET appel seulement.
 *
 * `CallParticipant` pointe une participation de CONVERSATION (`participantId`
 * requis) : une personne invitée qui décroche reçoit donc une participation
 * INACTIVE (`isActive: false`, `role: 'call-guest'`, aucun droit). Tout ce qui
 * garde la conversation filtre `isActive: true` — elle n'y lit rien, n'y écrit
 * rien, n'apparaît dans aucune liste de membres. Si elle y est ajoutée plus
 * tard, la porte d'adhésion réutilise cette ligne (chemin « rejoin ») et
 * l'écrase avec les droits d'un membre.
 */

export const CALL_GUEST_ROLE = 'call-guest';

const TERMINAL: ReadonlySet<string> = new Set(CALL_TERMINAL_STATUSES);

const GUEST_PERMISSIONS = Object.freeze({
  canSendMessages: false,
  canSendFiles: false,
  canSendImages: false,
  canSendVideos: false,
  canSendAudios: false,
  canSendLocations: false,
  canSendLinks: false,
  canViewHistory: false,
});

type InvitationPrisma = Pick<
  PrismaClient,
  'friendRequest' | 'userRelation' | 'user' | 'participant' | 'callSession' | 'conversation' | 'community' | 'communityMember'
>;

type InvitableSession = Awaited<ReturnType<CallService['getCallSession']>>;

export type CallInvitationDeps = {
  readonly prisma: InvitationPrisma;
  readonly callService: Pick<CallService, 'getCallSession'>;
  /** Les invitées dont la sonnerie court encore (`CallInvitationLifecycle.pendingFor`) : elles comptent dans le plafond. */
  readonly ringingInviteeIds?: (callId: string) => readonly string[];
};

/** La conversation de l'appel, telle que les gardes d'entrée la lisent. */
export type CallInvitationConversation = {
  readonly id: string;
  readonly type: string;
  readonly encryptionMode: string | null;
  readonly isActive: boolean | null;
  readonly closedAt: Date | null;
  readonly communityId: string | null;
};

export type CallInvitationGrant = {
  readonly ok: true;
  readonly session: InvitableSession;
  readonly inviter: CallInvitedUser;
  readonly invitee: CallInvitedUser;
  readonly activeCount: number;
  /** #19650 — où mène l'invitation (`callInvitationRoute`). */
  readonly route: CallInvitationRoute;
  readonly conversation: CallInvitationConversation;
  /** La communauté privée du salon, lue une fois pour l'admission (#16695). */
  readonly community: SalonCommunity | null;
  /** L'invité est déjà membre actif de la conversation de l'appel : il sonne seulement. */
  readonly inviteeIsMember: boolean;
};

export type CallInvitationRefusal = { readonly ok: false; readonly code: CallControlErrorCode };

const refuse = (code: CallControlErrorCode): CallInvitationRefusal => ({ ok: false, code });

const isBanned = (row: { bannedAt?: Date | null } | null): boolean => Boolean(row?.bannedAt);

/**
 * Les gardes, TOUTES avant la première écriture (#19650, fail-closed) : appel
 * vivant et inviteur connecté ; appel en tête-à-tête décroché (D5) ; plafond
 * compté avec les invitations qui sonnent ; ami accepté ; aucun blocage avec un
 * participant présent ; et, quand l'invité entre dans la conversation de
 * l'appel, les gardes d'entrée de cette conversation (close, externe, banni,
 * salon de communauté privée). Un compte désactivé ou supprimé ne s'invite pas.
 *
 * Audit #19650 — un ANCIEN membre du groupe (ligne inactive, non bannie : retiré
 * par un modérateur, parti, « supprimé pour moi ») n'y revient que par le rang
 * de la porte d'ajout (MODERATOR, `callEntryForInvitee`). Invité par un simple
 * membre, il devient l'invité de CET appel (`legacy-guest`), sans retrouver le
 * groupe ni les messages postés pendant son absence.
 */
export async function authorizeCallInvitation(
  deps: CallInvitationDeps,
  input: { readonly callId: string; readonly inviterUserId: string; readonly inviteeUserId: string }
): Promise<CallInvitationGrant | CallInvitationRefusal> {
  const session = await deps.callService.getCallSession(input.callId).catch(() => null);
  if (!session) return refuse('NOT_A_PARTICIPANT');
  if (TERMINAL.has(session.status)) return refuse('CALL_NOT_ACTIVE');
  if (!activeCallStanding(session, input.inviterUserId)) return refuse('NOT_A_PARTICIPANT');
  if (input.inviteeUserId === input.inviterUserId || activeCallStanding(session, input.inviteeUserId)) {
    return refuse('ALREADY_IN_CALL');
  }

  const conversation = await deps.prisma.conversation.findUnique({
    where: { id: session.conversationId },
    select: { id: true, type: true, encryptionMode: true, isActive: true, closedAt: true, communityId: true },
  });
  if (!conversation || isConversationClosed(conversation)) return refuse('CALL_NOT_ACTIVE');
  if (conversation.type === 'direct' && !session.answeredAt) return refuse('CALL_NOT_ACTIVE');

  const present = session.participants.filter((p) => !p.leftAt);
  const ringing = (deps.ringingInviteeIds?.(input.callId) ?? []).filter((id) => id !== input.inviteeUserId);
  if (present.length + ringing.length + 1 > CALL_MAX_PARTICIPANTS) return refuse('MAX_PARTICIPANTS_REACHED');
  if (!(await amitieAcceptee(deps.prisma, input.inviterUserId, input.inviteeUserId))) return refuse('NOT_A_CONTACT');

  const users = await deps.prisma.user.findMany({
    where: { id: { in: [input.inviterUserId, input.inviteeUserId] } },
    select: { id: true, username: true, displayName: true, avatar: true, isActive: true, deletedAt: true },
  });
  const toInvited = (id: string): CallInvitedUser | null => {
    const user = users.find((u) => u.id === id);
    return user
      ? { userId: user.id, username: user.username, displayName: user.displayName ?? null, avatar: user.avatar ?? null }
      : null;
  };
  const inviter = toInvited(input.inviterUserId);
  const invitee = toInvited(input.inviteeUserId);
  if (!inviter || !invitee || !isLiveAccount(users.find((u) => u.id === input.inviteeUserId))) return refuse('NOT_A_CONTACT');

  const presentUserIds = present.flatMap((p) => (p.participant?.userId ? [p.participant.userId] : []));
  if (await blockedWithAnyone(deps.prisma, input.inviteeUserId, presentUserIds)) return refuse('PERMISSION_DENIED');

  const entry = await callEntryForInvitee(deps.prisma, {
    conversationId: session.conversationId,
    inviterUserId: input.inviterUserId,
    inviteeUserId: input.inviteeUserId,
  });
  if (entry === 'banned') return refuse('PERMISSION_DENIED');

  const conversationRoute = callInvitationRoute(conversation);
  const route = conversationRoute === 'admit-member' && entry === 'guest-only' ? 'legacy-guest' : conversationRoute;
  const community = route === 'admit-member'
    ? await loadSalonCommunity(deps.prisma, { communityId: conversation.communityId, actorId: input.inviterUserId })
    : null;
  if (route === 'admit-member') {
    if (newMemberRefusal(conversation)) return refuse('PERMISSION_DENIED');
    const entry = await planSalonEntry(deps.prisma, community, { kind: 'registered', userId: input.inviteeUserId });
    if (entry.kind === 'refused') return refuse('PERMISSION_DENIED');
  }

  return {
    ok: true,
    session,
    inviter,
    invitee,
    activeCount: present.length,
    route,
    conversation,
    community,
    inviteeIsMember: entry === 'member',
  };
}

const isLiveAccount = (user: { readonly isActive?: boolean | null; readonly deletedAt?: Date | null } | undefined): boolean =>
  Boolean(user) && user?.isActive !== false && !user?.deletedAt;

/**
 * Comment l'invité entre dans la conversation `conversationId` par l'appel :
 * `member` (déjà membre actif : il sonne seulement), `banned` (refusé), `admit`
 * (la porte d'ajout le fait entrer), `guest-only` (ancien membre qu'un inviteur
 * sous MODERATOR ne peut pas réintégrer : invité de CET appel seulement).
 */
export type CallInviteeEntry = 'member' | 'banned' | 'admit' | 'guest-only';

export async function callEntryForInvitee(
  prisma: Pick<PrismaClient, 'participant' | 'user'>,
  input: { readonly conversationId: string; readonly inviterUserId: string; readonly inviteeUserId: string }
): Promise<CallInviteeEntry> {
  const row = await prisma.participant.findFirst({
    where: { conversationId: input.conversationId, userId: input.inviteeUserId },
    select: { id: true, bannedAt: true, isActive: true },
  });
  if (!row) return 'admit';
  if (isBanned(row)) return 'banned';
  if (row.isActive === true) return 'member';
  return (await inviterMayReadmit(prisma, input)) ? 'admit' : 'guest-only';
}

/** Le rang de `POST /conversations/:id/participants` : MODERATOR du groupe, ou administrateur de la plateforme qui y est. */
async function inviterMayReadmit(
  prisma: Pick<PrismaClient, 'participant' | 'user'>,
  input: { readonly conversationId: string; readonly inviterUserId: string }
): Promise<boolean> {
  const [row, user] = await Promise.all([
    prisma.participant.findFirst({
      where: { conversationId: input.conversationId, userId: input.inviterUserId, isActive: true },
      select: { role: true },
    }),
    prisma.user.findUnique({ where: { id: input.inviterUserId }, select: { role: true } }),
  ]);
  return actorHasMinimumRole({ conversationRole: row?.role ?? null, platformRole: user?.role ?? null }, MemberRole.MODERATOR);
}

/** Un blocage, dans un sens ou dans l'autre, entre l'invité et UN des participants présents — une lecture. */
export async function blockedWithAnyone(
  prisma: Pick<PrismaClient, 'user'>,
  inviteeUserId: string,
  presentUserIds: readonly string[]
): Promise<boolean> {
  const others = presentUserIds.filter((id) => id !== inviteeUserId);
  if (others.length === 0) return false;
  const match = await prisma.user.findFirst({
    where: {
      OR: [
        { id: inviteeUserId, blockedUserIds: { hasSome: [...others] } },
        { id: { in: [...others] }, blockedUserIds: { has: inviteeUserId } },
      ],
    },
    select: { id: true },
  });
  return match !== null;
}

/** `true` quand l'invitation est NOUVELLE — ré-inviter la même personne n'écrit rien. */
export async function recordCallInvitation(
  prisma: Pick<PrismaClient, 'callSession'>,
  session: { readonly id: string; readonly invitedUserIds?: readonly string[] | null },
  inviteeUserId: string
): Promise<boolean> {
  if (session.invitedUserIds?.includes(inviteeUserId)) return false;
  await prisma.callSession.update({
    where: { id: session.id },
    data: { invitedUserIds: { push: inviteeUserId } },
  });
  return true;
}

/**
 * L'appel nomme-t-il cette clé parmi ses invités ? Un invité de lien ne sonne
 * pas au premier appel (`ringableCallees`) et `call:join` par socket le refuse :
 * `call:check-active` ne lui rejoue (bannière, TURN neufs) que l'appel qui
 * l'INVITE (#10473).
 */
export function isInvitedToCall(
  session: { readonly invitedUserIds?: readonly string[] | null },
  key: string
): boolean {
  return (session.invitedUserIds ?? []).includes(key);
}

/**
 * La participation par laquelle une personne INVITÉE rejoint cet appel — `null`
 * si elle n'y est pas invitée, si l'appel est terminé, ou si elle est bannie de
 * la conversation. Un membre actif ne passe pas par ici : sa propre
 * participation le fait rejoindre.
 */
export async function resolveInvitedGuestParticipantId(
  prisma: Pick<PrismaClient, 'user' | 'participant' | 'callSession'>,
  input: { readonly callId: string; readonly userId: string },
  now: Date = new Date()
): Promise<string | null> {
  const call = await prisma.callSession.findUnique({
    where: { id: input.callId },
    select: { conversationId: true, status: true, invitedUserIds: true },
  });
  if (!call || TERMINAL.has(call.status) || !(call.invitedUserIds ?? []).includes(input.userId)) return null;

  const existing = await prisma.participant.findFirst({
    where: { conversationId: call.conversationId, userId: input.userId },
    select: { id: true, bannedAt: true },
  });
  if (existing) return isBanned(existing) ? null : existing.id;

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { username: true, displayName: true, avatar: true, ...RECIPIENT_LANG_SELECT },
  });
  if (!user) return null;

  const created = await prisma.participant
    .create({
    data: {
      conversationId: call.conversationId,
      userId: input.userId,
      type: 'user',
      displayName: user.displayName ?? user.username,
      avatar: user.avatar,
      role: CALL_GUEST_ROLE,
      language: recipientLanguage(user, 'en'),
      permissions: { ...GUEST_PERMISSIONS },
      isActive: false,
      joinedAt: now,
      leftAt: now,
    },
    select: { id: true },
  })
    .catch(async (error: unknown) => {
      // Deux appareils qui décrochent ensemble : l'index d'identité refuse la
      // seconde écriture, la ligne de la première sert aux deux.
      if ((error as { code?: string } | null)?.code !== 'P2002') throw error;
      return prisma.participant.findFirst({
        where: { conversationId: call.conversationId, userId: input.userId },
        select: { id: true },
      });
    });
  return created?.id ?? null;
}
