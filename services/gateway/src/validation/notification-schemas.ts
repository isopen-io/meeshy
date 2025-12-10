/**
 * Notification Validation Schemas
 *
 * Comprehensive Zod schemas for validating notification-related requests
 * Provides type-safe validation with detailed error messages
 *
 * Security features:
 * - Strict enum validation for notification types
 * - Input sanitization integrated
 * - Length limits to prevent DOS
 * - NoSQL injection prevention
 *
 * @module validation/notification-schemas
 */

import { z } from 'zod';

// ============================================
// ENUMS - Strict Whitelists
// ============================================

export const NotificationTypeEnum = z.enum([
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
  'system',
  'new_conversation',
  'message_edited'
]);

export const NotificationPriorityEnum = z.enum(['low', 'normal', 'high', 'urgent']);

export const NotificationStatusEnum = z.enum(['pending', 'delivered', 'read', 'failed']);

// ============================================
// QUERY SCHEMAS
// ============================================

/**
 * Schema for GET /notifications query parameters
 */
export const GetNotificationsQuerySchema = z.object({
  page: z
    .string()
    .regex(/^\d+$/, 'Page must be a positive integer')
    .transform(Number)
    .refine(val => val >= 1, 'Page must be >= 1')
    .default('1'),

  limit: z
    .string()
    .regex(/^\d+$/, 'Limit must be a positive integer')
    .transform(Number)
    .refine(val => val >= 1 && val <= 100, 'Limit must be between 1 and 100')
    .default('20'),

  unread: z
    .enum(['true', 'false'])
    .transform(val => val === 'true')
    .default('false'),

  type: NotificationTypeEnum.or(z.literal('all')).default('all'),

  priority: NotificationPriorityEnum.optional(),

  // Date range filtering
  startDate: z
    .string()
    .datetime()
    .optional(),

  endDate: z
    .string()
    .datetime()
    .optional()
}).strict(); // Reject unknown query parameters

/**
 * Schema for GET /notifications/stats query
 */
export const GetStatsQuerySchema = z.object({
  period: z.enum(['day', 'week', 'month', 'all']).default('all')
}).strict();

// ============================================
// BODY SCHEMAS
// ============================================

/**
 * Schema for creating a notification
 * POST /notifications (internal use, admin only)
 */
export const CreateNotificationSchema = z.object({
  userId: z
    .string()
    .regex(/^[a-f0-9]{24}$/, 'Invalid userId format (must be MongoDB ObjectId)')
    .min(24)
    .max(24),

  type: NotificationTypeEnum,

  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title must be <= 200 characters')
    .trim(),

  content: z
    .string()
    .min(1, 'Content is required')
    .max(1000, 'Content must be <= 1000 characters')
    .trim(),

  priority: NotificationPriorityEnum.default('normal'),

  // Optional fields
  senderId: z
    .string()
    .regex(/^[a-f0-9]{24}$/, 'Invalid senderId format')
    .optional(),

  senderUsername: z
    .string()
    .max(50, 'Sender username must be <= 50 characters')
    .optional(),

  senderAvatar: z
    .string()
    .url('Invalid avatar URL')
    .max(500, 'Avatar URL too long')
    .optional(),

  messagePreview: z
    .string()
    .max(500, 'Message preview must be <= 500 characters')
    .optional(),

  conversationId: z
    .string()
    .regex(/^[a-f0-9]{24}$/, 'Invalid conversationId format')
    .optional(),

  messageId: z
    .string()
    .regex(/^[a-f0-9]{24}$/, 'Invalid messageId format')
    .optional(),

  callSessionId: z
    .string()
    .regex(/^[a-f0-9]{24}$/, 'Invalid callSessionId format')
    .optional(),

  friendRequestId: z
    .string()
    .regex(/^[a-f0-9]{24}$/, 'Invalid friendRequestId format')
    .optional(),

  reactionId: z
    .string()
    .regex(/^[a-f0-9]{24}$/, 'Invalid reactionId format')
    .optional(),

  // Additional data (sanitized JSON)
  data: z
    .record(z.unknown())
    .optional(),

  expiresAt: z
    .string()
    .datetime()
    .transform(val => new Date(val))
    .optional()
}).strict();

/**
 * Schema for updating notification preferences
 * PUT /notifications/preferences
 */
export const UpdateNotificationPreferencesSchema = z.object({
  pushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),

  // Type-specific preferences
  newMessageEnabled: z.boolean().optional(),
  replyEnabled: z.boolean().optional(),
  mentionEnabled: z.boolean().optional(),
  reactionEnabled: z.boolean().optional(),
  missedCallEnabled: z.boolean().optional(),
  systemEnabled: z.boolean().optional(),
  conversationEnabled: z.boolean().optional(),
  contactRequestEnabled: z.boolean().optional(),
  memberJoinedEnabled: z.boolean().optional(),

  // Do Not Disturb
  dndEnabled: z.boolean().optional(),
  dndStartTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (expected HH:MM)')
    .optional(),
  dndEndTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (expected HH:MM)')
    .optional()
}).strict()
  .refine(
    data => {
      // If DND is enabled, both start and end time must be provided
      if (data.dndEnabled === true) {
        return !!data.dndStartTime && !!data.dndEndTime;
      }
      return true;
    },
    {
      message: 'dndStartTime and dndEndTime are required when dndEnabled is true',
      path: ['dndEnabled']
    }
  );

/**
 * Schema for marking notification as read
 * PATCH /notifications/:id/read
 */
export const MarkAsReadParamSchema = z.object({
  id: z
    .string()
    .regex(/^[a-f0-9]{24}$/, 'Invalid notification ID format')
}).strict();

/**
 * Schema for deleting a notification
 * DELETE /notifications/:id
 */
export const DeleteNotificationParamSchema = z.object({
  id: z
    .string()
    .regex(/^[a-f0-9]{24}$/, 'Invalid notification ID format')
}).strict();

/**
 * Schema for batch operations
 * POST /notifications/batch/mark-read
 */
export const BatchMarkAsReadSchema = z.object({
  notificationIds: z
    .array(
      z.string().regex(/^[a-f0-9]{24}$/, 'Invalid notification ID format')
    )
    .min(1, 'At least one notification ID required')
    .max(100, 'Maximum 100 notifications per batch')
}).strict();

/**
 * Schema for filtering notifications by conversation
 * GET /notifications/conversation/:conversationId
 */
export const ConversationNotificationsParamSchema = z.object({
  conversationId: z
    .string()
    .regex(/^[a-f0-9]{24}$/, 'Invalid conversation ID format')
}).strict();

// ============================================
// MIDDLEWARE HELPER SCHEMAS
// ============================================

/**
 * Schema for sanitizing MongoDB query objects
 * Removes operators like $ne, $gt, etc.
 */
export const SanitizeMongoQuerySchema = z.record(
  z.string().refine(key => !key.startsWith('$'), {
    message: 'MongoDB operators are not allowed in query'
  }),
  z.unknown()
);

// ============================================
// TYPE EXPORTS
// ============================================

export type GetNotificationsQuery = z.infer<typeof GetNotificationsQuerySchema>;
export type CreateNotificationInput = z.infer<typeof CreateNotificationSchema>;
export type UpdateNotificationPreferencesInput = z.infer<typeof UpdateNotificationPreferencesSchema>;
export type MarkAsReadParam = z.infer<typeof MarkAsReadParamSchema>;
export type DeleteNotificationParam = z.infer<typeof DeleteNotificationParamSchema>;
export type BatchMarkAsReadInput = z.infer<typeof BatchMarkAsReadSchema>;
export type ConversationNotificationsParam = z.infer<typeof ConversationNotificationsParamSchema>;
export type NotificationType = z.infer<typeof NotificationTypeEnum>;
export type NotificationPriority = z.infer<typeof NotificationPriorityEnum>;

// ============================================
// VALIDATION MIDDLEWARE FACTORY
// ============================================

/**
 * Creates a Fastify pre-handler for validating request data
 *
 * @param schema - Zod schema to validate against
 * @param source - Where to find the data ('body' | 'query' | 'params')
 * @returns Fastify request handler
 */
export function createValidator(
  schema: z.ZodSchema,
  source: 'body' | 'query' | 'params'
) {
  return async (request: any, reply: any) => {
    try {
      const dataToValidate = request[source];
      const validated = await schema.parseAsync(dataToValidate);

      // Replace request data with validated & sanitized data
      request[source] = validated;
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          message: 'Validation failed',
          errors: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        });
      }

      // Unexpected error
      return reply.status(500).send({
        success: false,
        message: 'Validation error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };
}

/**
 * Validates request query parameters
 */
export const validateQuery = (schema: z.ZodSchema) => createValidator(schema, 'query');

/**
 * Validates request body
 */
export const validateBody = (schema: z.ZodSchema) => createValidator(schema, 'body');

/**
 * Validates request params
 */
export const validateParams = (schema: z.ZodSchema) => createValidator(schema, 'params');
