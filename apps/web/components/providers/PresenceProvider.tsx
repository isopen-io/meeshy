'use client';

import { memo } from 'react';
import { useUserStatusRealtime } from '@/hooks/use-user-status-realtime';

/**
 * PresenceProvider
 *
 * Monte une seule fois `useUserStatusRealtime` au niveau racine afin que
 * toutes les pages authentifiees recoivent les evenements de presence
 * (USER_STATUS + PRESENCE_SNAPSHOT) sans dependre d'un ecran specifique.
 *
 * Pas de rendu UI : c'est un wrapper transparent.
 */
export const PresenceProvider = memo(function PresenceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useUserStatusRealtime();
  return <>{children}</>;
});
