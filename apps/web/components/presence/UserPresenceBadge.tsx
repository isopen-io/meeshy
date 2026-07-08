'use client';

import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { useLiveUserStatus } from '@/hooks/use-live-user-status';
import type { PresenceSource, UserStatus } from '@/lib/user-status';

const badgeColors: Record<Exclude<UserStatus, 'offline'>, string> = {
  online: 'bg-orange-400 hover:bg-orange-500', // actif <= 60s
  recent: 'bg-orange-400 hover:bg-orange-500', // actif <= 5min
  away: 'bg-gray-400 hover:bg-gray-500', // absent 5-30min
};

interface UserPresenceBadgeProps {
  userId?: string;
  /** Données de présence du payload, utilisées tant que le store ne connaît pas le user */
  fallbackUser?: PresenceSource | null;
  t: (key: string, params?: unknown) => string;
  className?: string;
}

/**
 * Badge de statut vivant (iter 37 F12) — seule cette feuille s'abonne au user
 * store : la row contact ne re-rend pas sur les events de présence ni les ticks.
 */
export const UserPresenceBadge = memo(function UserPresenceBadge({
  userId,
  fallbackUser,
  t,
  className
}: UserPresenceBadgeProps) {
  const status = useLiveUserStatus(userId, fallbackUser);

  // Au-dela de 30min (offline) : plus aucune info de presence.
  if (status === 'offline') return null;

  const labels: Record<Exclude<UserStatus, 'offline'>, string> = {
    online: t('status.online'),
    recent: t('status.recent', { defaultValue: 'Actif récemment' }),
    away: t('status.away', { defaultValue: 'Absent' }),
  };

  return (
    <Badge
      variant="default"
      className={`${badgeColors[status]} ${className ?? ''}`}
    >
      {labels[status]}
    </Badge>
  );
});
