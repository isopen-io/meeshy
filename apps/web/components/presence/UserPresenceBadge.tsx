'use client';

import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { useLiveUserStatus } from '@/hooks/use-live-user-status';
import type { PresenceSource, UserStatus } from '@/lib/user-status';

const badgeColors: Record<UserStatus, string> = {
  online: 'bg-green-500 hover:bg-green-600',
  away: 'bg-orange-400 hover:bg-orange-500',
  offline: 'bg-gray-400 hover:bg-gray-500',
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

  const labels: Record<UserStatus, string> = {
    online: t('status.online'),
    away: t('status.away', { defaultValue: 'Absent' }),
    offline: t('status.offline'),
  };

  return (
    <Badge
      variant={status === 'offline' ? 'secondary' : 'default'}
      className={`${badgeColors[status]} ${className ?? ''}`}
    >
      {labels[status]}
    </Badge>
  );
});
