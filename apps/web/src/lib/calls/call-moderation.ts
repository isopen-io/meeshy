import { MEMBER_ROLE_HIERARCHY, MemberRole } from '@meeshy/shared/types/role-types';
import * as callsEndpoints from '@meeshy/shared/api/endpoints/calls';

import type { ConversationMember } from '@/lib/api/conversation-members';
import type { ConversationsDeps } from '@/lib/api/conversations';

/**
 * RETIRER QUELQU'UN D'UN APPEL DE GROUPE (#3721, parité I3) — la règle de la
 * route `DELETE /calls/:callId/participants/:participantId` : au moins
 * modérateur, et strictement au-dessus du rang visé. Le serveur la rejoue ;
 * l'écran ne propose le geste qu'à qui le verra aboutir.
 */

const rank = (role: string | undefined): number => MEMBER_ROLE_HIERARCHY[(role ?? '').toLowerCase() as MemberRole] ?? 0;

export function canRemoveFromCall(viewerRole: string | undefined, targetRole: string | undefined): boolean {
  const viewer = rank(viewerRole);
  return viewer >= MEMBER_ROLE_HIERARCHY[MemberRole.MODERATOR] && viewer > rank(targetRole);
}

/**
 * QUI MODÈRE UN APPEL (#8438) — miroir de `mayModerateCallParticipant`
 * (`services/gateway/src/services/calls/callModerationPolicy.ts`) : celui qui
 * a LANCÉ l'appel en est l'admin tant qu'il y est — et l'écran d'appel n'existe
 * que pour qui y est ; s'y ajoutent les modérateurs et plus de la conversation
 * qui DÉPASSENT la cible en rang. Nul ne se modère soi-même. La passerelle
 * rejoue la loi : l'écran ne propose le geste qu'à qui le verra aboutir.
 */
export type CallModerationContext = {
  readonly viewerId: string | null;
  readonly initiatorId: string | null;
  readonly roles: ReadonlyMap<string, string>;
};

export function mayModerateInCall(context: CallModerationContext, targetId: string): boolean {
  const { viewerId } = context;
  if (viewerId === null || viewerId === targetId) return false;
  if (context.initiatorId === viewerId) return true;
  return canRemoveFromCall(context.roles.get(viewerId), context.roles.get(targetId));
}

/** Les gestes de modération offerts sur une personne de l'appel (#8438). */
export type CallModeration = {
  readonly canModerate: (userId: string) => boolean;
  readonly mute: (userId: string) => void;
  readonly remove: (userId: string) => void;
};

/** Rang de chaque membre, sous la clé qu'un appel donne à ses participants : le compte, ou le participant d'un invité. */
export function callRoles(members: readonly ConversationMember[] | undefined): ReadonlyMap<string, string> {
  return new Map((members ?? []).map((member) => [member.userId ?? member.id, member.role]));
}

export async function removeFromCall(
  deps: Pick<ConversationsDeps, 'source' | 'transport'>,
  target: { readonly callId: string; readonly userId: string },
): Promise<boolean> {
  if (deps.source === 'fixtures') return false;
  const result = await deps.transport.request<unknown>({
    method: 'DELETE',
    path: callsEndpoints.byCallIdParticipantsByParticipantId(target.callId, target.userId),
  });
  return result.ok;
}
