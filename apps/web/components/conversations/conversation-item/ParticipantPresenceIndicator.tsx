'use client';

import { memo } from 'react';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import { getUserStatus } from '@/lib/user-status';
import { useUserById, useUserStatusTick } from '@/stores/user-store';

type PresenceSource = {
  isOnline?: boolean;
  lastActiveAt?: Date | string | number | null;
};

interface ParticipantPresenceIndicatorProps {
  userId?: string;
  /** Données de présence portées par la conversation, utilisées tant que le store ne connaît pas le user */
  fallbackUser?: PresenceSource | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Feuille de présence abonnée par userId (iter 35 F9).
 *
 * Seul ce composant s'abonne au user store (entrée du user + tick de décroissance) :
 * la row ConversationItem n'est plus re-rendue par les events de présence ni par le
 * tick périodique — seul le dot recalcule online → away → offline.
 */
export const ParticipantPresenceIndicator = memo(function ParticipantPresenceIndicator({
  userId,
  fallbackUser,
  size = 'md',
  className
}: ParticipantPresenceIndicatorProps) {
  const userFromStore = useUserById(userId);
  // Force le recalcul du statut relatif (décroissance temporelle) à chaque tick du store
  useUserStatusTick();

  const status = getUserStatus(userFromStore ?? fallbackUser);

  return (
    <OnlineIndicator
      isOnline={status === 'online'}
      status={status}
      size={size}
      className={className}
    />
  );
});
