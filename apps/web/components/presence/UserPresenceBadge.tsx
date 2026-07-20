'use client';

import { memo } from 'react';
import { Badge } from '@/components/ui/badge';
import { useLiveUserStatus } from '@/hooks/use-live-user-status';
import { PRESENCE_BADGE_CLASS, type PresenceSource, type UserStatus } from '@/lib/user-status';

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

  // Au-dela de 30min (offline) : plus aucun badge de presence.
  if (status === 'offline') return null;

  const labels: Record<Exclude<UserStatus, 'offline'>, string> = {
    online: t('status.online'),
    recent: t('status.recent', { defaultValue: 'Actif récemment' }),
    away: t('status.away', { defaultValue: 'Absent' }),
  };

  return (
    <Badge
      variant="default"
      className={`${PRESENCE_BADGE_CLASS[status]} ${className ?? ''}`}
    >
      {labels[status]}
    </Badge>
  );
});
