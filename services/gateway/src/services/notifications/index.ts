/**
 * Export du module de notifications
 * Point d'entrée unique pour tous les services de notifications
 */

export { NotificationService } from './NotificationService';
export { SocketNotificationService } from './SocketNotificationService';
export { NotificationFormatter } from './NotificationFormatter';

export type {
  CreateNotificationData,
  NotificationEventData,
  AttachmentInfo,
  SenderInfo,
  NotificationMetrics,
  NotificationStats
} from './types';
