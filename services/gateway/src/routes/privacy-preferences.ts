/**
 * Routes for user privacy preferences
 * Unified under /user-preferences/privacy
 *
 * Routes:
 * - GET /user-preferences/privacy - Get privacy preferences (with defaults)
 * - PUT /user-preferences/privacy - Update privacy preferences
 * - DELETE /user-preferences/privacy - Reset to defaults
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../utils/logger';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import {
  PRIVACY_PREFERENCES_DEFAULTS,
  PRIVACY_KEY_MAPPING,
  PRIVACY_KEY_REVERSE_MAPPING,
  PrivacyPreferencesDefaults
} from '../config/user-preferences-defaults';

interface PrivacyPreferencesBody {
  showOnlineStatus?: boolean;
  showLastSeen?: boolean;
  showReadReceipts?: boolean;
  showTypingIndicator?: boolean;
  allowContactRequests?: boolean;
  allowGroupInvites?: boolean;
  saveMediaToGallery?: boolean;
  allowAnalytics?: boolean;
}

// ========== SCHEMAS FOR OPENAPI DOCUMENTATION ==========

const privacyPreferencesSchema = {
  type: 'object',
  description: 'User privacy preferences',
  properties: {
    id: { type: 'string', nullable: true, description: 'Preference ID (null if using defaults)' },
    userId: { type: 'string', description: 'User ID' },

    // Profile visibility
    showOnlineStatus: { type: 'boolean', description: 'Show online status to others' },
    showLastSeen: { type: 'boolean', description: 'Show last seen time to others' },
    showReadReceipts: { type: 'boolean', description: 'Send read receipts' },
    showTypingIndicator: { type: 'boolean', description: 'Show typing indicator' },

    // Contact settings
    allowContactRequests: { type: 'boolean', description: 'Allow contact requests from strangers' },
    allowGroupInvites: { type: 'boolean', description: 'Allow group invites from non-contacts' },

    // Data settings
    saveMediaToGallery: { type: 'boolean', description: 'Auto-save media to gallery' },
    allowAnalytics: { type: 'boolean', description: 'Allow anonymous usage analytics' },

    isDefault: { type: 'boolean', description: 'Whether using default values' },
    createdAt: { type: 'string', format: 'date-time', nullable: true, description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last update timestamp' }
  }
} as const;

const updatePrivacyPreferencesRequestSchema = {
  type: 'object',
  properties: {
    showOnlineStatus: { type: 'boolean', description: 'Show online status to others' },
    showLastSeen: { type: 'boolean', description: 'Show last seen time to others' },
    showReadReceipts: { type: 'boolean', description: 'Send read receipts' },
    showTypingIndicator: { type: 'boolean', description: 'Show typing indicator' },
    allowContactRequests: { type: 'boolean', description: 'Allow contact requests from strangers' },
    allowGroupInvites: { type: 'boolean', description: 'Allow group invites from non-contacts' },
    saveMediaToGallery: { type: 'boolean', description: 'Auto-save media to gallery' },
    allowAnalytics: { type: 'boolean', description: 'Allow anonymous usage analytics' }
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

export default async function privacyPreferencesRoutes(fastify: FastifyInstance) {

  /**
   * GET /user-preferences/privacy
   * Get user privacy preferences (with defaults if not set)
   */
  fastify.get(
    '/user-preferences/privacy',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Get privacy preferences for the authenticated user. Returns stored values or defaults if not set.',
        tags: ['preferences', 'privacy'],
        summary: 'Get privacy preferences',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: privacyPreferencesSchema
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

        // Get all privacy-related preferences from UserPreference table
        const dbKeys = Object.values(PRIVACY_KEY_MAPPING);
        const storedPreferences = await fastify.prisma.userPreference.findMany({
          where: {
            userId,
            key: { in: dbKeys }
          }
        });

        // Create a map of stored values
        const storedMap = new Map(storedPreferences.map(p => [p.key, p]));

        // Build the response object with defaults for missing values
        const privacyPrefs: Record<string, boolean> = {};
        let hasStoredValues = false;
        let latestUpdatedAt: Date | null = null;
        let latestCreatedAt: Date | null = null;

        for (const [frontendKey, dbKey] of Object.entries(PRIVACY_KEY_MAPPING)) {
          const stored = storedMap.get(dbKey);
          if (stored) {
            hasStoredValues = true;
            privacyPrefs[frontendKey] = stored.value === 'true';
            if (!latestUpdatedAt || (stored.updatedAt && stored.updatedAt > latestUpdatedAt)) {
              latestUpdatedAt = stored.updatedAt;
            }
            if (!latestCreatedAt || (stored.createdAt && stored.createdAt > latestCreatedAt)) {
              latestCreatedAt = stored.createdAt;
            }
          } else {
            // Use default value
            privacyPrefs[frontendKey] = PRIVACY_PREFERENCES_DEFAULTS[frontendKey as keyof PrivacyPreferencesDefaults];
          }
        }

        return reply.send({
          success: true,
          data: {
            id: hasStoredValues ? 'privacy-prefs' : null,
            userId,
            ...privacyPrefs,
            isDefault: !hasStoredValues,
            createdAt: latestCreatedAt,
            updatedAt: latestUpdatedAt
          }
        });

      } catch (error) {
        logError(fastify.log, 'Error fetching privacy preferences:', error);
        return reply.status(500).send({
          success: false,
          message: 'Error fetching privacy preferences'
        });
      }
    }
  );

  /**
   * PUT /user-preferences/privacy
   * Update user privacy preferences
   */
  fastify.put<{ Body: PrivacyPreferencesBody }>(
    '/user-preferences/privacy',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Update privacy preferences for the authenticated user. Only provided fields will be updated.',
        tags: ['preferences', 'privacy'],
        summary: 'Update privacy preferences',
        body: updatePrivacyPreferencesRequestSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: privacyPreferencesSchema
            }
          },
          400: errorResponseSchema,
          401: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest<{ Body: PrivacyPreferencesBody }>, reply: FastifyReply) => {
      try {
        const authContext = (request as any).authContext;
        if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
          return reply.status(401).send({
            success: false,
            message: 'Authentication required'
          });
        }

        const userId = authContext.userId;
        const updates = request.body;

        // Validate that at least one field is provided
        if (Object.keys(updates).length === 0) {
          return reply.status(400).send({
            success: false,
            message: 'At least one privacy preference must be provided'
          });
        }

        // Update each provided preference using findFirst + update/create pattern
        // (UserPreference doesn't have a composite unique constraint on userId+key)
        const now = new Date();

        for (const [frontendKey, value] of Object.entries(updates)) {
          if (value === undefined) continue;

          const dbKey = PRIVACY_KEY_MAPPING[frontendKey as keyof PrivacyPreferencesDefaults];
          if (!dbKey) continue;

          // Check if preference exists
          const existing = await fastify.prisma.userPreference.findFirst({
            where: { userId, key: dbKey }
          });

          if (existing) {
            await fastify.prisma.userPreference.update({
              where: { id: existing.id },
              data: {
                value: String(value),
                updatedAt: now
              }
            });
          } else {
            await fastify.prisma.userPreference.create({
              data: {
                userId,
                key: dbKey,
                value: String(value),
                valueType: 'boolean'
              }
            });
          }
        }

        // Fetch the updated preferences to return
        const dbKeys = Object.values(PRIVACY_KEY_MAPPING);
        const storedPreferences = await fastify.prisma.userPreference.findMany({
          where: {
            userId,
            key: { in: dbKeys }
          }
        });

        const storedMap = new Map(storedPreferences.map(p => [p.key, p]));

        // Build the response object
        const privacyPrefs: Record<string, boolean> = {};
        let latestUpdatedAt: Date | null = null;
        let latestCreatedAt: Date | null = null;

        for (const [frontendKey, dbKey] of Object.entries(PRIVACY_KEY_MAPPING)) {
          const stored = storedMap.get(dbKey);
          if (stored) {
            privacyPrefs[frontendKey] = stored.value === 'true';
            if (!latestUpdatedAt || (stored.updatedAt && stored.updatedAt > latestUpdatedAt)) {
              latestUpdatedAt = stored.updatedAt;
            }
            if (!latestCreatedAt || (stored.createdAt && stored.createdAt > latestCreatedAt)) {
              latestCreatedAt = stored.createdAt;
            }
          } else {
            privacyPrefs[frontendKey] = PRIVACY_PREFERENCES_DEFAULTS[frontendKey as keyof PrivacyPreferencesDefaults];
          }
        }

        return reply.send({
          success: true,
          data: {
            id: 'privacy-prefs',
            userId,
            ...privacyPrefs,
            isDefault: false,
            createdAt: latestCreatedAt,
            updatedAt: latestUpdatedAt
          }
        });

      } catch (error) {
        logError(fastify.log, 'Error updating privacy preferences:', error);
        return reply.status(500).send({
          success: false,
          message: 'Error updating privacy preferences'
        });
      }
    }
  );

  /**
   * DELETE /user-preferences/privacy
   * Reset privacy preferences to defaults
   */
  fastify.delete(
    '/user-preferences/privacy',
    {
      preValidation: [fastify.authenticate],
      schema: {
        description: 'Reset privacy preferences to defaults by deleting stored values.',
        tags: ['preferences', 'privacy'],
        summary: 'Reset privacy preferences',
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

        // Delete all privacy-related preferences
        const dbKeys = Object.values(PRIVACY_KEY_MAPPING);
        await fastify.prisma.userPreference.deleteMany({
          where: {
            userId,
            key: { in: dbKeys }
          }
        });

        return reply.send({
          success: true,
          data: {
            message: 'Privacy preferences reset to defaults'
          }
        });

      } catch (error) {
        logError(fastify.log, 'Error resetting privacy preferences:', error);
        return reply.status(500).send({
          success: false,
          message: 'Error resetting privacy preferences'
        });
      }
    }
  );
}
