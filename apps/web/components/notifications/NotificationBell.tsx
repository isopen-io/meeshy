'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell } from 'lucide-react';
import { useNotifications } from '@/hooks/use-notifications';
import { useRouter } from 'next/navigation';

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
  const router = useRouter();
  const { unreadCount, isConnected } = useNotifications();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      router.push('/notifications');
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className={`relative focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${className}`}
      onClick={handleClick}
      aria-label={isConnected
        ? `Notifications${unreadCount > 0 ? ` (${unreadCount} non lues)` : ''}`
        : 'Notifications (hors ligne)'
      }
    >
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
    </Button>
  );
}

