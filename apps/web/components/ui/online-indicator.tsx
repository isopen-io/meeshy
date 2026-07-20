'use client';

import { cn } from '@/lib/utils';
import { classifyRelativeTime } from '@meeshy/shared/utils/relative-time';
import { getUserStatus, PRESENCE_DOT_CLASS, type UserStatus } from '@/lib/user-status';

interface OnlineIndicatorProps {
  isOnline: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  // Support pour statut détaillé (online/recent/away/offline)
  status?: UserStatus;
  // Tooltip personnalisé
  tooltip?: string;
  // Timestamp de dernière activité pour tooltip détaillé
  lastActiveAt?: Date;
}

export function OnlineIndicator({
  isOnline,
  size = 'md',
  className,
  status,
  tooltip,
  lastActiveAt
}: OnlineIndicatorProps) {
  const sizeClasses = {
    sm: 'h-2 w-2',
    md: 'h-3 w-3',
    lg: 'h-4 w-4',
  };

  // Messages par défaut
  const defaultTooltips: Record<UserStatus, string> = {
    online: 'En ligne',
    recent: 'Actif récemment',
    away: 'Absent',
    offline: 'Hors ligne',
  };

  // Déterminer le statut effectif — sans prop status, dériver via la règle canonique
  const effectiveStatus = status ?? getUserStatus({ isOnline, lastActiveAt });

  // Au-dela de 30min (offline) : aucun indicateur (dot masqué). Le gris reste
  // défini dans PRESENCE_DOT_CLASS pour les usages labellisés, pas ici.
  if (effectiveStatus === 'offline') return null;

  // Générer le tooltip
  let finalTooltip = tooltip || defaultTooltips[effectiveStatus];

  // Ajouter l'info de dernière activité si disponible
  if (lastActiveAt && effectiveStatus !== 'online') {
    const bucket = classifyRelativeTime(new Date(lastActiveAt).getTime(), Date.now(), { beyondDays: Infinity });
    switch (bucket.unit) {
      case 'now':
        finalTooltip += ' - À l\'instant';
        break;
      case 'minutes':
        finalTooltip += ` - Il y a ${bucket.value} min`;
        break;
      case 'hours':
        finalTooltip += ` - Il y a ${bucket.value}h`;
        break;
      case 'days':
        finalTooltip += ` - Il y a ${bucket.value} jour${bucket.value > 1 ? 's' : ''}`;
        break;
    }
  }

  return (
    <div
      className={cn(
        'rounded-full border-2 border-white transition-colors duration-500',
        sizeClasses[size],
        PRESENCE_DOT_CLASS[effectiveStatus],
        className
      )}
      title={finalTooltip}
    />
  );
}
