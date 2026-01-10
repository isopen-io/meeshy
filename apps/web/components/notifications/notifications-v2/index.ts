/**
 * Export centralisé pour les composants de notifications
 */

export { NotificationBell, NotificationBellSimple } from './NotificationBell';
export { NotificationList, NotificationListWithFilters } from './NotificationList';
export { NotificationItem } from './NotificationItem';

// Re-export des types
export type {
  Notification,
  NotificationType,
  NotificationPriority,
  NotificationBellProps,
  NotificationListProps,
  NotificationItemProps
} from '@/types/notification';
