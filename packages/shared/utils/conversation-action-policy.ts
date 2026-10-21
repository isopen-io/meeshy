/**
 * CE QU'UN LECTEUR PEUT FAIRE D'UNE CONVERSATION (#11205) — jumelle PURE de
 * `messageActionsFor`. Rang effectif de `conversation-authority` : ADMIN ou
 * BIGBOSS de plateforme MEMBRE ⇒ créateur, jamais au-dessus ; MODERATOR, AUDIT,
 * ANALYST y sont des membres ; rang illisible < membre. Fermé en plus : un
 * `direct` n'a pas d'autorité (ses rangs sont un ordre d'arrivée) ; Global ne se
 * renomme, ne se quitte ni ne se supprime pour tous, et seuls ADMIN/BIGBOSS y
 * invitent ; une conversation terminée ne se modifie plus ; un type inconnu
 * n'ouvre rien qui en dépende. L'appel suit `canStartCall` ; un lecteur
 * `isAnonymous` est un invité ; le badge suit `conversationIsEndToEnd`, la loi
 * qui retire les services aux messages.
 *
 * Trois lectures suivent la passerelle à la lettre (#11215) : le rang de la
 * ligne se lit casse PLIÉE, comme `effectiveConversationRole` (des lignes
 * `CREATOR` héritées existent) ; Inviter suit `mayMintShareLink`, où tout
 * membre inscrit d'une conversation `public` fabrique un lien ; Quitter exige
 * un compte, comme `POST /conversations/:id/leave` (`allowAnonymous: false`).
 */

import { MEMBER_ROLE_HIERARCHY } from '../types/role-types.js';
import { canStartCall } from './call-permission.js';
import { GLOBAL_CONVERSATION_TYPE } from './global-minor-restriction.js';
import {
  conversationIsClosed,
  conversationIsEndToEnd,
  platformAdministers,
  viewerIsRegistered,
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

const MEMBER_RANKS: ReadonlyMap<string, number> = new Map(Object.entries(MEMBER_ROLE_HIERARCHY));

/** `effectiveConversationRole` rendu en niveau : ADMIN/BIGBOSS membre ⇒ créateur, sinon le rang de la ligne casse pliée ; illisible ⇒ 0. */
function effectiveRank(viewer: ActionViewer): number {
  if (!viewer.isActiveMember) return 0;
  if (platformAdministers(viewer)) return MEMBER_ROLE_HIERARCHY.creator;
  return MEMBER_RANKS.get((viewer.conversationRole ?? '').toLowerCase()) ?? 0;
}

/** `mayMintShareLink` : public ⇒ tout membre inscrit ; Global ⇒ ADMIN/BIGBOSS ; le reste ⇒ MODERATOR+. */
function invites(conversation: ActionConversation, viewer: ActionViewer, moderates: boolean): boolean {
  if (conversation.type === GLOBAL_CONVERSATION_TYPE) return viewer.isActiveMember && platformAdministers(viewer);
  if (conversation.type === 'public') return viewer.isActiveMember && viewerIsRegistered(viewer);
  return AUTHORITY_TYPES.has(conversation.type) && moderates;
}

export function conversationActionsFor({ conversation, viewer }: ConversationActionInput): ConversationActions {
  const rank = effectiveRank(viewer);
  const open = !conversationIsClosed(conversation);
  const authority = AUTHORITY_TYPES.has(conversation.type);
  const moderates = rank >= MEMBER_ROLE_HIERARCHY.moderator;
  const registered = viewerIsRegistered(viewer);
  const callable =
    open &&
    viewer.isActiveMember &&
    canStartCall({
      conversationType: conversation.type,
      viewerIsCreator: (viewer.conversationRole ?? '').toLowerCase() === 'creator',
      viewerConversationRole: viewer.conversationRole,
      viewerPlatformRole: viewer.platformRole,
      viewerIsGuest: !registered,
    });
  return {
    rename: open && authority && moderates,
    invite: open && invites(conversation, viewer, moderates),
    leave: open && authority && viewer.isActiveMember && registered,
    deleteForAll: open && authority && rank >= MEMBER_ROLE_HIERARCHY.admin,
    hide: registered,
    report: registered,
    manageMembers: open && MANAGED_TYPES.has(conversation.type) && moderates,
    adminOpen: platformAdministers(viewer),
    call: callable,
    videoCall: callable,
    e2eeBadge: conversationIsEndToEnd(conversation),
  };
}
