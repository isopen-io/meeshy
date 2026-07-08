/**
 * Calcul du statut de presence — decroissance temporelle sur lastActiveAt.
 *
 * Regle produit (source unique, identique web / iOS / Android) :
 *   delta = now - lastActiveAt
 *   delta <= 60s   -> 'online'  (orange, pulse)  — actif a l'instant
 *   delta <= 5min  -> 'recent'  (orange)         — actif recemment
 *   delta <= 30min -> 'away'    (gris)           — absent
 *   delta > 30min  -> 'offline' (aucun indicateur)
 *
 * Le gateway gele lastActiveAt a la deconnexion (jamais touche au disconnect),
 * donc la decroissance orange -> gris -> rien demarre au dernier instant
 * d'activite reelle. isOnline ne sert que de fallback quand lastActiveAt manque.
 */

import type { SocketIOUser as User } from '@meeshy/shared/types';
import type { Participant } from '@meeshy/shared/types/participant';

export type UserStatus = 'online' | 'recent' | 'away' | 'offline';

export type PresenceSource = {
  isOnline?: boolean;
  lastActiveAt?: Date | string | number | null;
};

export const PRESENCE_ONLINE_WINDOW_MS = 60 * 1000; // 1 min
export const PRESENCE_RECENT_WINDOW_MS = 5 * 60 * 1000; // 5 min
export const PRESENCE_AWAY_WINDOW_MS = 30 * 60 * 1000; // 30 min

function getElapsedMs(lastActiveAt: Date | string | number): number {
  return Date.now() - new Date(lastActiveAt).getTime();
}

export function getUserStatus(user: User | Participant | PresenceSource | null | undefined): UserStatus {
  if (!user) return 'offline';

  const { isOnline, lastActiveAt } = user as PresenceSource;

  if (lastActiveAt === null || lastActiveAt === undefined) {
    return isOnline === true ? 'online' : 'offline';
  }

  const elapsed = getElapsedMs(lastActiveAt);
  if (elapsed <= PRESENCE_ONLINE_WINDOW_MS) return 'online';
  if (elapsed <= PRESENCE_RECENT_WINDOW_MS) return 'recent';
  if (elapsed <= PRESENCE_AWAY_WINDOW_MS) return 'away';
  return 'offline';
}

/** Un indicateur (dot/badge) est rendu pour tout sauf 'offline'. */
export function isPresenceVisible(status: UserStatus): boolean {
  return status !== 'offline';
}

/** Etats "actifs" affiches en orange : online + recent. away = gris. */
export function isPresenceActive(status: UserStatus): boolean {
  return status === 'online' || status === 'recent';
}

/** Seul 'online' (<= 60s) pulse ("en ligne maintenant"). */
export function isPresencePulsing(status: UserStatus): boolean {
  return status === 'online';
}
