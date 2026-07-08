/**
 * Présence utilisateur côté web — délègue le calcul d'état à la SOURCE DE
 * VÉRITÉ partagée `@meeshy/shared/utils/user-presence` et centralise ICI le
 * mapping état -> classes Tailwind (un seul endroit pour toute l'app).
 *
 * Règle produit (identique iOS / Android) :
 *   online  (isOnline backend OU activité <= 60s) -> VERT emerald-400 + pulse
 *   recent  (activité <= 5min)                    -> VERT emerald-400
 *   away    (5-30min)                             -> ORANGE amber-400
 *   offline (> 30min)                             -> GRIS gray-400
 *
 * Les hex correspondent exactement aux tokens iOS/Android :
 * emerald-400 = #34D399 (MeeshyColors.success), amber-400 = #FBBF24
 * (MeeshyColors.warning), gray-400 = #9CA3AF (neutral400).
 */

import type { SocketIOUser as User } from '@meeshy/shared/types';
import type { Participant } from '@meeshy/shared/types/participant';
import {
  getUserPresenceStatus,
  presenceTone,
  isPresenceActive,
  isPresencePulsing,
  PRESENCE_ONLINE_WINDOW_MS,
  PRESENCE_RECENT_WINDOW_MS,
  PRESENCE_AWAY_WINDOW_MS,
  type UserPresenceStatus,
  type UserPresenceSource,
  type PresenceTone,
} from '@meeshy/shared/utils/user-presence';

export type UserStatus = UserPresenceStatus;
export type PresenceSource = UserPresenceSource;
export {
  presenceTone,
  isPresenceActive,
  isPresencePulsing,
  PRESENCE_ONLINE_WINDOW_MS,
  PRESENCE_RECENT_WINDOW_MS,
  PRESENCE_AWAY_WINDOW_MS,
};
export type { PresenceTone };

export function getUserStatus(user: User | Participant | PresenceSource | null | undefined): UserStatus {
  return getUserPresenceStatus(user as PresenceSource | null | undefined);
}

/**
 * Mapping central statut -> classe de fond du dot. Seul 'online' pulse.
 * TOUT composant présence (dot, badge, sidebar) DOIT consommer ces maps —
 * ne jamais redéclarer bg-emerald/amber/gray localement.
 */
export const PRESENCE_DOT_CLASS: Record<UserStatus, string> = {
  online: 'bg-emerald-400 animate-pulse',
  recent: 'bg-emerald-400',
  away: 'bg-amber-400',
  offline: 'bg-gray-400',
};

/** Variante badge (avec état hover) pour les Badge shadcn. */
export const PRESENCE_BADGE_CLASS: Record<UserStatus, string> = {
  online: 'bg-emerald-400 hover:bg-emerald-500',
  recent: 'bg-emerald-400 hover:bg-emerald-500',
  away: 'bg-amber-400 hover:bg-amber-500',
  offline: 'bg-gray-400 hover:bg-gray-500',
};

/** Couleur de texte des libellés de présence (« En ligne », « Vu il y a… »). */
export const PRESENCE_TEXT_CLASS: Record<PresenceTone, string> = {
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  muted: 'text-gray-500 dark:text-gray-400',
};

export function presenceTextClass(status: UserStatus): string {
  return PRESENCE_TEXT_CLASS[presenceTone(status)];
}
