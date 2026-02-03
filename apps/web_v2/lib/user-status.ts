/**
 * Utilitaire pour calculer le statut d'un utilisateur basé sur sa dernière activité
 */

import type { SocketIOUser as User } from '@meeshy/shared/types';
import type { AnonymousParticipant } from '@meeshy/shared/types/anonymous';

export type UserStatus = 'online' | 'away' | 'offline';

/**
 * Calcule le statut d'un utilisateur basé sur isOnline et lastActiveAt
 * - online (vert): actif dans les dernières 5 minutes
 * - away (orange): inactif depuis 5-30 minutes
 * - offline (gris): hors ligne depuis plus de 30 minutes
 */
export function getUserStatus(user: User | AnonymousParticipant | null | undefined): UserStatus {
  if (!user) return 'offline';

  // Si l'utilisateur a une propriété isOnline explicite et elle est false, retourner offline
  if ('isOnline' in user && user.isOnline === false) return 'offline';

  // Sinon, calculer basé sur lastActiveAt
  const lastActiveAt = user.lastActiveAt ? new Date(user.lastActiveAt) : null;
  if (!lastActiveAt) {
    // Si pas de lastActiveAt mais isOnline est true, considérer comme online
    return ('isOnline' in user && user.isOnline) ? 'online' : 'offline';
  }

  const now = Date.now();
  const lastActive = lastActiveAt.getTime();
  const minutesAgo = (now - lastActive) / (1000 * 60);

  // Vert : actif dans les dernières 5 minutes
  if (minutesAgo < 5) return 'online';

  // Orange : absent depuis 5-30 minutes
  if (minutesAgo < 30) return 'away';

  // Gris : hors ligne depuis plus de 30 minutes
  return 'offline';
}
