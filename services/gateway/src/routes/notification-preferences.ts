/**
 * Routes for user notification preferences
 * Unified under /user-preferences/notifications
 *
 * Routes:
 * - GET /user-preferences/notifications - Get notification preferences (with defaults)
 * - PUT /user-preferences/notifications - Update notification preferences
 * - DELETE /user-preferences/notifications - Reset to defaults
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../utils/logger';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import {
  NOTIFICATION_PREFERENCES_DEFAULTS,
  isValidDndTime
} from '../config/user-preferences-defaults';

interface NotificationPreferencesBody {
  // Global toggles
  pushEnabled?: boolean;
  emailEnabled?: boolean;
  soundEnabled?: boolean;

  // Per-type preferences
  newMessageEnabled?: boolean;
  missedCallEnabled?: boolean;
  systemEnabled?: boolean;
  conversationEnabled?: boolean;
  replyEnabled?: boolean;
  mentionEnabled?: boolean;
  reactionEnabled?: boolean;
  contactRequestEnabled?: boolean;
  memberJoinedEnabled?: boolean;

  // Do Not Disturb
  dndEnabled?: boolean;
  dndStartTime?: string | null;
  dndEndTime?: string | null;
}

// ========== SCHEMAS FOR OPENAPI DOCUMENTATION ==========

const notificationPreferencesSchema = {
  type: 'object',
  description: 'User notification preferences',
  properties: {
    id: { type: 'string', nullable: true, description: 'Preference ID (null if default)' },
    userId: { type: 'string', description: 'User ID' },

    // Global toggles
    pushEnabled: { type: 'boolean', description: 'Enable push notifications' },
    emailEnabled: { type: 'boolean', description: 'Enable email notifications' },
    soundEnabled: { type: 'boolean', description: 'Enable notification sounds' },

    // Per-type preferences
    newMessageEnabled: { type: 'boolean', description: 'Notify on new messages' },
    missedCallEnabled: { type: 'boolean', description: 'Notify on missed calls' },
    systemEnabled: { type: 'boolean', description: 'System notifications' },
    conversationEnabled: { type: 'boolean', description: 'Conversation notifications' },
    replyEnabled: { type: 'boolean', description: 'Notify on replies' },
    mentionEnabled: { type: 'boolean', description: 'Notify on mentions' },
    reactionEnabled: { type: 'boolean', description: 'Notify on reactions' },
    contactRequestEnabled: { type: 'boolean', description: 'Notify on contact requests' },
    memberJoinedEnabled: { type: 'boolean', description: 'Notify when members join' },

    // Do Not Disturb
    dndEnabled: { type: 'boolean', description: 'Do Not Disturb enabled' },
    dndStartTime: { type: 'string', nullable: true, description: 'DND start time (HH:MM)' },
    dndEndTime: { type: 'string', nullable: true, description: 'DND end time (HH:MM)' },

    isDefault: { type: 'boolean', description: 'Whether using default values' },
    createdAt: { type: 'string', format: 'date-time', nullable: true, description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last update timestamp' }
  }
} as const;

const updateNotificationPreferencesRequestSchema = {
  type: 'object',
  properties: {
    pushEnabled: { type: 'boolean', description: 'Enable push notifications' },
    emailEnabled: { type: 'boolean', description: 'Enable email notifications' },
    soundEnabled: { type: 'boolean', description: 'Enable notification sounds' },

    newMessageEnabled: { type: 'boolean', description: 'Notify on new messages' },
    missedCallEnabled: { type: 'boolean', description: 'Notify on missed calls' },
    systemEnabled: { type: 'boolean', description: 'System notifications' },
    conversationEnabled: { type: 'boolean', description: 'Conversation notifications' },
    replyEnabled: { type: 'boolean', description: 'Notify on replies' },
    mentionEnabled: { type: 'boolean', description: 'Notify on mentions' },
    reactionEnabled: { type: 'boolean', description: 'Notify on reactions' },
    contactRequestEnabled: { type: 'boolean', description: 'Notify on contact requests' },
    memberJoinedEnabled: { type: 'boolean', description: 'Notify when members join' },

    dndEnabled: { type: 'boolean', description: 'Enable Do Not Disturb' },
    dndStartTime: { type: 'string', nullable: true, pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$', description: 'DND start time (HH:MM)' },
    dndEndTime: { type: 'string', nullable: true, pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$', description: 'DND end time (HH:MM)' }
  }
} as const;

const successMessageResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Success message' }
      }
    }
  }
} as const;

export default async function notificationPreferencesRoutes(fastify: FastifyInstance) {

  /**
   * GET /user-preferences/notifications
   * Get user notification preferences (with defaults if not set)
   */
  fastify.get(
    '/user-preferences/notifications',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Get notification preferences for the authenticated user. Returns stored values or defaults if not set.',
        tags: ['preferences', 'notifications'],
        summary: 'Get notification preferences',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: notificationPreferencesSchema
            }
          },
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const authContext = (request as any).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return reply.status(401).send({
            success: false,
            message: 'Authentication required'
          });
        }

        const userId = authContext.userId;

        // Try to get stored preferences
        const preferences = await fastify.prisma.notificationPreference.findUnique({
          where: { userId }
        });

        if (preferences) {
          reply.send({
            success: true,
            data: {
              ...preferences,
              isDefault: false
            }
          });
        } else {
          // Return defaults
          reply.send({
            success: true,
            data: {
              id: null,
              userId,
              ...NOTIFICATION_PREFERENCES_DEFAULTS,
              isDefault: true,
              createdAt: null,
              updatedAt: null
            }
          });
        }
      } catch (error) {
        logError(fastify.log, 'Error fetching notification preferences:', error);
        reply.code(500).send({
          success: false,
          message: 'Error fetching notification preferences'
        });
      }
    }
  );

  /**
   * PUT /user-preferences/notifications
   * Update notification preferences (upsert)
   */
  fastify.put<{ Body: NotificationPreferencesBody }>(
    '/user-preferences/notifications',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Update notification preferences. Creates new record if none exists. Supports partial updates.',
        tags: ['preferences', 'notifications'],
        summary: 'Update notification preferences',
        body: updateNotificationPreferencesRequestSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: notificationPreferencesSchema
            }
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Body: NotificationPreferencesBody }>, reply: FastifyReply) => {
      try {
        const authContext = (request as any).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return reply.status(401).send({
            success: false,
            message: 'Authentication required'
          });
        }

        const userId = authContext.userId;
        const data = request.body;

        // Validate DND times if provided
        if (data.dndStartTime && !isValidDndTime(data.dndStartTime)) {
          return reply.status(400).send({
            success: false,
            message: 'Invalid dndStartTime format. Expected HH:MM (e.g., 22:00)'
          });
        }
        if (data.dndEndTime && !isValidDndTime(data.dndEndTime)) {
          return reply.status(400).send({
            success: false,
            message: 'Invalid dndEndTime format. Expected HH:MM (e.g., 08:00)'
          });
        }

        // If DND is being enabled, both times are required
        if (data.dndEnabled === true) {
          const existingPrefs = await fastify.prisma.notificationPreference.findUnique({
            where: { userId }
          });

          const startTime = data.dndStartTime ?? existingPrefs?.dndStartTime;
          const endTime = data.dndEndTime ?? existingPrefs?.dndEndTime;

          if (!startTime || !endTime) {
            return reply.status(400).send({
              success: false,
              message: 'dndStartTime and dndEndTime are required when enabling DND'
            });
          }
        }

        // Prepare update data (filter undefined values)
        const updateData: any = {};
        if (data.pushEnabled !== undefined) updateData.pushEnabled = data.pushEnabled;
        if (data.emailEnabled !== undefined) updateData.emailEnabled = data.emailEnabled;
        if (data.soundEnabled !== undefined) updateData.soundEnabled = data.soundEnabled;

        if (data.newMessageEnabled !== undefined) updateData.newMessageEnabled = data.newMessageEnabled;
        if (data.missedCallEnabled !== undefined) updateData.missedCallEnabled = data.missedCallEnabled;
        if (data.systemEnabled !== undefined) updateData.systemEnabled = data.systemEnabled;
        if (data.conversationEnabled !== undefined) updateData.conversationEnabled = data.conversationEnabled;
        if (data.replyEnabled !== undefined) updateData.replyEnabled = data.replyEnabled;
        if (data.mentionEnabled !== undefined) updateData.mentionEnabled = data.mentionEnabled;
        if (data.reactionEnabled !== undefined) updateData.reactionEnabled = data.reactionEnabled;
        if (data.contactRequestEnabled !== undefined) updateData.contactRequestEnabled = data.contactRequestEnabled;
        if (data.memberJoinedEnabled !== undefined) updateData.memberJoinedEnabled = data.memberJoinedEnabled;

        if (data.dndEnabled !== undefined) updateData.dndEnabled = data.dndEnabled;
        if (data.dndStartTime !== undefined) updateData.dndStartTime = data.dndStartTime;
        if (data.dndEndTime !== undefined) updateData.dndEndTime = data.dndEndTime;

        const preferences = await fastify.prisma.notificationPreference.upsert({
          where: { userId },
          create: {
            userId,
            ...NOTIFICATION_PREFERENCES_DEFAULTS,
            ...updateData
          },
          update: updateData
        });

        reply.send({
          success: true,
          data: {
            ...preferences,
            isDefault: false
          }
        });
      } catch (error) {
        logError(fastify.log, 'Error updating notification preferences:', error);
        reply.code(500).send({
          success: false,
          message: 'Error updating notification preferences'
        });
      }
    }
  );

  /**
   * DELETE /user-preferences/notifications
   * Reset notification preferences to defaults
   */
  fastify.delete(
    '/user-preferences/notifications',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Reset notification preferences to default values by deleting stored preferences.',
        tags: ['preferences', 'notifications'],
        summary: 'Reset notification preferences',
        response: {
          200: successMessageResponseSchema,
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const authContext = (request as any).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return reply.status(401).send({
            success: false,
            message: 'Authentication required'
          });
        }

        const userId = authContext.userId;

        // Delete existing preferences (will revert to defaults on next GET)
        await fastify.prisma.notificationPreference.deleteMany({
          where: { userId }
        });

        reply.send({
          success: true,
          data: { message: 'Notification preferences reset to defaults' }
        });
      } catch (error) {
        logError(fastify.log, 'Error resetting notification preferences:', error);
        reply.code(500).send({
          success: false,
          message: 'Error resetting notification preferences'
        });
      }
    }
  );
}
