import { isGlobalModerator } from '../types/role-types.js';
import type { GlobalUserRoleType } from '../types/role-types.js';

export type PresenceVisibilityInput = {
  readonly isSelf: boolean;
  readonly viewerRole: GlobalUserRoleType;
  readonly areConnected: boolean;
  readonly sharesConversation?: boolean;
  readonly targetShowOnlineStatus: boolean;
  readonly targetShowLastSeen: boolean;
  readonly targetIsDeactivated: boolean;
  readonly isBlockedEitherWay: boolean;
};

export type PresenceVisibility = {
  readonly showOnline: boolean;
  readonly showLastSeenTimestamp: boolean;
};

const HIDDEN: PresenceVisibility = { showOnline: false, showLastSeenTimestamp: false };

/**
 * Politique pure de visibilité de la présence (lastActiveAt/isOnline).
 * Décide deux drapeaux ; l'appelant injecte la vraie valeur.
 *
 * @see docs/superpowers/specs/2026-06-30-profile-last-seen-visibility-design.md
 */
export const resolvePresenceVisibility = (input: PresenceVisibilityInput): PresenceVisibility => {
  if (input.targetIsDeactivated || input.isBlockedEitherWay) return HIDDEN;

  const privileged = input.isSelf || isGlobalModerator(input.viewerRole);
  const allowed = privileged || input.areConnected || (input.sharesConversation ?? false);
  if (!allowed) return HIDDEN;

  if (privileged) return { showOnline: true, showLastSeenTimestamp: true };
  if (!input.targetShowOnlineStatus) return HIDDEN;
  return { showOnline: true, showLastSeenTimestamp: input.targetShowLastSeen };
};
