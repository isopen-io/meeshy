import { User } from '@/types';

export function getUserDisplayName(user: User | { firstName: string; lastName: string; username: string; displayName?: string }): string {
  if ('displayName' in user && user.displayName) return user.displayName;
  return `${user.firstName} ${user.lastName}`.trim() || user.username;
}

export function formatLastSeen(user: User, t: (key: string, params?: any) => string): string {
  if (user.isOnline) return t('status.online');

  if (!user.lastActiveAt) {
    return t('status.neverSeen');
  }

  const date = new Date(user.lastActiveAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('status.justNow');
  if (diffMins < 60) return t('status.minutesAgo', { count: diffMins });
  if (diffHours < 24) return t('status.hoursAgo', { count: diffHours });
  if (diffDays < 7) return t('status.daysAgo', { count: diffDays });

  return t('status.lastSeenDate', { date: date.toLocaleDateString() });
}
