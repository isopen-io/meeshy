/**
 * Voice Profile Routes
 *
 * API endpoints for voice profile management:
 * - POST /api/voice/profile/consent - Update consent for voice recording
 * - POST /api/voice/profile/register - Register new voice profile (10s min audio)
 * - PUT /api/voice/profile/:profileId - Update existing profile with fingerprint verification
 * - GET /api/voice/profile - Get profile details
 * - DELETE /api/voice/profile - Delete voice profile
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { VoiceProfileService, ConsentRequest, RegisterProfileRequest, UpdateProfileRequest } from '../services/VoiceProfileService';
import { createUnifiedAuthMiddleware, UnifiedAuthContext } from '../middleware/auth';
import { ZMQSingleton } from '../services/ZmqSingleton';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

// Extend FastifyRequest to include auth
declare module 'fastify' {
  interface FastifyRequest {
    auth?: UnifiedAuthContext;
  }
}

export async function voiceProfileRoutes(fastify: FastifyInstance) {
  // Get services from Fastify instance
  const prisma = (fastify as any).prisma;

  if (!prisma) {
    console.error('[VoiceProfile] Missing required service: prisma');
    return;
  }

  // Get ZMQ client from singleton
  const zmqClient = await ZMQSingleton.getInstance();

  const voiceProfileService = new VoiceProfileService(prisma, zmqClient);
  const authMiddleware = createUnifiedAuthMiddleware(prisma, { requireAuth: true, allowAnonymous: false });

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSENT ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /consent - Update voice consent
   */
  fastify.post('/consent', {
    preHandler: authMiddleware,
    schema: {
      description: 'Update user voice recording and cloning consent. GDPR compliant consent management. Recording consent is required for voice profile registration. Cloning consent is required for voice translation features. Age verification can be provided via birthDate for minors (affects expiration).',
      tags: ['voice-profile'],
      summary: 'Update voice consent',
      body: {
        type: 'object',
        required: ['voiceRecordingConsent'],
        properties: {
          voiceRecordingConsent: {
            type: 'boolean',
            description: 'Consent for voice recording and storage. Required for profile creation.'
          },
          voiceCloningConsent: {
            type: 'boolean',
            description: 'Consent for voice cloning and synthesis. Optional, enables voice translation features.'
          },
          birthDate: {
            type: 'string',
            format: 'date',
            description: 'User birth date (YYYY-MM-DD) for age verification. Profiles for minors (<18) have shorter expiration (60 days vs 90 days).'
          }
        }
      },
      response: {
        200: {
          description: 'Consent updated successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                voiceRecordingConsentAt: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Timestamp of voice recording consent'
                },
                voiceCloningEnabledAt: {
                  type: 'string',
                  format: 'date-time',
                  nullable: true,
                  description: 'Timestamp of voice cloning consent (null if not consented)'
                },
                ageVerificationConsentAt: {
                  type: 'string',
                  format: 'date-time',
                  nullable: true,
                  description: 'Timestamp of age verification (null if not provided)'
                }
              }
            }
          }
        },
        400: {
          description: 'Bad request - invalid consent data',
          ...errorResponseSchema
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = request.auth;
    if (!auth?.isAuthenticated || !auth.registeredUser) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const consent = request.body as ConsentRequest;
    const result = await voiceProfileService.updateConsent(auth.registeredUser.id, consent);

    if (!result.success) {
      return reply.status(400).send(result);
    }

    return reply.send(result);
  });

  /**
   * GET /consent - Get consent status
   */
  fastify.get('/consent', {
    preHandler: authMiddleware,
    schema: {
      description: 'Retrieve the current user\'s voice consent status. Returns all consent timestamps including voice recording, voice cloning, and age verification. All timestamps are nullable if consent has not been given.',
      tags: ['voice-profile'],
      summary: 'Get consent status',
      response: {
        200: {
          description: 'Consent status retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                voiceRecordingConsentAt: {
                  type: 'string',
                  format: 'date-time',
                  nullable: true,
                  description: 'Timestamp when user consented to voice recording (null if not consented)'
                },
                voiceCloningEnabledAt: {
                  type: 'string',
                  format: 'date-time',
                  nullable: true,
                  description: 'Timestamp when user consented to voice cloning (null if not consented)'
                },
                ageVerificationConsentAt: {
                  type: 'string',
                  format: 'date-time',
                  nullable: true,
                  description: 'Timestamp when user provided age verification (null if not provided)'
                }
              }
            }
          }
        },
        400: {
          description: 'Bad request',
          ...errorResponseSchema
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = request.auth;
    if (!auth?.isAuthenticated || !auth.registeredUser) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const result = await voiceProfileService.getConsentStatus(auth.registeredUser.id);

    if (!result.success) {
      return reply.status(400).send(result);
    }

    return reply.send(result);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE REGISTRATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /register - Register new voice profile
   * Requires minimum 10 seconds of audio
   */
  fastify.post('/register', {
    preHandler: authMiddleware,
    schema: {
      description: 'Register a new voice profile for the authenticated user. Requires minimum 10 seconds of clear audio for quality analysis. User must have voice recording consent enabled before registration. The audio is analyzed to extract voice characteristics, quality score, and acoustic fingerprint. Profile expires after 90 days (60 days for minors).',
      tags: ['voice-profile'],
      summary: 'Register new voice profile',
      body: {
        type: 'object',
        required: ['audioData', 'audioFormat'],
        properties: {
          audioData: {
            type: 'string',
            minLength: 100,
            description: 'Base64 encoded audio data. Must contain at least 10 seconds of clear speech for accurate voice profiling.'
          },
          audioFormat: {
            type: 'string',
            enum: ['wav', 'mp3', 'ogg', 'webm', 'm4a'],
            description: 'Audio format of the provided data. WAV is recommended for best quality.'
          }
        }
      },
      response: {
        201: {
          description: 'Voice profile registered successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                profileId: { type: 'string', description: 'Unique voice profile identifier' },
                qualityScore: {
                  type: 'number',
                  description: 'Voice quality score (0-100). Higher is better. Minimum 50 recommended for cloning.',
                  example: 85
                },
                audioDurationMs: { type: 'number', description: 'Duration of analyzed audio in milliseconds', example: 12500 },
                needsCalibration: {
                  type: 'boolean',
                  description: 'Whether additional audio samples are recommended for better quality',
                  example: false
                },
                expiresAt: {
                  type: 'string',
                  format: 'date-time',
                  nullable: true,
                  description: 'Profile expiration date (90 days for adults, 60 days for minors)'
                }
              }
            }
          }
        },
        400: {
          description: 'Bad request - audio too short, invalid format, or poor quality',
          ...errorResponseSchema
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - voice recording consent required',
          ...errorResponseSchema
        },
        409: {
          description: 'Conflict - voice profile already exists for this user',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = request.auth;
    if (!auth?.isAuthenticated || !auth.registeredUser) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const registerRequest = request.body as RegisterProfileRequest;
    const result = await voiceProfileService.registerProfile(auth.registeredUser.id, registerRequest);

    if (!result.success) {
      const statusCode = result.errorCode === 'CONSENT_REQUIRED' ? 403 :
                         result.errorCode === 'PROFILE_EXISTS' ? 409 : 400;
      return reply.status(statusCode).send(result);
    }

    return reply.status(201).send(result);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE UPDATE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * PUT /:profileId - Update existing profile
   * Requires fingerprint verification (voice match)
   */
  fastify.put('/:profileId', {
    preHandler: authMiddleware,
    schema: {
      description: 'Update an existing voice profile with new audio samples. Performs acoustic fingerprint verification to ensure the new audio matches the stored voice profile. This prevents profile hijacking and ensures voice consistency. The profile quality score and characteristics are updated based on the new audio.',
      tags: ['voice-profile'],
      summary: 'Update voice profile',
      params: {
        type: 'object',
        required: ['profileId'],
        properties: {
          profileId: {
            type: 'string',
            minLength: 1,
            description: 'Voice profile unique identifier'
          }
        }
      },
      body: {
        type: 'object',
        required: ['audioData', 'audioFormat'],
        properties: {
          audioData: {
            type: 'string',
            minLength: 100,
            description: 'Base64 encoded audio data. Must match the existing voice profile fingerprint.'
          },
          audioFormat: {
            type: 'string',
            enum: ['wav', 'mp3', 'ogg', 'webm', 'm4a'],
            description: 'Audio format of the provided data'
          }
        }
      },
      response: {
        200: {
          description: 'Voice profile updated successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                profileId: { type: 'string', description: 'Voice profile identifier' },
                qualityScore: {
                  type: 'number',
                  description: 'Updated voice quality score (0-100)',
                  example: 88
                },
                audioDurationMs: { type: 'number', description: 'Total duration of analyzed audio in milliseconds' },
                version: {
                  type: 'number',
                  description: 'Profile version number (incremented on each update)',
                  example: 2
                },
                updatedAt: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Timestamp of the update'
                }
              }
            }
          }
        },
        400: {
          description: 'Bad request - invalid audio or verification failed',
          ...errorResponseSchema
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - voice fingerprint mismatch or unauthorized access',
          ...errorResponseSchema
        },
        404: {
          description: 'Voice profile not found',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { profileId: string } }>, reply: FastifyReply) => {
    const auth = request.auth;
    if (!auth?.isAuthenticated || !auth.registeredUser) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const updateRequest = request.body as UpdateProfileRequest;
    const result = await voiceProfileService.updateProfile(auth.registeredUser.id, updateRequest);

    if (!result.success) {
      const statusCode = result.errorCode === 'PROFILE_NOT_FOUND' ? 404 :
                         result.errorCode === 'PROFILE_MISMATCH' ? 403 : 400;
      return reply.status(statusCode).send(result);
    }

    return reply.send(result);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE RETRIEVAL
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET / - Get current user's voice profile
   */
  fastify.get('/', {
    preHandler: authMiddleware,
    schema: {
      description: 'Retrieve the authenticated user\'s voice profile details including quality metrics, audio characteristics, version, and expiration. Returns comprehensive information about the profile status and quality indicators. Audio characteristics are returned as a structured object for voice cloning engines.',
      tags: ['voice-profile'],
      summary: 'Get voice profile details',
      response: {
        200: {
          description: 'Voice profile retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                profileId: { type: 'string', description: 'Voice profile unique identifier' },
                userId: { type: 'string', description: 'User ID who owns this profile' },
                qualityScore: {
                  type: 'number',
                  description: 'Voice quality score (0-100). Score ≥50 recommended for cloning, ≥70 for production use.',
                  example: 85
                },
                audioDurationMs: {
                  type: 'number',
                  description: 'Total duration of analyzed audio in milliseconds. Minimum 10,000ms (10s) required.',
                  example: 12500
                },
                audioCount: {
                  type: 'number',
                  description: 'Number of audio samples in the profile',
                  example: 1
                },
                voiceCharacteristics: {
                  type: 'object',
                  nullable: true,
                  description: 'Acoustic features and voice characteristics extracted from analysis (JSON object)',
                  additionalProperties: true
                },
                signatureShort: {
                  type: 'string',
                  nullable: true,
                  description: 'Compact acoustic fingerprint for fast voice matching'
                },
                version: {
                  type: 'number',
                  description: 'Profile version number (incremented on updates)',
                  example: 1
                },
                createdAt: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Profile creation timestamp'
                },
                updatedAt: {
                  type: 'string',
                  format: 'date-time',
                  description: 'Last update timestamp'
                },
                expiresAt: {
                  type: 'string',
                  format: 'date-time',
                  nullable: true,
                  description: 'Profile expiration date (90 days for adults, 60 days for minors)'
                },
                needsCalibration: {
                  type: 'boolean',
                  description: 'Whether additional audio samples are recommended for improved quality',
                  example: false
                },
                consentStatus: {
                  type: 'object',
                  description: 'User consent timestamps',
                  properties: {
                    voiceRecordingConsentAt: {
                      type: 'string',
                      format: 'date-time',
                      nullable: true
                    },
                    voiceCloningEnabledAt: {
                      type: 'string',
                      format: 'date-time',
                      nullable: true
                    },
                    ageVerificationConsentAt: {
                      type: 'string',
                      format: 'date-time',
                      nullable: true
                    }
                  }
                }
              }
            }
          }
        },
        400: {
          description: 'Bad request',
          ...errorResponseSchema
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        404: {
          description: 'Voice profile not found',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = request.auth;
    if (!auth?.isAuthenticated || !auth.registeredUser) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const result = await voiceProfileService.getProfile(auth.registeredUser.id);

    if (!result.success) {
      const statusCode = result.errorCode === 'PROFILE_NOT_FOUND' ? 404 : 400;
      return reply.status(statusCode).send(result);
    }

    return reply.send(result);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE DELETION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * DELETE / - Delete voice profile and revoke consent
   */
  fastify.delete('/', {
    preHandler: authMiddleware,
    schema: {
      description: 'Permanently delete the user\'s voice profile and revoke all voice-related consents. This removes all stored audio characteristics, fingerprints, and associated data. User consent flags are reset to null. This action is irreversible and requires re-registration to create a new profile.',
      tags: ['voice-profile'],
      summary: 'Delete voice profile',
      response: {
        200: {
          description: 'Voice profile deleted successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: {
                  type: 'string',
                  example: 'Voice profile deleted and consents revoked'
                },
                deletedProfileId: {
                  type: 'string',
                  description: 'ID of the deleted profile'
                }
              }
            }
          }
        },
        400: {
          description: 'Bad request',
          ...errorResponseSchema
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = request.auth;
    if (!auth?.isAuthenticated || !auth.registeredUser) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const result = await voiceProfileService.deleteProfile(auth.registeredUser.id);

    if (!result.success) {
      return reply.status(400).send(result);
    }

    return reply.send(result);
  });

  console.log('[VoiceProfile] Routes registered: /consent, /register, /:profileId, /, DELETE /');
}
