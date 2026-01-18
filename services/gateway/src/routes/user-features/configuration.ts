/**
 * Routes for user configuration management
 *
 * @version 1.0.0
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { ConfigurationBody, errorResponseSchema } from './types';

/**
 * Register configuration-related routes
 */
export async function registerConfigurationRoutes(fastify: FastifyInstance) {
  /**
   * GET /user-features/configuration
   * Get user configuration (language, formats, retention, etc.)
   */
  fastify.get('/user-features/configuration', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'Get user configuration for translation and audio features',
      tags: ['users', 'features'],
      summary: 'Get user configuration',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                targetLanguage: { type: 'string' },
                transcriptionSource: { type: 'string', enum: ['auto', 'mobile', 'server'] },
                translatedAudioFormat: { type: 'string', enum: ['mp3', 'wav', 'ogg'] },
                dataRetentionDays: { type: 'number' },
                voiceDataRetentionDays: { type: 'number' },
                // Voice Cloning Parameters
                voiceCloningExaggeration: { type: 'number' },
                voiceCloningCfgWeight: { type: 'number' },
                voiceCloningTemperature: { type: 'number' },
                voiceCloningTopP: { type: 'number' },
                voiceCloningQualityPreset: { type: 'string', enum: ['fast', 'balanced', 'high_quality'] }
              }
            }
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

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: {
          customDestinationLanguage: true,
          regionalLanguage: true,
          systemLanguage: true,
          userFeature: {
            select: {
              transcriptionSource: true,
              translatedAudioFormat: true,
              dataRetentionDays: true,
              voiceDataRetentionDays: true,
              // Voice Cloning Parameters
              voiceCloningExaggeration: true,
              voiceCloningCfgWeight: true,
              voiceCloningTemperature: true,
              voiceCloningTopP: true,
              voiceCloningQualityPreset: true
            }
          }
        }
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      return reply.send({
        success: true,
        data: {
          targetLanguage: user.customDestinationLanguage || user.regionalLanguage || user.systemLanguage || 'en',
          transcriptionSource: user.userFeature?.transcriptionSource || 'auto',
          translatedAudioFormat: user.userFeature?.translatedAudioFormat || 'mp3',
          dataRetentionDays: user.userFeature?.dataRetentionDays || 365,
          voiceDataRetentionDays: user.userFeature?.voiceDataRetentionDays || 180,
          // Voice Cloning Parameters
          voiceCloningExaggeration: user.userFeature?.voiceCloningExaggeration ?? 0.5,
          voiceCloningCfgWeight: user.userFeature?.voiceCloningCfgWeight ?? 0.5,
          voiceCloningTemperature: user.userFeature?.voiceCloningTemperature ?? 1.0,
          voiceCloningTopP: user.userFeature?.voiceCloningTopP ?? 0.9,
          voiceCloningQualityPreset: user.userFeature?.voiceCloningQualityPreset || 'balanced'
        }
      });

    } catch (error) {
      logError(fastify.log, 'Error fetching user configuration:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la récupération de la configuration'
      });
    }
  });

  /**
   * PUT /user-features/configuration
   * Update user configuration
   */
  fastify.put<{ Body: ConfigurationBody }>('/user-features/configuration', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'Update user configuration for translation and audio features',
      tags: ['users', 'features'],
      summary: 'Update user configuration',
      body: {
        type: 'object',
        properties: {
          customDestinationLanguage: { type: 'string', nullable: true },
          transcriptionSource: { type: 'string', enum: ['auto', 'mobile', 'server'] },
          translatedAudioFormat: { type: 'string', enum: ['mp3', 'wav', 'ogg'] },
          dataRetentionDays: { type: 'number', minimum: 30, maximum: 730 },
          voiceDataRetentionDays: { type: 'number', minimum: 30, maximum: 365 },
          // Voice Cloning Parameters
          voiceCloningExaggeration: { type: 'number', minimum: 0, maximum: 1 },
          voiceCloningCfgWeight: { type: 'number', minimum: 0, maximum: 1 },
          voiceCloningTemperature: { type: 'number', minimum: 0.1, maximum: 2 },
          voiceCloningTopP: { type: 'number', minimum: 0, maximum: 1 },
          voiceCloningQualityPreset: { type: 'string', enum: ['fast', 'balanced', 'high_quality'] }
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
                updatedFields: { type: 'array', items: { type: 'string' } }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Body: ConfigurationBody }>, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      const {
        customDestinationLanguage,
        transcriptionSource,
        translatedAudioFormat,
        dataRetentionDays,
        voiceDataRetentionDays,
        // Voice Cloning Parameters
        voiceCloningExaggeration,
        voiceCloningCfgWeight,
        voiceCloningTemperature,
        voiceCloningTopP,
        voiceCloningQualityPreset
      } = request.body;

      const updateData: Record<string, any> = {};
      const updatedFields: string[] = [];

      if (customDestinationLanguage !== undefined) {
        updateData.customDestinationLanguage = customDestinationLanguage || null;
        updatedFields.push('customDestinationLanguage');
      }

      if (transcriptionSource !== undefined) {
        if (!['auto', 'mobile', 'server'].includes(transcriptionSource)) {
          return reply.status(400).send({
            success: false,
            message: 'transcriptionSource invalide (auto, mobile, server)'
          });
        }
        updateData.transcriptionSource = transcriptionSource;
        updatedFields.push('transcriptionSource');
      }

      if (translatedAudioFormat !== undefined) {
        if (!['mp3', 'wav', 'ogg'].includes(translatedAudioFormat)) {
          return reply.status(400).send({
            success: false,
            message: 'translatedAudioFormat invalide (mp3, wav, ogg)'
          });
        }
        updateData.translatedAudioFormat = translatedAudioFormat;
        updatedFields.push('translatedAudioFormat');
      }

      if (dataRetentionDays !== undefined) {
        if (dataRetentionDays < 30 || dataRetentionDays > 730) {
          return reply.status(400).send({
            success: false,
            message: 'dataRetentionDays doit être entre 30 et 730 jours'
          });
        }
        updateData.dataRetentionDays = dataRetentionDays;
        updatedFields.push('dataRetentionDays');
      }

      if (voiceDataRetentionDays !== undefined) {
        if (voiceDataRetentionDays < 30 || voiceDataRetentionDays > 365) {
          return reply.status(400).send({
            success: false,
            message: 'voiceDataRetentionDays doit être entre 30 et 365 jours'
          });
        }
        updateData.voiceDataRetentionDays = voiceDataRetentionDays;
        updatedFields.push('voiceDataRetentionDays');
      }

      // Voice Cloning Parameters
      if (voiceCloningExaggeration !== undefined) {
        if (voiceCloningExaggeration < 0 || voiceCloningExaggeration > 1) {
          return reply.status(400).send({
            success: false,
            message: 'voiceCloningExaggeration doit être entre 0 et 1'
          });
        }
        updateData.voiceCloningExaggeration = voiceCloningExaggeration;
        updatedFields.push('voiceCloningExaggeration');
      }

      if (voiceCloningCfgWeight !== undefined) {
        if (voiceCloningCfgWeight < 0 || voiceCloningCfgWeight > 1) {
          return reply.status(400).send({
            success: false,
            message: 'voiceCloningCfgWeight doit être entre 0 et 1'
          });
        }
        updateData.voiceCloningCfgWeight = voiceCloningCfgWeight;
        updatedFields.push('voiceCloningCfgWeight');
      }

      if (voiceCloningTemperature !== undefined) {
        if (voiceCloningTemperature < 0.1 || voiceCloningTemperature > 2) {
          return reply.status(400).send({
            success: false,
            message: 'voiceCloningTemperature doit être entre 0.1 et 2'
          });
        }
        updateData.voiceCloningTemperature = voiceCloningTemperature;
        updatedFields.push('voiceCloningTemperature');
      }

      if (voiceCloningTopP !== undefined) {
        if (voiceCloningTopP < 0 || voiceCloningTopP > 1) {
          return reply.status(400).send({
            success: false,
            message: 'voiceCloningTopP doit être entre 0 et 1'
          });
        }
        updateData.voiceCloningTopP = voiceCloningTopP;
        updatedFields.push('voiceCloningTopP');
      }

      if (voiceCloningQualityPreset !== undefined) {
        if (!['fast', 'balanced', 'high_quality'].includes(voiceCloningQualityPreset)) {
          return reply.status(400).send({
            success: false,
            message: 'voiceCloningQualityPreset invalide (fast, balanced, high_quality)'
          });
        }
        updateData.voiceCloningQualityPreset = voiceCloningQualityPreset;
        updatedFields.push('voiceCloningQualityPreset');
      }

      if (Object.keys(updateData).length === 0) {
        return reply.status(400).send({
          success: false,
          message: 'Aucun champ à mettre à jour'
        });
      }

      // Séparer les champs User et UserFeature
      const userFields: Record<string, any> = {};
      const userFeatureFields: Record<string, any> = {};

      // customDestinationLanguage est sur User
      if (updateData.customDestinationLanguage !== undefined) {
        userFields.customDestinationLanguage = updateData.customDestinationLanguage;
      }

      // Les autres champs sont sur UserFeature
      if (updateData.transcriptionSource !== undefined) {
        userFeatureFields.transcriptionSource = updateData.transcriptionSource;
      }
      if (updateData.translatedAudioFormat !== undefined) {
        userFeatureFields.translatedAudioFormat = updateData.translatedAudioFormat;
      }
      if (updateData.dataRetentionDays !== undefined) {
        userFeatureFields.dataRetentionDays = updateData.dataRetentionDays;
      }
      if (updateData.voiceDataRetentionDays !== undefined) {
        userFeatureFields.voiceDataRetentionDays = updateData.voiceDataRetentionDays;
      }

      // Voice Cloning Parameters (tous sur UserFeature)
      if (updateData.voiceCloningExaggeration !== undefined) {
        userFeatureFields.voiceCloningExaggeration = updateData.voiceCloningExaggeration;
      }
      if (updateData.voiceCloningCfgWeight !== undefined) {
        userFeatureFields.voiceCloningCfgWeight = updateData.voiceCloningCfgWeight;
      }
      if (updateData.voiceCloningTemperature !== undefined) {
        userFeatureFields.voiceCloningTemperature = updateData.voiceCloningTemperature;
      }
      if (updateData.voiceCloningTopP !== undefined) {
        userFeatureFields.voiceCloningTopP = updateData.voiceCloningTopP;
      }
      if (updateData.voiceCloningQualityPreset !== undefined) {
        userFeatureFields.voiceCloningQualityPreset = updateData.voiceCloningQualityPreset;
      }

      // Mettre à jour User et UserFeature en parallèle
      const promises: Promise<any>[] = [];

      if (Object.keys(userFields).length > 0) {
        promises.push(
          fastify.prisma.user.update({
            where: { id: userId },
            data: userFields
          })
        );
      }

      if (Object.keys(userFeatureFields).length > 0) {
        promises.push(
          fastify.prisma.userFeature.upsert({
            where: { userId },
            update: userFeatureFields,
            create: { userId, ...userFeatureFields }
          })
        );
      }

      await Promise.all(promises);

      return reply.send({
        success: true,
        data: {
          message: 'Configuration mise à jour avec succès',
          updatedFields
        }
      });

    } catch (error) {
      logError(fastify.log, 'Error updating user configuration:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la mise à jour de la configuration'
      });
    }
  });
}
