/**
 * CE QU'UN LECTEUR PEUT FAIRE D'UNE CONVERSATION (#11205) — jumelle PURE de
 * `messageActionsFor`. Rang effectif de `conversation-authority` : ADMIN ou
 * BIGBOSS de plateforme MEMBRE ⇒ créateur, jamais au-dessus ; MODERATOR, AUDIT,
 * ANALYST y sont des membres ; rang illisible < membre. Fermé en plus : un
 * `direct` n'a pas d'autorité (ses rangs sont un ordre d'arrivée) ; Global ne se
 * renomme, ne se quitte ni ne se supprime pour tous, et seuls ADMIN/BIGBOSS y
 * invitent ; une conversation terminée ne se modifie plus ; un type inconnu
 * n'ouvre rien qui en dépende. L'appel suit `canStartCall`.
 */

import { MEMBER_ROLE_HIERARCHY } from '../types/role-types.js';
import { canStartCall } from './call-permission.js';
import { GLOBAL_CONVERSATION_TYPE } from './global-minor-restriction.js';
import {
  conversationIsClosed,
  memberRankOf,
  platformAdministers,
  type ActionConversation,
  type ActionViewer,
} from './message-action-policy.js';

export type ConversationActionInput = {
  readonly conversation: ActionConversation;
  readonly viewer: ActionViewer;
};

export type ConversationActions = {
  readonly rename: boolean;
  readonly invite: boolean;
  readonly leave: boolean;
  readonly deleteForAll: boolean;
  readonly hide: boolean;
  readonly report: boolean;
  readonly manageMembers: boolean;
  readonly adminOpen: boolean;
  readonly call: boolean;
  readonly videoCall: boolean;
  readonly e2eeBadge: boolean;
};

const AUTHORITY_TYPES: ReadonlySet<string> = new Set(['group', 'public', 'broadcast']);
const MANAGED_TYPES: ReadonlySet<string> = new Set([...AUTHORITY_TYPES, GLOBAL_CONVERSATION_TYPE]);

/** `effectiveConversationRole` rendu en niveau : ADMIN/BIGBOSS membre ⇒ créateur, sinon le rang de la ligne. */
function effectiveRank(viewer: ActionViewer): number {
  if (viewer.isActiveMember && platformAdministers(viewer)) return MEMBER_ROLE_HIERARCHY.creator;
  return memberRankOf(viewer);
}

export function conversationActionsFor({ conversation, viewer }: ConversationActionInput): ConversationActions {
  const rank = effectiveRank(viewer);
  const open = !conversationIsClosed(conversation);
  const authority = AUTHORITY_TYPES.has(conversation.type);
  const global = conversation.type === GLOBAL_CONVERSATION_TYPE;
  const moderates = rank >= MEMBER_ROLE_HIERARCHY.moderator;
  const callable =
    open &&
    viewer.isActiveMember &&
    canStartCall({
      conversationType: conversation.type,
      viewerIsCreator: (viewer.conversationRole ?? '').toLowerCase() === 'creator',
      viewerConversationRole: viewer.conversationRole,
      viewerPlatformRole: viewer.platformRole,
      viewerIsGuest: !viewer.hasAccount || viewer.isAnonymous,
    });
  return {
    rename: open && authority && moderates,
    invite: open && (global ? viewer.isActiveMember && platformAdministers(viewer) : authority && moderates),
    leave: open && authority && viewer.isActiveMember,
    deleteForAll: authority && rank >= MEMBER_ROLE_HIERARCHY.admin,
    hide: viewer.hasAccount,
    report: viewer.hasAccount,
    manageMembers: open && MANAGED_TYPES.has(conversation.type) && moderates,
    adminOpen: platformAdministers(viewer),
    call: callable,
    videoCall: callable,
    e2eeBadge: conversation.encryptionMode === 'e2ee',
  };
}
