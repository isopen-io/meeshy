/**
 * Socket.IO Message Validator
 * Validates incoming Socket.IO events to prevent malformed/malicious payloads
 *
 * Security Features:
 * - Runtime type validation with Zod
 * - Schema-based validation for each event type
 * - Sanitization of user-generated content
 * - Rejection of malformed messages
 *
 * @author Meeshy Security Team
 * @version 1.0.0
 */

import { z } from 'zod';
import { sanitizeNotification } from './xss-protection';
import type { NotificationV2 } from '@/types/notification-v2';

/**
 * Notification Type Enum
 */
const NotificationTypeSchema = z.enum([
  'new_message',
  'new_conversation_direct',
  'new_conversation_group',
  'message_reply',
  'member_joined',
  'contact_request',
  'contact_accepted',
  'user_mentioned',
  'message_reaction',
  'missed_call',
  'system'
]);

/**
 * Notification Priority Enum
 */
const NotificationPrioritySchema = z.enum([
  'low',
  'normal',
  'high',
  'urgent'
]);

/**
 * Context Object Schema
 */
const NotificationContextSchema = z.object({
  conversationId: z.string().optional(),
  conversationTitle: z.string().max(200).optional(),
  messageId: z.string().optional(),
  userId: z.string().optional(),
  callSessionId: z.string().optional()
}).optional();

/**
 * Complete Notification Schema
 * Validates structure of notification events from Socket.IO
 */
const NotificationEventSchema = z.object({
  id: z.string().min(1, 'Notification ID required'),
  userId: z.string().min(1, 'User ID required'),
  type: NotificationTypeSchema,
  title: z.string().max(200, 'Title too long'),
  content: z.string().max(1000, 'Content too long'),
  priority: NotificationPrioritySchema.default('normal'),
  isRead: z.boolean().default(false),
  createdAt: z.union([z.string(), z.date()]).transform(val =>
    typeof val === 'string' ? new Date(val) : val
  ),
  readAt: z.union([z.string(), z.date(), z.null()]).transform(val =>
    val ? (typeof val === 'string' ? new Date(val) : val) : null
  ).optional(),
  expiresAt: z.union([z.string(), z.date(), z.null()]).transform(val =>
    val ? (typeof val === 'string' ? new Date(val) : val) : null
  ).optional(),
  senderId: z.string().optional(),
  senderUsername: z.string().max(50).optional(),
  senderAvatar: z.string().url().optional().nullable(),
  messagePreview: z.string().max(500).optional(),
  context: NotificationContextSchema,
  data: z.record(z.unknown()).optional(),
  attachments: z.array(z.object({
    id: z.string(),
    fileName: z.string(),
    mimeType: z.string(),
    fileSize: z.number(),
    fileUrl: z.string().url()
  })).optional()
});

/**
 * Notification Read Event Schema
 */
const NotificationReadEventSchema = z.object({
  notificationId: z.string().min(1)
});

/**
 * Notification Deleted Event Schema
 */
const NotificationDeletedEventSchema = z.object({
  notificationId: z.string().min(1)
});

/**
 * Notification Counts Event Schema
 */
const NotificationCountsEventSchema = z.object({
  unreadCount: z.number().int().nonnegative(),
  counts: z.object({
    total: z.number().int().nonnegative(),
    unread: z.number().int().nonnegative(),
    byType: z.record(z.number().int().nonnegative()),
    byPriority: z.record(z.number().int().nonnegative())
  })
});

/**
 * Validation result
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  sanitized?: boolean;
}

/**
 * Validate notification event
 *
 * @param data - Raw Socket.IO event data
 * @returns Validation result with sanitized notification
 */
export function validateNotificationEvent(data: unknown): ValidationResult<NotificationV2> {
  try {
    // Validate structure
    const parsed = NotificationEventSchema.parse(data);

    // Sanitize user-generated content
    const sanitized = sanitizeNotification(parsed);

    // Additional validation
    if (!sanitized.id || !sanitized.userId || !sanitized.type) {
      return {
        success: false,
        error: 'Missing required fields'
      };
    }

    // Validate dates
    if (sanitized.createdAt && isNaN(sanitized.createdAt.getTime())) {
      return {
        success: false,
        error: 'Invalid createdAt date'
      };
    }

    return {
      success: true,
      data: sanitized as NotificationV2,
      sanitized: true
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[Socket Validator] Validation failed:', {
        errors: error.errors,
        data
      });

      return {
        success: false,
        error: `Validation failed: ${error.errors.map(e => e.message).join(', ')}`
      };
    }

    console.error('[Socket Validator] Unexpected error:', error);

    return {
      success: false,
      error: 'Unexpected validation error'
    };
  }
}

/**
 * Validate notification read event
 *
 * @param data - Raw Socket.IO event data
 * @returns Validation result
 */
export function validateNotificationReadEvent(data: unknown): ValidationResult<{ notificationId: string }> {
  try {
    const parsed = NotificationReadEventSchema.parse(data);

    return {
      success: true,
      data: parsed
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[Socket Validator] Read event validation failed:', error.errors);

      return {
        success: false,
        error: 'Invalid read event structure'
      };
    }

    return {
      success: false,
      error: 'Unexpected validation error'
    };
  }
}

/**
 * Validate notification deleted event
 *
 * @param data - Raw Socket.IO event data
 * @returns Validation result
 */
export function validateNotificationDeletedEvent(data: unknown): ValidationResult<{ notificationId: string }> {
  try {
    const parsed = NotificationDeletedEventSchema.parse(data);

    return {
      success: true,
      data: parsed
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[Socket Validator] Deleted event validation failed:', error.errors);

      return {
        success: false,
        error: 'Invalid deleted event structure'
      };
    }

    return {
      success: false,
      error: 'Unexpected validation error'
    };
  }
}

/**
 * Validate notification counts event
 *
 * @param data - Raw Socket.IO event data
 * @returns Validation result
 */
export function validateNotificationCountsEvent(data: unknown): ValidationResult<{
  unreadCount: number;
  counts: {
    total: number;
    unread: number;
    byType: Record<string, number>;
    byPriority: Record<string, number>;
  };
}> {
  try {
    const parsed = NotificationCountsEventSchema.parse(data);

    return {
      success: true,
      data: parsed
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[Socket Validator] Counts event validation failed:', error.errors);

      return {
        success: false,
        error: 'Invalid counts event structure'
      };
    }

    return {
      success: false,
      error: 'Unexpected validation error'
    };
  }
}

/**
 * Validate any Socket.IO event
 * Automatically detects event type and applies correct schema
 *
 * @param eventName - Socket.IO event name
 * @param data - Event data
 * @returns Validation result
 */
export function validateSocketEvent(
  eventName: string,
  data: unknown
): ValidationResult<any> {
  switch (eventName) {
    case 'notification':
      return validateNotificationEvent(data);

    case 'notification:read':
      return validateNotificationReadEvent(data);

    case 'notification:deleted':
      return validateNotificationDeletedEvent(data);

    case 'notification:counts':
      return validateNotificationCountsEvent(data);

    default:
      console.warn(`[Socket Validator] Unknown event type: ${eventName}`);
      return {
        success: false,
        error: `Unknown event type: ${eventName}`
      };
  }
}

/**
 * Create Socket.IO event handler with automatic validation
 * Wraps a handler function with validation logic
 *
 * @param eventName - Socket.IO event name
 * @param handler - Handler function (receives validated data)
 * @returns Wrapped handler with validation
 */
export function createValidatedHandler<T>(
  eventName: string,
  handler: (data: T) => void
): (data: unknown) => void {
  return (data: unknown) => {
    const result = validateSocketEvent(eventName, data);

    if (!result.success) {
      console.error(`[Socket Validator] ${eventName} validation failed:`, result.error);
      // Don't call handler with invalid data
      return;
    }

    // Call handler with validated data
    handler(result.data as T);
  };
}

/**
 * Batch validate notifications
 * Use for validating arrays of notifications (e.g., initial load)
 *
 * @param notifications - Array of notification objects
 * @returns Array of valid notifications (invalid ones filtered out)
 */
export function batchValidateNotifications(notifications: unknown[]): NotificationV2[] {
  if (!Array.isArray(notifications)) {
    console.error('[Socket Validator] Expected array of notifications');
    return [];
  }

  const validated: NotificationV2[] = [];
  let invalidCount = 0;

  for (const notification of notifications) {
    const result = validateNotificationEvent(notification);

    if (result.success && result.data) {
      validated.push(result.data);
    } else {
      invalidCount++;
      console.warn('[Socket Validator] Invalid notification filtered out:', result.error);
    }
  }

  if (invalidCount > 0) {
    console.warn(`[Socket Validator] Filtered ${invalidCount} invalid notifications`);
  }

  return validated;
}

/**
 * Validate notification array from API response
 * Use for validating paginated API responses
 *
 * @param response - API response object
 * @returns Validation result with validated notifications
 */
export function validateNotificationResponse(response: unknown): ValidationResult<{
  notifications: NotificationV2[];
  pagination: {
    offset: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
  unreadCount: number;
}> {
  try {
    const schema = z.object({
      notifications: z.array(z.unknown()),
      pagination: z.object({
        offset: z.number().int().nonnegative(),
        limit: z.number().int().positive(),
        total: z.number().int().nonnegative(),
        hasMore: z.boolean()
      }),
      unreadCount: z.number().int().nonnegative()
    });

    const parsed = schema.parse(response);

    // Validate each notification
    const validatedNotifications = batchValidateNotifications(parsed.notifications);

    return {
      success: true,
      data: {
        notifications: validatedNotifications,
        pagination: parsed.pagination,
        unreadCount: parsed.unreadCount
      }
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('[Socket Validator] Response validation failed:', error.errors);

      return {
        success: false,
        error: 'Invalid API response structure'
      };
    }

    return {
      success: false,
      error: 'Unexpected validation error'
    };
  }
}

/**
 * Export schemas for reuse
 */
export const schemas = {
  notification: NotificationEventSchema,
  notificationRead: NotificationReadEventSchema,
  notificationDeleted: NotificationDeletedEventSchema,
  notificationCounts: NotificationCountsEventSchema
};
