/**
 * Routes for user features management (enable/disable/validate)
 *
 * @version 1.0.0
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { UserFeaturesService } from '../../services/UserFeaturesService';
import {
  FeatureParams,
  ACTIVATABLE_FEATURES,
  featureStatusResponseSchema,
  errorResponseSchema
} from './types';

/**
 * Register feature management routes
 */
export async function registerFeatureManagementRoutes(fastify: FastifyInstance) {
  const userFeaturesService = new UserFeaturesService(fastify.prisma);

  /**
   * GET /user-features
   * Get complete feature status for the authenticated user
   */
  fastify.get('/user-features', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'Get the complete feature and consent status for the authenticated user',
      tags: ['users', 'features', 'gdpr'],
      summary: 'Get user feature status',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: featureStatusResponseSchema
          }
        },
        401: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      const status = await userFeaturesService.getFeatureStatus(userId);

      if (!status) {
        return reply.status(404).send({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      return reply.send({
        success: true,
        data: status
      });

    } catch (error) {
      logError(fastify.log, 'Error fetching user feature status:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la récupération du statut des fonctionnalités'
      });
    }
  });

  /**
   * GET /user-features/validate/:feature
   * Validate if a specific feature can be used
   */
  fastify.get<{ Params: FeatureParams }>('/user-features/validate/:feature', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'Validate if the user can use a specific feature',
      tags: ['users', 'features'],
      summary: 'Validate feature usage',
      params: {
        type: 'object',
        required: ['feature'],
        properties: {
          feature: {
            type: 'string',
            enum: ['translateText', 'transcribeAudio', 'translateAudio', 'generateTranslatedAudio', 'voiceCloning', 'othersHearClonedVoice'],
            description: 'Feature to validate'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                allowed: { type: 'boolean' },
                reason: { type: 'string', nullable: true },
                missingConsents: { type: 'array', items: { type: 'string' }, nullable: true },
                missingFeatures: { type: 'array', items: { type: 'string' }, nullable: true }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: FeatureParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      const { feature } = request.params;

      let result;
      switch (feature) {
        case 'translateText':
          result = await userFeaturesService.canTranslateText(userId);
          break;
        case 'transcribeAudio':
          result = await userFeaturesService.canTranscribeAudio(userId);
          break;
        case 'translateAudio':
          result = await userFeaturesService.canTranslateAudio(userId);
          break;
        case 'generateTranslatedAudio':
          result = await userFeaturesService.canGenerateTranslatedAudio(userId);
          break;
        case 'voiceCloning':
          result = await userFeaturesService.canUseVoiceCloning(userId);
          break;
        case 'othersHearClonedVoice':
          result = await userFeaturesService.canOthersHearClonedVoice(userId);
          break;
        default:
          return reply.status(400).send({
            success: false,
            message: `Feature inconnue: ${feature}`
          });
      }

      return reply.send({
        success: true,
        data: result
      });

    } catch (error) {
      logError(fastify.log, 'Error validating feature:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la validation de la fonctionnalité'
      });
    }
  });

  /**
   * POST /user-features/:feature/enable
   * Enable a feature for the authenticated user
   */
  fastify.post<{ Params: FeatureParams }>('/user-features/:feature/enable', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'Enable a feature for the authenticated user. Checks dependencies automatically.',
      tags: ['users', 'features'],
      summary: 'Enable feature',
      params: {
        type: 'object',
        required: ['feature'],
        properties: {
          feature: {
            type: 'string',
            description: 'Feature field name to enable (e.g., textTranslationEnabledAt)'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                enabledAt: { type: 'string', format: 'date-time' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: FeatureParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      const { feature } = request.params;

      // Vérifier que la feature est activable
      if (!ACTIVATABLE_FEATURES.includes(feature as any)) {
        return reply.status(400).send({
          success: false,
          message: `Feature '${feature}' non activable. Features disponibles: ${ACTIVATABLE_FEATURES.join(', ')}`
        });
      }

      const result = await userFeaturesService.enableFeature(userId, feature);

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          message: result.error
        });
      }

      return reply.send({
        success: true,
        data: {
          message: `Feature '${feature}' activée avec succès`,
          enabledAt: new Date().toISOString()
        }
      });

    } catch (error) {
      logError(fastify.log, 'Error enabling feature:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de l\'activation de la fonctionnalité'
      });
    }
  });

  /**
   * POST /user-features/:feature/disable
   * Disable a feature for the authenticated user
   */
  fastify.post<{ Params: FeatureParams }>('/user-features/:feature/disable', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'Disable a feature for the authenticated user. Cascades to dependent features.',
      tags: ['users', 'features'],
      summary: 'Disable feature',
      params: {
        type: 'object',
        required: ['feature'],
        properties: {
          feature: {
            type: 'string',
            description: 'Feature field name to disable'
          }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                disabledFeatures: { type: 'array', items: { type: 'string' } }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: FeatureParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      const { feature } = request.params;

      // Vérifier que la feature est dans la liste
      if (!ACTIVATABLE_FEATURES.includes(feature as any)) {
        return reply.status(400).send({
          success: false,
          message: `Feature '${feature}' inconnue`
        });
      }

      const result = await userFeaturesService.disableFeature(userId, feature);

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          message: result.error
        });
      }

      return reply.send({
        success: true,
        data: {
          message: `Feature '${feature}' désactivée avec succès`,
          disabledFeatures: result.disabledFeatures || [feature]
        }
      });

    } catch (error) {
      logError(fastify.log, 'Error disabling feature:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la désactivation de la fonctionnalité'
      });
    }
  });
}
