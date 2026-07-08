'use client';

import { cn } from '@/lib/utils';
import { classifyRelativeTime } from '@meeshy/shared/utils/relative-time';
import { getUserStatus } from '@/lib/user-status';

interface OnlineIndicatorProps {
  isOnline: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  // Support pour statut détaillé (online/away/offline)
  status?: 'online' | 'away' | 'offline';
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

  // Couleurs selon le statut
  const statusColors = {
    online: 'bg-green-500',    // Vert : en ligne (< 5 min)
    away: 'bg-orange-400',     // Orange : inactif (5-30 min)
    offline: 'bg-gray-400',    // Gris : hors ligne (> 30 min)
  };

  // Messages par défaut
  const defaultTooltips = {
    online: 'En ligne',
    away: 'Inactif',
    offline: 'Hors ligne',
  };

  // Déterminer le statut effectif — sans prop status, dériver via la règle canonique
  const effectiveStatus = status ?? getUserStatus({ isOnline, lastActiveAt });

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
        statusColors[effectiveStatus],
        className
      )}
      title={finalTooltip}
    />
  );
}
