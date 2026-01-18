/**
 * Routes for GDPR consent and age verification management
 *
 * @version 1.0.0
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { UserFeaturesService } from '../../services/UserFeaturesService';
import {
  ConsentParams,
  AgeVerificationBody,
  CONSENT_TYPES,
  errorResponseSchema
} from './types';

/**
 * Register consent and age verification routes
 */
export async function registerConsentsRoutes(fastify: FastifyInstance) {
  const userFeaturesService = new UserFeaturesService(fastify.prisma);

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
            enum: CONSENT_TYPES as unknown as string[],
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

      if (!CONSENT_TYPES.includes(consentType as any)) {
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
            enum: CONSENT_TYPES as unknown as string[],
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

      if (!CONSENT_TYPES.includes(consentType as any)) {
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

      // Update user birthDate and UserFeature ageVerifiedAt in parallel
      await Promise.all([
        fastify.prisma.user.update({
          where: { id: userId },
          data: { birthDate: birthDateParsed }
        }),
        fastify.prisma.userFeature.upsert({
          where: { userId },
          update: { ageVerifiedAt: isAdult ? now : null },
          create: { userId, ageVerifiedAt: isAdult ? now : null }
        })
      ]);

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

      // Query User et UserFeature en parallèle
      const [user, userFeature] = await Promise.all([
        fastify.prisma.user.findUnique({
          where: { id: userId },
          select: { birthDate: true }
        }),
        fastify.prisma.userFeature.findUnique({
          where: { userId },
          select: {
            dataProcessingConsentAt: true,
            voiceDataConsentAt: true,
            voiceProfileConsentAt: true,
            voiceCloningConsentAt: true,
            thirdPartyServicesConsentAt: true,
            ageVerifiedAt: true
          }
        })
      ]);

      if (!user) {
        return reply.status(404).send({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      // Create UserFeature if doesn't exist
      let finalUserFeature = userFeature;
      if (!finalUserFeature) {
        finalUserFeature = await fastify.prisma.userFeature.create({
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
            granted: finalUserFeature.dataProcessingConsentAt != null,
            grantedAt: finalUserFeature.dataProcessingConsentAt?.toISOString() || null
          },
          voiceDataConsent: {
            granted: finalUserFeature.voiceDataConsentAt != null,
            grantedAt: finalUserFeature.voiceDataConsentAt?.toISOString() || null
          },
          voiceProfileConsent: {
            granted: finalUserFeature.voiceProfileConsentAt != null,
            grantedAt: finalUserFeature.voiceProfileConsentAt?.toISOString() || null
          },
          voiceCloningConsent: {
            granted: finalUserFeature.voiceCloningConsentAt != null,
            grantedAt: finalUserFeature.voiceCloningConsentAt?.toISOString() || null
          },
          thirdPartyServicesConsent: {
            granted: finalUserFeature.thirdPartyServicesConsentAt != null,
            grantedAt: finalUserFeature.thirdPartyServicesConsentAt?.toISOString() || null
          },
          ageVerified: {
            verified: finalUserFeature.ageVerifiedAt != null,
            verifiedAt: finalUserFeature.ageVerifiedAt?.toISOString() || null,
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
