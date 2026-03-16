/**
 * Calcul du statut de presence — combine isOnline (socket event) + lastActiveAt (temps).
 *
 * Priorite:
 * 1. Si isOnline === false (deconnexion explicite via socket) → offline immediat
 * 2. Si isOnline === true ET lastActiveAt < 5min → online
 * 3. Sinon, calcul temporel classique sur lastActiveAt
 */

import type { SocketIOUser as User } from '@meeshy/shared/types';
import type { Participant } from '@meeshy/shared/types/participant';

export type UserStatus = 'online' | 'away' | 'offline';

type PresenceSource = {
  isOnline?: boolean;
  lastActiveAt?: Date | string | number | null;
};

function getMinutesAgo(lastActiveAt: Date | string | number): number {
  return (Date.now() - new Date(lastActiveAt).getTime()) / (1000 * 60);
}

/**
 * < 5 min   → VERT  (online)
 * 5-30 min  → ORANGE (away)
 * > 30 min  → GRIS  (offline)
 *
 * isOnline = false → GRIS immediat (deconnexion socket)
 * isOnline = true + lastActiveAt recent → VERT
 */
export function getUserStatus(user: User | Participant | PresenceSource | null | undefined): UserStatus {
  if (!user) return 'offline';

  const { isOnline, lastActiveAt } = user as PresenceSource;

  if (isOnline === false) {
    if (!lastActiveAt) return 'offline';
    const minutesAgo = getMinutesAgo(lastActiveAt);
    if (minutesAgo < 30) return 'away';
    return 'offline';
  }

  if (isOnline === true) {
    if (!lastActiveAt) return 'online';
    const minutesAgo = getMinutesAgo(lastActiveAt);
    if (minutesAgo < 5) return 'online';
    if (minutesAgo < 30) return 'away';
    return 'away';
  }

  if (!lastActiveAt) return 'offline';
  const minutesAgo = getMinutesAgo(lastActiveAt);
  if (minutesAgo < 5) return 'online';
  if (minutesAgo < 30) return 'away';
  return 'offline';
}
