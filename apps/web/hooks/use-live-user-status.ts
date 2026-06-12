'use client';

import { getUserStatus, type PresenceSource, type UserStatus } from '@/lib/user-status';
import { useUserById, useUserStatusTick } from '@/stores/user-store';

/**
 * Résolution de présence vivante (iter 37) — single source of truth des feuilles
 * de présence (dot, badge, label) : entrée du user store prioritaire, fallback sur
 * les données de présence du payload, recalcul de la décroissance temporelle
 * online → away → offline à chaque tick du store.
 *
 * Abonnements granulaires : seul le composant appelant re-rend sur les events
 * de présence et les ticks — jamais la row/le conteneur parent.
 */
export function useLiveUserStatus(
  userId?: string,
  fallbackUser?: PresenceSource | null
): UserStatus {
  const userFromStore = useUserById(userId);
  useUserStatusTick();

  return getUserStatus(userFromStore ?? fallbackUser);
}
