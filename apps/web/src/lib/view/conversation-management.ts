import { hasMinimumMemberRole, MemberRole, memberRoleLevel } from '@meeshy/shared/types/role-types';

import type { ConversationMember } from '@/lib/api/conversation-members';

/**
 * **QUI PEUT QUOI DANS LA FEUILLE D'UNE CONVERSATION** (#10613, #7836) — la loi
 * de `MemberActionPolicy.swift` et de `ConversationSettingsView.swift`, une
 * seule fois pour le web. Elle ne décide que de ce que la feuille MONTRE : la
 * passerelle reste juge de chaque geste (`participant-role-core.ts`,
 * `participant-removal.ts`, `participant-ban-core.ts`, `core-lifecycle.ts`).
 *
 * Les planchers sont ceux de la passerelle : changer un rang exige ADMIN,
 * expulser et bannir MODÉRATEUR, et tous trois un rang STRICTEMENT supérieur à
 * celui de la cible — personne ne touche donc au créateur. Un visiteur sans
 * compte n'a pas de rang à changer (la route le refuse,
 * `PARTICIPANT_HAS_NO_ACCOUNT`) ; il s'expulse par son identifiant de
 * participant, sa seule identité.
 */
export type MemberActionKind = 'promote-admin' | 'promote-moderator' | 'demote-member' | 'expel' | 'ban';

export type MemberAction = {
  readonly kind: MemberActionKind;
  /** `User.id` d'un compte, `Participant.id` d'un visiteur sans compte. */
  readonly targetKey: string;
};

export type ConversationRoleName = 'admin' | 'moderator' | 'member';

const ROLE_OF: Readonly<Record<MemberActionKind, ConversationRoleName | null>> = {
  'promote-admin': 'admin',
  'promote-moderator': 'moderator',
  'demote-member': 'member',
  expel: null,
  ban: null,
};

export const roleOfAction = (kind: MemberActionKind): ConversationRoleName | null => ROLE_OF[kind];

/** Les conversations dont la feuille ne gère rien : un tête-à-tête n'a pas de hiérarchie, la globale ne se modifie pas. */
const UNMANAGED_TYPES: ReadonlySet<string> = new Set(['direct', 'global']);

export function memberActionsFor(params: {
  readonly member: ConversationMember;
  readonly viewerRole: string | null | undefined;
  readonly viewerId: string;
  readonly conversationType: string;
}): readonly MemberAction[] {
  const { member, viewerId } = params;
  if (UNMANAGED_TYPES.has(params.conversationType)) return [];
  if (member.userId !== null && member.userId === viewerId) return [];

  const viewer = memberRoleLevel(params.viewerRole ?? '');
  const target = memberRoleLevel(member.role) || memberRoleLevel(MemberRole.MEMBER);
  if (viewer <= target) return [];

  const atLeast = (role: MemberRole): boolean => viewer >= memberRoleLevel(role);
  const hasAccount = member.userId !== null;
  const ranks: readonly MemberActionKind[] = hasAccount
    ? [
        ...(viewer === memberRoleLevel(MemberRole.CREATOR) && target < memberRoleLevel(MemberRole.ADMIN) ? (['promote-admin'] as const) : []),
        ...(atLeast(MemberRole.ADMIN) && target === memberRoleLevel(MemberRole.MEMBER) ? (['promote-moderator'] as const) : []),
        ...(atLeast(MemberRole.ADMIN) && target > memberRoleLevel(MemberRole.MEMBER) ? (['demote-member'] as const) : []),
      ]
    : [];
  const removals: readonly MemberActionKind[] = atLeast(MemberRole.MODERATOR) ? ['expel', 'ban'] : [];
  const targetKey = member.userId ?? member.id;
  return [...ranks, ...removals].map((kind) => ({ kind, targetKey }));
}

export type ConversationManagement = {
  /** Photo, nom, description — MODÉRATEUR et plus (`core-lifecycle.ts`, PATCH `/conversations/:id`). */
  readonly editIdentity: boolean;
  /** Qui peut écrire, annonces, mode lent, traduction automatique — ADMIN et plus. */
  readonly editPermissions: boolean;
  /** `POST /conversations/:id/participants` — MODÉRATEUR et plus. */
  readonly addMembers: boolean;
};

const NOTHING: ConversationManagement = { editIdentity: false, editPermissions: false, addMembers: false };

export function managementOf(conversation: { readonly type: string; readonly currentUserRole?: string | null | undefined }): ConversationManagement {
  if (UNMANAGED_TYPES.has(conversation.type)) return NOTHING;
  const role = conversation.currentUserRole ?? '';
  const moderator = hasMinimumMemberRole(role, MemberRole.MODERATOR);
  return {
    editIdentity: moderator,
    editPermissions: hasMinimumMemberRole(role, MemberRole.ADMIN),
    addMembers: moderator,
  };
}
