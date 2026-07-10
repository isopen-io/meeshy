'use client';

import { cn } from '@/lib/utils';

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

  // Déterminer le statut effectif
  const effectiveStatus = status || (isOnline ? 'online' : 'offline');

  // Générer le tooltip
  let finalTooltip = tooltip || defaultTooltips[effectiveStatus];

  // Ajouter l'info de dernière activité si disponible
  if (lastActiveAt && effectiveStatus !== 'online') {
    const now = new Date();
    const diffMs = now.getTime() - new Date(lastActiveAt).getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 1) {
      finalTooltip += ' - À l\'instant';
    } else if (diffMinutes < 60) {
      finalTooltip += ` - Il y a ${diffMinutes} min`;
    } else {
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) {
        finalTooltip += ` - Il y a ${diffHours}h`;
      } else {
        const diffDays = Math.floor(diffHours / 24);
        finalTooltip += ` - Il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`;
      }
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
