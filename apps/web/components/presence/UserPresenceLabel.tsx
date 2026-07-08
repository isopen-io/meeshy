'use client';

import { memo, type ReactNode } from 'react';
import { useLiveUserStatus } from '@/hooks/use-live-user-status';
import { PRESENCE_DOT_CLASS, type PresenceSource, type UserStatus } from '@/lib/user-status';

interface UserPresenceLabelProps {
  userId?: string;
  /** Données de présence du payload, utilisées tant que le store ne connaît pas le user */
  fallbackUser?: PresenceSource | null;
  t: (key: string, params?: unknown) => string;
  /** Texte custom à la place du libellé de statut (ex : « vu pour la dernière fois ») */
  children?: ReactNode;
  className?: string;
}

/**
 * Ligne dot + libellé de statut vivante (iter 37 F12) — seule cette feuille
 * s'abonne au user store : la row contact ne re-rend pas sur les events de
 * présence ni les ticks.
 */
export const UserPresenceLabel = memo(function UserPresenceLabel({
  userId,
  fallbackUser,
  t,
  children,
  className
}: UserPresenceLabelProps) {
  const status = useLiveUserStatus(userId, fallbackUser);

  const labels: Record<UserStatus, string> = {
    online: t('status.online'),
    recent: t('status.recent', { defaultValue: 'Actif récemment' }),
    away: t('status.away', { defaultValue: 'Absent' }),
    offline: t('status.offline'),
  };

  return (
    <div className={`flex items-center space-x-2 ${className ?? ''}`}>
      <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${PRESENCE_DOT_CLASS[status]}`} />

      <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 font-medium">
        {children ?? labels[status]}
      </span>
    </div>
  );
});
