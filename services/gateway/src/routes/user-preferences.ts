/**
 * Route pour gérer les préférences utilisateur dans le Gateway
 * Utilise Prisma pour les opérations CRUD sur UserPreference
 *
 * Routes:
 * - GET /user-preferences/ - Get all preferences (with defaults)
 * - GET /user-preferences/:key - Get specific preference (with default)
 * - POST /user-preferences/ - Create or update a preference
 * - DELETE /user-preferences/:key - Delete a specific preference
 * - DELETE /user-preferences/ - Reset all preferences
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../utils/logger';
import {
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import {
  USER_PREFERENCES_DEFAULTS,
  getDefaultUserPreference,
  getAllDefaultUserPreferences,
  validatePreferenceValue
} from '../config/user-preferences-defaults';

interface UserPreferenceBody {
  key: string;
  value: string;
}

interface UserPreferenceParams {
  key?: string;
}

// Schema for user preference response
const userPreferenceResponseSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', nullable: true, description: 'Preference ID (null if default)' },
    userId: { type: 'string', description: 'User ID' },
    key: { type: 'string', description: 'Preference key' },
    value: { type: 'string', description: 'Preference value' },
    valueType: { type: 'string', description: 'Value type (string, boolean, number)' },
    isDefault: { type: 'boolean', description: 'Whether this is a default value' },
    createdAt: { type: 'string', format: 'date-time', nullable: true, description: 'Creation timestamp' },
    updatedAt: { type: 'string', format: 'date-time', nullable: true, description: 'Last update timestamp' }
  }
} as const;

export default async function userPreferencesRoutes(fastify: FastifyInstance) {
  /**
   * GET /user-preferences/
   * Get all preferences for the authenticated user
   * Returns stored preferences merged with defaults for missing keys
   */
  fastify.get('/user-preferences', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'Get all preferences for the authenticated user. Returns stored preferences merged with defaults for any missing keys.',
      tags: ['users', 'preferences'],
      summary: 'Get all user preferences',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: userPreferenceResponseSchema
            }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required',
          error: 'User must be authenticated'
        });
      }

      const userId = authContext.userId;

      // Get stored preferences
      const storedPreferences = await fastify.prisma.userPreference.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' }
      });

      // Create a map of stored preferences by key
      const storedMap = new Map(storedPreferences.map(p => [p.key, p]));

      // Merge with defaults
      const allPreferences = getAllDefaultUserPreferences().map(defaultPref => {
        const stored = storedMap.get(defaultPref.key);
        if (stored) {
          return {
            id: stored.id,
            userId: stored.userId,
            key: stored.key,
            value: stored.value,
            valueType: stored.valueType || defaultPref.valueType,
            isDefault: false,
            createdAt: stored.createdAt,
            updatedAt: stored.updatedAt
          };
        }
        return {
          id: null,
          userId,
          key: defaultPref.key,
          value: defaultPref.value,
          valueType: defaultPref.valueType,
          isDefault: true,
          createdAt: null,
          updatedAt: null
        };
      });

      // Add any custom preferences not in defaults
      storedPreferences.forEach(stored => {
        if (!USER_PREFERENCES_DEFAULTS[stored.key]) {
          allPreferences.push({
            id: stored.id,
            userId: stored.userId,
            key: stored.key,
            value: stored.value,
            valueType: stored.valueType || 'string',
            isDefault: false,
            createdAt: stored.createdAt,
            updatedAt: stored.updatedAt
          });
        }
      });

      reply.send({
        success: true,
        data: allPreferences
      });

    } catch (error) {
      logError(fastify.log, 'Error fetching user preferences:', error);
      reply.code(500).send({
        success: false,
        message: 'Erreur lors de la récupération des préférences'
      });
    }
  });

  /**
   * GET /user-preferences/:key
   * Get a specific preference by key
   * Returns stored value or default if not set
   */
  fastify.get<{ Params: UserPreferenceParams }>('/user-preferences/:key', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'Get a specific preference by key for the authenticated user. Returns stored value or default if not set.',
      tags: ['users', 'preferences'],
      summary: 'Get preference by key',
      params: {
        type: 'object',
        required: ['key'],
        properties: {
          key: { type: 'string', description: 'Preference key to retrieve' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: userPreferenceResponseSchema
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: UserPreferenceParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      const { key } = request.params;

      if (!key) {
        return reply.code(400).send({
          success: false,
          message: 'Clé de préférence requise'
        });
      }

      // Try to get stored preference
      const storedPreference = await fastify.prisma.userPreference.findFirst({
        where: { userId, key }
      });

      if (storedPreference) {
        return reply.send({
          success: true,
          data: {
            id: storedPreference.id,
            userId: storedPreference.userId,
            key: storedPreference.key,
            value: storedPreference.value,
            valueType: storedPreference.valueType || 'string',
            isDefault: false,
            createdAt: storedPreference.createdAt,
            updatedAt: storedPreference.updatedAt
          }
        });
      }

      // Return default if available
      const defaultPref = getDefaultUserPreference(key);
      if (defaultPref) {
        return reply.send({
          success: true,
          data: {
            id: null,
            userId,
            key,
            value: defaultPref.value,
            valueType: defaultPref.valueType,
            isDefault: true,
            createdAt: null,
            updatedAt: null
          }
        });
      }

      // Key not found and no default
      return reply.status(404).send({
        success: false,
        message: `Préférence '${key}' non trouvée`
      });

    } catch (error) {
      logError(fastify.log, 'Error fetching user preference:', error);
      reply.code(500).send({
        success: false,
        message: 'Erreur lors de la récupération de la préférence'
      });
    }
  });

  /**
   * POST /user-preferences/
   * Create or update a preference
   */
  fastify.post<{ Body: UserPreferenceBody }>('/user-preferences', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'Create or update a user preference. If the preference key already exists, it will be updated with the new value. Special validation applies for certain keys.',
      tags: ['users', 'preferences'],
      summary: 'Create or update preference',
      body: {
        type: 'object',
        required: ['key', 'value'],
        properties: {
          key: {
            type: 'string',
            description: 'Preference key (e.g., font-family, theme, etc.)'
          },
          value: {
            type: 'string',
            description: 'Preference value (must be valid for the specific key)'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: userPreferenceResponseSchema
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', description: 'Error message' }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Body: UserPreferenceBody }>, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      const { key, value } = request.body;

      // Validate the value based on key
      const validation = validatePreferenceValue(key, value);
      if (!validation.valid) {
        return reply.code(400).send({
          success: false,
          message: validation.error
        });
      }

      // Get value type from defaults or use 'string'
      const defaultPref = USER_PREFERENCES_DEFAULTS[key];
      const valueType = defaultPref?.valueType || 'string';

      // Check if the preference exists
      const existingPreference = await fastify.prisma.userPreference.findFirst({
        where: { userId, key }
      });

      let preference;
      if (existingPreference) {
        preference = await fastify.prisma.userPreference.update({
          where: { id: existingPreference.id },
          data: {
            value,
            valueType,
            updatedAt: new Date()
          }
        });
      } else {
        preference = await fastify.prisma.userPreference.create({
          data: {
            userId,
            key,
            value,
            valueType
          }
        });
      }

      reply.send({
        success: true,
        data: {
          id: preference.id,
          userId: preference.userId,
          key: preference.key,
          value: preference.value,
          valueType: preference.valueType || valueType,
          isDefault: false,
          createdAt: preference.createdAt,
          updatedAt: preference.updatedAt
        }
      });

    } catch (error) {
      logError(fastify.log, 'Error saving user preference:', error);
      reply.code(500).send({
        success: false,
        message: 'Erreur lors de la sauvegarde de la préférence'
      });
    }
  });

  /**
   * DELETE /user-preferences/:key
   * Delete a specific preference (reverts to default)
   */
  fastify.delete<{ Params: UserPreferenceParams }>('/user-preferences/:key', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'Delete a specific user preference by key. The preference will revert to its default value if one exists.',
      tags: ['users', 'preferences'],
      summary: 'Delete preference by key',
      params: {
        type: 'object',
        required: ['key'],
        properties: {
          key: { type: 'string', description: 'Preference key to delete' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Préférence supprimée avec succès' },
                defaultValue: { type: 'string', nullable: true, description: 'The default value for this key, if any' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: UserPreferenceParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      const { key } = request.params;

      if (!key) {
        return reply.code(400).send({
          success: false,
          message: 'Clé de préférence requise'
        });
      }

      const existingPreference = await fastify.prisma.userPreference.findFirst({
        where: { userId, key }
      });

      if (existingPreference) {
        await fastify.prisma.userPreference.delete({
          where: { id: existingPreference.id }
        });
      }

      // Get default value to return
      const defaultPref = getDefaultUserPreference(key);

      reply.send({
        success: true,
        data: {
          message: 'Préférence supprimée avec succès',
          defaultValue: defaultPref?.value || null
        }
      });

    } catch (error) {
      logError(fastify.log, 'Error deleting user preference:', error);
      reply.code(500).send({
        success: false,
        message: 'Erreur lors de la suppression de la préférence'
      });
    }
  });

  /**
   * DELETE /user-preferences/
   * Reset all preferences (reverts to defaults)
   */
  fastify.delete('/user-preferences', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'Reset all user preferences by deleting them from the database. All preferences will revert to their default values.',
      tags: ['users', 'preferences'],
      summary: 'Reset all preferences',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Toutes les préférences ont été réinitialisées' },
                deletedCount: { type: 'number', description: 'Number of preferences deleted' }
              }
            }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required'
        });
      }

      const userId = authContext.userId;

      const result = await fastify.prisma.userPreference.deleteMany({
        where: { userId }
      });

      reply.send({
        success: true,
        data: {
          message: 'Toutes les préférences ont été réinitialisées',
          deletedCount: result.count
        }
      });

    } catch (error) {
      logError(fastify.log, 'Error resetting user preferences:', error);
      reply.code(500).send({
        success: false,
        message: 'Erreur lors de la réinitialisation des préférences'
      });
    }
  });
}
