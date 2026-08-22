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

/**
 * Applique le résultat de visibilité sur un objet profil, sans mutation.
 * `showOnline:false` ⇒ `isOnline=null` (non montrable, pas de pastille).
 */
export const applyPresenceVisibility = <
  T extends { isOnline: boolean | null; lastActiveAt: Date | null },
>(
  profile: T,
  visibility: PresenceVisibility,
): Omit<T, 'isOnline' | 'lastActiveAt'> & { isOnline: boolean | null; lastActiveAt: Date | null } => ({
  ...profile,
  isOnline: visibility.showOnline ? profile.isOnline : null,
  lastActiveAt: visibility.showLastSeenTimestamp ? profile.lastActiveAt : null,
});

/**
 * Même application, pour les surfaces dont le schéma de sérialisation déclare
 * `isOnline` NON nullable (`userMinimalSchema`, `contacts-schemas`) et dont les
 * clients le typent `boolean` : masqué s'y présente comme HORS LIGNE.
 *
 * Deux différences avec {@link applyPresenceVisibility}, et les deux comptent :
 * `false` au lieu de `null`, et une visibilité **absente** vaut masquée — un id
 * qu'une carte `resolveForTargets` n'a pas rendu n'est pas un id autorisé.
 *
 * `lastActiveAt` est OPTIONNEL : certaines portes ne chargent que `isOnline`
 * (aperçu de membres d'une communauté). Le gate ne fabrique alors pas la clé —
 * une réponse ne gagne pas un champ parce qu'on l'a filtrée.
 */
export const applyPresenceVisibilityAsOffline = <
  T extends { isOnline: boolean | null; lastActiveAt?: Date | null },
>(
  profile: T,
  visibility: PresenceVisibility | undefined,
): Omit<T, 'isOnline'> & { isOnline: boolean } => ({
  ...profile,
  isOnline: visibility?.showOnline ? profile.isOnline === true : false,
  ...('lastActiveAt' in profile
    ? { lastActiveAt: visibility?.showLastSeenTimestamp ? profile.lastActiveAt ?? null : null }
    : {}),
});
