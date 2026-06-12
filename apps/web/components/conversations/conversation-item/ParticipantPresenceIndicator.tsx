'use client';

import { memo } from 'react';
import { OnlineIndicator } from '@/components/ui/online-indicator';
import { useLiveUserStatus } from '@/hooks/use-live-user-status';
import type { PresenceSource } from '@/lib/user-status';

export type { PresenceSource } from '@/lib/user-status';

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
 * Seul ce composant s'abonne au user store (via useLiveUserStatus) : la row
 * ConversationItem n'est plus re-rendue par les events de présence ni par le
 * tick périodique — seul le dot recalcule online → away → offline.
 */
export const ParticipantPresenceIndicator = memo(function ParticipantPresenceIndicator({
  userId,
  fallbackUser,
  size = 'md',
  className
}: ParticipantPresenceIndicatorProps) {
  const status = useLiveUserStatus(userId, fallbackUser);

  return (
    <OnlineIndicator
      isOnline={status === 'online'}
      status={status}
      size={size}
      className={className}
    />
  );
});
