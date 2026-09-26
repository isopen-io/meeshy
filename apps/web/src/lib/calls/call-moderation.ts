import { MEMBER_ROLE_HIERARCHY, MemberRole } from '@meeshy/shared/types/role-types';

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
    path: `/api/v1/calls/${encodeURIComponent(target.callId)}/participants/${encodeURIComponent(target.userId)}`,
  });
  return result.ok;
}
