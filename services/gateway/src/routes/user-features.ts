/**
 * Routes pour la gestion des fonctionnalités et consentements utilisateur (GDPR)
 *
 * Pattern: DateTime? != null signifie activé/consenti avec timestamp d'audit
 *
 * Routes:
 * - GET /user-features - Get complete feature status
 * - GET /user-features/validate/:feature - Validate if a feature can be used
 * - POST /user-features/:feature/enable - Enable a feature
 * - POST /user-features/:feature/disable - Disable a feature
 * - POST /user-features/consent/:consentType - Grant consent
 * - DELETE /user-features/consent/:consentType - Revoke consent
 * - GET /user-features/configuration - Get user configuration (language, formats, etc.)
 * - PUT /user-features/configuration - Update user configuration
 *
 * @version 1.0.0
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../utils/logger';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { UserFeaturesService, UserFeatureStatus } from '../services/UserFeaturesService';

interface FeatureParams {
  feature: string;
}

interface ConsentParams {
  consentType: string;
}

interface ConfigurationBody {
  customDestinationLanguage?: string;
  transcriptionSource?: 'auto' | 'mobile' | 'server';
  translatedAudioFormat?: 'mp3' | 'wav' | 'ogg';
  dataRetentionDays?: number;
  voiceDataRetentionDays?: number;
}

interface AgeVerificationBody {
  birthDate: string; // ISO date string
}

// Liste des features activables
const ACTIVATABLE_FEATURES = [
  // Text Translation
  'textTranslationEnabledAt',
  // Audio Transcription
  'audioTranscriptionEnabledAt',
  'speakerDiarizationEnabledAt',
  // Audio Translation
  'audioTranslationEnabledAt',
  'translatedAudioGenerationEnabledAt',
  // Voice Cloning
  'voiceCloningEnabledAt',
  'allowOthersCloneMyVoiceAt',
  // Attachments
  'imageTextTranslationEnabledAt',
  'documentTranslationEnabledAt',
  'videoSubtitleTranslationEnabledAt',
  // Playback
  'autoplayAudioEnabledAt',
  'autoplayTranslatedAudioEnabledAt',
  'preferTranslatedAudioAt',
  // Data management
  'autoDeleteExpiredDataAt',
];

// Liste des consentements
const CONSENT_TYPES = [
  'dataProcessingConsentAt',
  'voiceDataConsentAt',
  'voiceProfileConsentAt',
  'voiceCloningConsentAt',
  'thirdPartyServicesConsentAt',
];

// Feature status response schema
const featureStatusResponseSchema = {
  type: 'object',
  properties: {
    hasDataProcessingConsent: { type: 'boolean' },
    hasVoiceDataConsent: { type: 'boolean' },
    hasVoiceProfileConsent: { type: 'boolean' },
    hasVoiceCloningConsent: { type: 'boolean' },
    hasThirdPartyServicesConsent: { type: 'boolean' },
    isAgeVerified: { type: 'boolean' },
    canTranslateText: { type: 'boolean' },
    canTranscribeAudio: { type: 'boolean' },
    canUseSpeakerDiarization: { type: 'boolean' },
    canTranslateAudio: { type: 'boolean' },
    canGenerateTranslatedAudio: { type: 'boolean' },
    canUseVoiceCloning: { type: 'boolean' },
    canAllowOthersCloneVoice: { type: 'boolean' },
    isVoiceProfileExpired: { type: 'boolean' },
    canTranslateImageText: { type: 'boolean' },
    canTranslateDocuments: { type: 'boolean' },
    canTranslateVideoSubtitles: { type: 'boolean' },
    hasAutoplayAudio: { type: 'boolean' },
    hasAutoplayTranslatedAudio: { type: 'boolean' },
    prefersTranslatedAudio: { type: 'boolean' },
  }
} as const;

export default async function userFeaturesRoutes(fastify: FastifyInstance) {
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
      if (!ACTIVATABLE_FEATURES.includes(feature)) {
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
      if (!ACTIVATABLE_FEATURES.includes(feature)) {
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

  /**
   * POST /user-features/consent/:consentType
   * Grant a GDPR consent
   */
  fastify.post<{ Params: ConsentParams }>('/user-features/consent/:consentType', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'Grant a GDPR consent. Records the timestamp for audit trail.',
      tags: ['users', 'features', 'gdpr'],
      summary: 'Grant consent',
      params: {
        type: 'object',
        required: ['consentType'],
        properties: {
          consentType: {
            type: 'string',
            enum: CONSENT_TYPES,
            description: 'Type of consent to grant'
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
                consentedAt: { type: 'string', format: 'date-time' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: ConsentParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      const { consentType } = request.params;

      if (!CONSENT_TYPES.includes(consentType)) {
        return reply.status(400).send({
          success: false,
          message: `Type de consentement inconnu: ${consentType}. Types disponibles: ${CONSENT_TYPES.join(', ')}`
        });
      }

      // Utiliser enableFeature car les consentements suivent le même pattern
      const result = await userFeaturesService.enableFeature(userId, consentType);

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          message: result.error
        });
      }

      const consentedAt = new Date().toISOString();

      return reply.send({
        success: true,
        data: {
          message: `Consentement '${consentType}' accordé avec succès`,
          consentedAt
        }
      });

    } catch (error) {
      logError(fastify.log, 'Error granting consent:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de l\'enregistrement du consentement'
      });
    }
  });

  /**
   * DELETE /user-features/consent/:consentType
   * Revoke a GDPR consent (cascades to dependent features)
   */
  fastify.delete<{ Params: ConsentParams }>('/user-features/consent/:consentType', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'Revoke a GDPR consent. This will cascade and disable all dependent features.',
      tags: ['users', 'features', 'gdpr'],
      summary: 'Revoke consent',
      params: {
        type: 'object',
        required: ['consentType'],
        properties: {
          consentType: {
            type: 'string',
            enum: CONSENT_TYPES,
            description: 'Type of consent to revoke'
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
  }, async (request: FastifyRequest<{ Params: ConsentParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      const { consentType } = request.params;

      if (!CONSENT_TYPES.includes(consentType)) {
        return reply.status(400).send({
          success: false,
          message: `Type de consentement inconnu: ${consentType}`
        });
      }

      // disableFeature gère automatiquement le cascade
      const result = await userFeaturesService.disableFeature(userId, consentType);

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          message: result.error
        });
      }

      return reply.send({
        success: true,
        data: {
          message: `Consentement '${consentType}' révoqué avec succès`,
          disabledFeatures: result.disabledFeatures || [consentType]
        }
      });

    } catch (error) {
      logError(fastify.log, 'Error revoking consent:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la révocation du consentement'
      });
    }
  });

  /**
   * POST /user-features/age-verification
   * Verify user age with birth date
   */
  fastify.post<{ Body: AgeVerificationBody }>('/user-features/age-verification', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'Verify user age by providing birth date. Required for certain features.',
      tags: ['users', 'features', 'gdpr'],
      summary: 'Verify age',
      body: {
        type: 'object',
        required: ['birthDate'],
        properties: {
          birthDate: {
            type: 'string',
            format: 'date',
            description: 'Birth date in ISO format (YYYY-MM-DD)'
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
                isAdult: { type: 'boolean' },
                verifiedAt: { type: 'string', format: 'date-time' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Body: AgeVerificationBody }>, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          message: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      const { birthDate } = request.body;

      // Parse and validate birth date
      const birthDateParsed = new Date(birthDate);
      if (isNaN(birthDateParsed.getTime())) {
        return reply.status(400).send({
          success: false,
          message: 'Date de naissance invalide'
        });
      }

      // Calculate age
      const today = new Date();
      let age = today.getFullYear() - birthDateParsed.getFullYear();
      const monthDiff = today.getMonth() - birthDateParsed.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDateParsed.getDate())) {
        age--;
      }

      const isAdult = age >= 18;
      const now = new Date();

      // Update user birthDate
      await fastify.prisma.user.update({
        where: { id: userId },
        data: {
          birthDate: birthDateParsed
        }
      });

      // Update UserFeature ageVerifiedAt
      await fastify.prisma.userFeature.upsert({
        where: { userId },
        update: { ageVerifiedAt: isAdult ? now : null },
        create: { userId, ageVerifiedAt: isAdult ? now : null }
      });

      return reply.send({
        success: true,
        data: {
          message: isAdult
            ? 'Âge vérifié avec succès - utilisateur majeur'
            : 'Âge vérifié - utilisateur mineur (certaines fonctionnalités restreintes)',
          isAdult,
          verifiedAt: now.toISOString()
        }
      });

    } catch (error) {
      logError(fastify.log, 'Error verifying age:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la vérification de l\'âge'
      });
    }
  });

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
                voiceDataRetentionDays: { type: 'number' }
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
              voiceDataRetentionDays: true
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
          voiceDataRetentionDays: user.userFeature?.voiceDataRetentionDays || 180
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
          voiceDataRetentionDays: { type: 'number', minimum: 30, maximum: 365 }
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
        voiceDataRetentionDays
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

      if (Object.keys(updateData).length === 0) {
        return reply.status(400).send({
          success: false,
          message: 'Aucun champ à mettre à jour'
        });
      }

      await fastify.prisma.user.update({
        where: { id: userId },
        data: updateData
      });

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

  /**
   * GET /user-features/consents
   * Get all consent statuses with timestamps
   */
  fastify.get('/user-features/consents', {
    preValidation: [fastify.authenticate],
    schema: {
      description: 'Get all GDPR consent statuses with their timestamps',
      tags: ['users', 'features', 'gdpr'],
      summary: 'Get all consents',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                dataProcessingConsent: {
                  type: 'object',
                  properties: {
                    granted: { type: 'boolean' },
                    grantedAt: { type: 'string', format: 'date-time', nullable: true }
                  }
                },
                voiceDataConsent: {
                  type: 'object',
                  properties: {
                    granted: { type: 'boolean' },
                    grantedAt: { type: 'string', format: 'date-time', nullable: true }
                  }
                },
                voiceProfileConsent: {
                  type: 'object',
                  properties: {
                    granted: { type: 'boolean' },
                    grantedAt: { type: 'string', format: 'date-time', nullable: true }
                  }
                },
                voiceCloningConsent: {
                  type: 'object',
                  properties: {
                    granted: { type: 'boolean' },
                    grantedAt: { type: 'string', format: 'date-time', nullable: true }
                  }
                },
                thirdPartyServicesConsent: {
                  type: 'object',
                  properties: {
                    granted: { type: 'boolean' },
                    grantedAt: { type: 'string', format: 'date-time', nullable: true }
                  }
                },
                ageVerified: {
                  type: 'object',
                  properties: {
                    verified: { type: 'boolean' },
                    verifiedAt: { type: 'string', format: 'date-time', nullable: true },
                    birthDate: { type: 'string', format: 'date', nullable: true }
                  }
                }
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

      // Query User for birthDate (stays on User model)
      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { birthDate: true }
      });

      if (!user) {
        return reply.status(404).send({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      // Query or create UserFeature for consent fields
      let userFeature = await fastify.prisma.userFeature.findUnique({
        where: { userId },
        select: {
          dataProcessingConsentAt: true,
          voiceDataConsentAt: true,
          voiceProfileConsentAt: true,
          voiceCloningConsentAt: true,
          thirdPartyServicesConsentAt: true,
          ageVerifiedAt: true
        }
      });

      // Create UserFeature if doesn't exist
      if (!userFeature) {
        userFeature = await fastify.prisma.userFeature.create({
          data: { userId },
          select: {
            dataProcessingConsentAt: true,
            voiceDataConsentAt: true,
            voiceProfileConsentAt: true,
            voiceCloningConsentAt: true,
            thirdPartyServicesConsentAt: true,
            ageVerifiedAt: true
          }
        });
      }

      return reply.send({
        success: true,
        data: {
          dataProcessingConsent: {
            granted: userFeature.dataProcessingConsentAt != null,
            grantedAt: userFeature.dataProcessingConsentAt?.toISOString() || null
          },
          voiceDataConsent: {
            granted: userFeature.voiceDataConsentAt != null,
            grantedAt: userFeature.voiceDataConsentAt?.toISOString() || null
          },
          voiceProfileConsent: {
            granted: userFeature.voiceProfileConsentAt != null,
            grantedAt: userFeature.voiceProfileConsentAt?.toISOString() || null
          },
          voiceCloningConsent: {
            granted: userFeature.voiceCloningConsentAt != null,
            grantedAt: userFeature.voiceCloningConsentAt?.toISOString() || null
          },
          thirdPartyServicesConsent: {
            granted: userFeature.thirdPartyServicesConsentAt != null,
            grantedAt: userFeature.thirdPartyServicesConsentAt?.toISOString() || null
          },
          ageVerified: {
            verified: userFeature.ageVerifiedAt != null,
            verifiedAt: userFeature.ageVerifiedAt?.toISOString() || null,
            birthDate: user.birthDate?.toISOString().split('T')[0] || null
          }
        }
      });

    } catch (error) {
      logError(fastify.log, 'Error fetching consents:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la récupération des consentements'
      });
    }
  });
}
