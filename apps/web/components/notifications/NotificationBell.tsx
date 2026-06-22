'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Bell } from 'lucide-react';
import { useI18n } from '@/hooks/use-i18n';
import { useNotificationsManagerRQ } from '@/hooks/queries/use-notifications-manager-rq';
import { UnreadBadge } from './UnreadBadge';

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
  const { t } = useI18n('notifications');
  const { unreadCount } = useNotificationsManagerRQ();

  const ariaLabel = unreadCount > 0
    ? t('bell.labelWithUnread', { count: unreadCount })
    : t('bell.label');

  const bellContent = (
    <>
      <Bell className="h-4 w-4" aria-hidden="true" />
      {showBadge && <UnreadBadge count={unreadCount} />}
    </>
  );

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
