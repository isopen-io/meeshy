/**
 * Export centralisé pour les composants de notifications v2
 */

export { NotificationBell, NotificationBellSimple } from './NotificationBell';
export { NotificationList, NotificationListWithFilters } from './NotificationList';
export { NotificationItem } from './NotificationItem';

// Re-export des types
export type {
  NotificationV2,
  NotificationType,
  NotificationPriority,
  NotificationBellProps,
  NotificationListProps,
  NotificationItemProps
} from '@/types/notification-v2';
