/**
 * Calcul du statut de présence — basé UNIQUEMENT sur lastActiveAt.
 *
 * lastActiveAt est mis à jour par les opérations utilisateur réelles :
 * envoi de message, typing, chargement de page, appels API, configuration, etc.
 *
 * Aucun heartbeat, aucun isOnline — juste le temps écoulé depuis la dernière action.
 */

import type { SocketIOUser as User } from '@meeshy/shared/types';
import type { AnonymousParticipant } from '@meeshy/shared/types/anonymous';

export type UserStatus = 'online' | 'away' | 'offline';

/**
 * < 5 min   → VERT  (online)
 * 5-30 min  → ORANGE (away)
 * > 30 min  → GRIS  (offline)
 */
export function getUserStatus(user: User | AnonymousParticipant | null | undefined): UserStatus {
  if (!user) return 'offline';

  const lastActiveAt = user.lastActiveAt ? new Date(user.lastActiveAt) : null;
  if (!lastActiveAt) return 'offline';

  const minutesAgo = (Date.now() - lastActiveAt.getTime()) / (1000 * 60);

  if (minutesAgo < 5) return 'online';
  if (minutesAgo < 30) return 'away';
  return 'offline';
}
