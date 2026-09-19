/**
 * Export du module de notifications
 * Point d'entrée unique pour tous les services de notifications
 */

export { NotificationService } from './NotificationService';
export { NotificationFormatter } from './NotificationFormatter';
export { pushCategoryForNotificationType, buildPushHeader, dedupePushSubtitle } from './push-header';

export type {
  CreateNotificationData,
  NotificationEventData,
  AttachmentInfo,
  SenderInfo,
  NotificationMetrics,
  NotificationStats
} from './types';
