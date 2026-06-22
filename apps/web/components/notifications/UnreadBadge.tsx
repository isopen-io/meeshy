'use client';

import { cn } from '@/lib/utils';
import { NOTIFICATION_ACCENT } from '@/utils/notification-helpers';

type UnreadBadgeProps = {
  count: number;
  className?: string;
};

/**
 * Badge compteur de notifications non-lues — source UNIQUE partagée par
 * `NotificationBell` et le trigger du `NotificationDropdown`.
 * Accent bleu sobre + ring d'offset pour se détacher de la cloche.
 */
export function UnreadBadge({ count, className }: UnreadBadgeProps) {
  if (count <= 0) return null;

  return (
    <span
      className={cn(
        'absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none ring-2 ring-background',
        NOTIFICATION_ACCENT.badge,
        className
      )}
      aria-hidden="true"
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}
