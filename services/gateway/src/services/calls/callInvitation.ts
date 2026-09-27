import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { CALL_MAX_PARTICIPANTS } from '@meeshy/shared/types/call-rules';
import { CALL_TERMINAL_STATUSES } from '@meeshy/shared/types/video-call';
import type { CallControlErrorCode, CallInvitedUser } from '@meeshy/shared/types/call-controls';
import type { CallService } from '../CallService';
import { amitieAcceptee } from '../friendship';
import { activeCallStanding } from './callModerationPolicy';

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

type InvitationPrisma = Pick<PrismaClient, 'friendRequest' | 'user' | 'participant' | 'callSession'>;

type InvitableSession = Awaited<ReturnType<CallService['getCallSession']>>;

export type CallInvitationDeps = {
  readonly prisma: InvitationPrisma;
  readonly callService: Pick<CallService, 'getCallSession'>;
};

export type CallInvitationGrant = {
  readonly ok: true;
  readonly session: InvitableSession;
  readonly inviter: CallInvitedUser;
  readonly invitee: CallInvitedUser;
  readonly activeCount: number;
};

export type CallInvitationRefusal = { readonly ok: false; readonly code: CallControlErrorCode };

const refuse = (code: CallControlErrorCode): CallInvitationRefusal => ({ ok: false, code });

const isBanned = (row: { bannedAt?: Date | null } | null): boolean => Boolean(row?.bannedAt);

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
  const activeCount = session.participants.filter((p) => !p.leftAt).length;
  if (activeCount >= CALL_MAX_PARTICIPANTS) return refuse('MAX_PARTICIPANTS_REACHED');
  if (!(await amitieAcceptee(deps.prisma, input.inviterUserId, input.inviteeUserId))) return refuse('NOT_A_CONTACT');

  const users = await deps.prisma.user.findMany({
    where: { id: { in: [input.inviterUserId, input.inviteeUserId] } },
    select: { id: true, username: true, displayName: true, avatar: true },
  });
  const toInvited = (id: string): CallInvitedUser | null => {
    const user = users.find((u) => u.id === id);
    return user
      ? { userId: user.id, username: user.username, displayName: user.displayName ?? null, avatar: user.avatar ?? null }
      : null;
  };
  const inviter = toInvited(input.inviterUserId);
  const invitee = toInvited(input.inviteeUserId);
  if (!inviter || !invitee) return refuse('NOT_A_CONTACT');

  const membership = await deps.prisma.participant.findFirst({
    where: { conversationId: session.conversationId, userId: input.inviteeUserId },
    select: { id: true, bannedAt: true },
  });
  if (isBanned(membership)) return refuse('PERMISSION_DENIED');

  return { ok: true, session, inviter, invitee, activeCount };
}

export async function recordCallInvitation(
  prisma: Pick<PrismaClient, 'callSession'>,
  session: { readonly id: string; readonly invitedUserIds?: readonly string[] | null },
  inviteeUserId: string
): Promise<void> {
  if (session.invitedUserIds?.includes(inviteeUserId)) return;
  await prisma.callSession.update({
    where: { id: session.id },
    data: { invitedUserIds: { push: inviteeUserId } },
  });
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
    select: { username: true, displayName: true, avatar: true },
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
