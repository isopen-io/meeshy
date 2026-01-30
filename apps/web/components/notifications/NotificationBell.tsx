'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell } from 'lucide-react';
import { useNotificationsManagerRQ } from '@/hooks/queries/use-notifications-manager-rq';

if (typeof window !== 'undefined') {
  (window as any).__NOTIFICATION_BELL_LOADED__ = true;
}

interface NotificationBellProps {
  className?: string;
  showBadge?: boolean;
  onClick?: () => void;
}

export function NotificationBell({
  className = '',
  showBadge = true,
  onClick
}: NotificationBellProps) {
  const { unreadCount } = useNotificationsManagerRQ();

  const ariaLabel = `Notifications${unreadCount > 0 ? ` (${unreadCount} non lues)` : ''}`;

  const bellContent = (
    <>
      <Bell className="h-4 w-4" aria-hidden="true" />
      {showBadge && unreadCount > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-1 -right-1 h-5 w-5 p-0 text-xs flex items-center justify-center"
          aria-hidden="true"
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </Badge>
      )}
    </>
  );

  // Si onClick personnalisé, utiliser Button avec onClick
  if (onClick) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className={`relative focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${className}`}
        onClick={onClick}
        aria-label={ariaLabel}
      >
        {bellContent}
      </Button>
    );
  }

  // Par défaut, utiliser Link pour navigation instantanée
  return (
    <Button
      variant="ghost"
      size="sm"
      asChild
      className={`relative focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${className}`}
    >
      <Link href="/notifications" aria-label={ariaLabel}>
        {bellContent}
      </Link>
    </Button>
  );
}

